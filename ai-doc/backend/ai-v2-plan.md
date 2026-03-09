# Backend AI V2 Plan

Last verified: 2026-03-09

## Scope

1. Defines the planned replacement path for the current backend AI wrapper with a new `ai/v2` library.
2. Covers architecture direction, capability targets, phased implementation plan, storage expectations, and verification gates.
3. This is a planning document, not a statement that `ai/v2` already exists in code.

## Current code baseline

1. Current backend AI access is centered in `backend/mian_go_lib/tool/ai/openai.go`.
2. The current wrapper uses `github.com/sashabaranov/go-openai` and exposes a thin `Chat(content string) (string, error)` flow.
3. Production call sites are currently concentrated in:
   - `backend/platform/svr_api.go` for `/misc/gpt-rewrite`
   - `backend/services/auto/mods/day.go` for translation and summary
   - `backend/services/auto/mods/gnews.go` for GNews summarization
4. AI config is currently read through `share.GetAIConfig()` and model pools are selected by `cheap`, `fast`, and `normal` modes.
5. Existing config keys are OpenAI-oriented:
   - `PLAT.openai.base`
   - `PLAT.openai.token`
   - `PLAT.openai.model.cheap`
   - `PLAT.openai.model.fast`
   - `PLAT.openai.model.normal`
   - scene-to-mode mappings for `rewrite`, `summary`, and `translate`

## User decisions already fixed

1. Do not extend the existing AI wrapper in place.
2. Use the official OpenAI Go SDK for new work.
3. Do not preserve DeepSeek compatibility in the new implementation.
4. Create a new `ai/v2` library instead of mutating current `tool/ai`.
5. Target capability growth beyond single-turn text chat:
   - multi-turn conversation
   - session management
   - file upload and file binding
   - tool call support
   - custom tool support

## Problem with the current wrapper

1. The current wrapper is optimized for a single blocking prompt-to-string flow and does not model sessions, tools, uploads, or structured output.
2. Business code currently depends on prompt assembly rather than a reusable conversation abstraction.
3. The current package combines provider concerns and model fallback logic in a way that makes future capability growth harder.
4. The current API surface is too narrow for official SDK features such as `responses`, `conversations`, `files/uploads`, and tool orchestration.

## Target architecture for `ai/v2`

1. `ai/v2` should be a capability layer, not just a transport wrapper.
2. The new library should isolate OpenAI SDK details behind domain-facing services.
3. The architecture should be split into clear modules:
   - `client`: SDK initialization, auth, base URL, timeout, retry, request metadata
   - `service`: chat, session, file, and tool orchestration services
   - `model`: session, message, request, response, and file metadata types
   - `store`: persistence for sessions, messages, tool records, and file references
   - `internal/mapper`: translation between OpenAI SDK objects and local domain types
4. `responses` should be the primary generation path for new flows.
5. Session state should be modeled explicitly rather than rebuilt from ad hoc prompt history.

## Core capability goals

1. Stateless request flow:
   - single-turn rewrite, summary, translate
   - optional structured output
   - streaming-ready design even if initial implementation is non-streaming
2. Stateful session flow:
   - create session
   - append user/assistant/tool messages
   - load recent conversation state
   - compact old history into summary when needed
3. File capability:
   - upload files through official API
   - persist local file metadata
   - bind files to sessions
   - expose file-aware generation flows later
4. Tool capability:
   - register function tools
   - register custom tools
   - control tool visibility by scene or policy
   - execute tool loops until final assistant output is produced
5. Operational capability:
   - token usage capture
   - request logging hooks
   - retry and timeout policy
   - bounded concurrency

## Design principles

1. Preserve a stable local interface even if the official SDK evolves.
2. Keep provider-specific types out of business packages.
3. Separate scene policy from raw model names.
4. Prefer explicit state objects over hidden prompt reconstruction.
5. Treat tools and file references as first-class message inputs, not prompt string hacks.
6. Make dangerous or side-effecting tools opt-in and policy-gated.

## Recommended package shape

1. Proposed location:
   - `backend/mian_go_lib/tool/ai/v2`
2. Proposed package layout:
   - `ai/v2/ai.go`
   - `ai/v2/client/*`
   - `ai/v2/model/*`
   - `ai/v2/service/*`
   - `ai/v2/store/*`
   - `ai/v2/internal/mapper/*`
   - `ai/v2/errors/*`
   - `ai/v2/hooks/*`

## Proposed service surface

1. `ChatService`
   - stateless text or structured generation
2. `SessionService`
   - create, get, list, delete, compact session
3. `MessageService`
   - append and read message history
4. `FileService`
   - upload, bind, list, delete file references
5. `ToolManager`
   - register tools, build request tool specs, execute tool calls, persist tool records
6. `PolicyResolver`
   - map scene to model, timeout, output size, tool allowlist, and session behavior

## Data model expectations

1. Session model should include:
   - local session id
   - remote conversation id when used
   - user id
   - scene
   - model
   - system prompt
   - session summary
   - status
   - timestamps
2. Message model should include:
   - local message id
   - session id
   - role
   - content parts
   - tool call metadata when present
   - token usage when available
   - timestamps
3. File model should include:
   - local file id
   - OpenAI file id
   - file name
   - MIME type
   - size
   - hash
   - purpose
   - bound session ids or join-table relation
   - timestamps
4. Tool call record should include:
   - tool name
   - tool kind
   - normalized input
   - output envelope
   - status
   - latency
   - timestamps

## Storage direction

1. First implementation should use a local store abstraction with a sqlite-backed implementation because the backend already uses sqlite-oriented storage patterns.
2. Store contracts should be separated from OpenAI SDK objects.
3. Session, message, file, and tool-call persistence should be designed so the storage backend can be swapped later.

## Scene policy direction

1. Replace the current `cheap/fast/normal` only model with scene-oriented policy resolution.
2. Each scene policy should be able to define:
   - default model
   - fallback models
   - timeout
   - max output tokens
   - session enabled or disabled
   - files enabled or disabled
   - allowed tools
3. Existing scenes to preserve at first:
   - `rewrite`
   - `summary`
   - `translate`
4. New scenes can be added later without changing business packages if the resolver remains data-driven.

## Tool design direction

1. Support both function tools and custom tools.
2. Function tools should be the default for business operations because they are easier to validate and audit.
3. Custom tools should be reserved for text-heavy or DSL-heavy inputs where JSON argument modeling is a poor fit.
4. Tool execution should be controlled by an orchestration loop rather than business code manually calling tools.
5. Tool definitions should carry:
   - name
   - description
   - tool kind
   - schema or input contract
   - timeout
   - read-only or side-effecting flags
   - policy tags
6. Side-effecting tools should be blocked by default unless the invoking scene explicitly allows them.

## File handling direction

1. File upload should not stop at returning an OpenAI file id.
2. The library should keep local metadata so files can be tracked, deduplicated, and attached to sessions later.
3. File upload flow should include:
   - local hash computation
   - duplicate detection
   - upload
   - metadata persistence
   - optional session binding
4. File-aware prompts should use stored file references rather than ad hoc business-layer conventions.

## Efficiency goals

1. Reuse a long-lived SDK client instead of constructing a new client per request.
2. Add bounded retries only for transient provider failures.
3. Add request-level timeout controls by scene.
4. Track token usage per request and per session.
5. Compact long sessions by summarizing older turns while keeping recent high-fidelity history.
6. Avoid repeated file uploads through hash-based reuse.
7. Limit tool-loop depth and bound parallel read-only tool execution where safe.

## Migration strategy

1. Do not rewrite existing business callers to the raw official SDK.
2. Build `ai/v2` beside the current package.
3. First adopter should be a narrow path with contained blast radius, preferably a new or non-critical AI entrypoint.
4. Existing `tool/ai` remains unchanged until at least one `ai/v2` path is verified.
5. After successful verification, migrate existing entrypoints scene by scene rather than in one large cutover.

## Proposed phased plan

1. Phase 0: design freeze and scaffolding
   - create package skeleton
   - define service interfaces and local models
   - define store interfaces
   - define scene policy interfaces
   - define hook and error contracts
2. Phase 1: minimal stateless generation
   - initialize official SDK client
   - implement stateless `ChatService`
   - support `rewrite`, `summary`, and `translate` scenes
   - add model fallback and timeout policy
   - capture usage metadata
3. Phase 2: session foundation
   - implement session store and message store
   - support create session, append message, load recent history
   - introduce conversation compaction strategy
4. Phase 3: file service
   - implement upload flow
   - persist file metadata
   - support bind/list/delete file references
5. Phase 4: tool orchestration
   - implement tool registry
   - support function tool execution loop
   - add custom tool support
   - persist tool records and errors
6. Phase 5: adoption and migration
   - add one production integration path
   - verify behavior and regressions
   - migrate old callers incrementally

## Verification gates by phase

1. Phase 1
   - direct API verification against configured OpenAI endpoint
   - at least one success case for each preserved scene
   - failure-path verification for missing config and provider errors
2. Phase 2
   - session create/send/read tests
   - long-history compaction test
3. Phase 3
   - real upload verification
   - duplicate-file reuse verification
   - session-file binding verification
4. Phase 4
   - function tool call success path
   - custom tool call success path
   - tool timeout and tool-error propagation checks
5. Phase 5
   - before/after comparison for the migrated entrypoint
   - one adjacent regression path verification

## Risks

1. Official SDK surface can evolve faster than the old thin wrapper, so domain contracts must remain local and explicit.
2. Session and file persistence will add schema and lifecycle complexity that does not exist in the current wrapper.
3. Tool orchestration can create runaway loops or unsafe side effects if policy controls are weak.
4. Existing AI config is model-pool oriented and may need expansion for new scene policies and session behavior.
5. If the first adoption targets a high-traffic path too early, rollback pressure will rise.

## Non-goals for the first implementation

1. No DeepSeek compatibility layer.
2. No in-place retrofit of the old `tool/ai` package.
3. No attempt to migrate every existing caller in the first delivery.
4. No broad tool marketplace; only a registry and execution framework.
5. No assumption that every AI request must be session-based.

## Immediate next steps

1. Create a dedicated feature branch for `ai/v2` work when implementation starts.
2. Finalize the `ai/v2` package skeleton and interface set before writing business integrations.
3. Decide whether session persistence will live in existing storage helpers or in a dedicated sqlite table layer.
4. Decide the first production adopter path for `ai/v2`.
