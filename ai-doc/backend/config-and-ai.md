# Backend Config And AI

Last verified: 2026-07-11

## Scope

1. Covers platform config registration, config read/write routes, AI config defaults, and R2 upload config.
2. Service-specific business usage of config should still be documented in service or domain docs.

## Config foundation

1. Platform creates `xstorage.CfgExt` during `PlatForm.Init`.
2. Registered config params are added in `PlatForm.InitCfg()`.
3. Config values are persisted through platform storage, not hardcoded in frontend.
4. Config routes expose filtered reads/writes on top of `CfgExt`.
5. BI D1 Worker values are required bootstrap configuration (`d1_log_worker_endpoint` / `d1_log_worker_token`, with `PLATFORM_D1_LOG_WORKER_*` overrides); they have no production code defaults or legacy API-token fallback.
6. Todone Worker values are service-owned `CfgExt` keys (`todone.db.worker_endpoint` / `todone.db.worker_token`, with `PLATFORM_TODONE_WORKER_*` operational overrides). Both keys are registered for the admin config UI, but the real endpoint has no code default and the token does not migrate from legacy `todone.db.api_token`.

## Config route surface

1. Platform config:
   - `POST /cfg/plat/set`
   - `POST /cfg/plat/get`
2. Service config:
   - `POST /cfg/:svr/set`
   - `POST /cfg/:svr/get`
3. User-scoped service config:
   - `POST /cfg/:svr/:user/set`
   - `POST /cfg/:svr/:user/get`

## Config permission model

1. `POST /cfg/plat/*` requires:
   - `admin`, or
   - `plat.cfg`
2. `POST /cfg/:svr/*` requires one of:
   - `admin`
   - service permission itself (for example `todone`)
   - service cfg permission string (for example `<svr>.cfg`)
3. `POST /cfg/:svr/:user/*` currently has no explicit permission check in gateway code.
4. Because user-scoped config routes are looser than platform/service routes, changes there should be reviewed carefully before reuse.

## Registered platform keys

1. Core platform keys registered in `PlatForm.InitCfg()`:
   - `note.setting`
   - `PLAT.realUrl`
   - `PLAT.outUrl`
   - `PLAT.baseUrl`
   - `auto.news.keys`
   - `PLAT.r2.endpoint`
   - `PLAT.r2.accessKey`
   - `PLAT.r2.secretKey`
   - `PLAT.r2.bucket`
   - `PLAT.r2.web`
2. AI keys are appended by `share.DefaultAIConfigParams()`:
   - `PLAT.openai.base`
   - `PLAT.openai.token`
   - `PLAT.openai.model.cheap`
   - `PLAT.openai.model.fast`
   - `PLAT.openai.model.normal`
   - `PLAT.openai.audio.base`
   - `PLAT.openai.audio.token`
   - `PLAT.openai.audio.model`
   - `PLAT.openai.scene.rewrite`
   - `PLAT.openai.scene.summary`
   - `PLAT.openai.scene.translate`
   - `PLAT.openai.scene.library_review_digest`

## AI config defaults

1. Default model pools are:
   - `cheap`: `gpt-5.4-mini`, `gpt-5.4-nano`
   - `fast`: `gpt-5-chat-latest`
   - `normal`: `gpt-5.4`, `gpt-5-chat-latest`
2. Default scene-to-mode mapping is:
   - `rewrite -> fast`
   - `summary -> cheap`
   - `translate -> cheap`
   - `library_review_digest -> cheap`
3. Default placeholder values for `PLAT.openai.base` and `PLAT.openai.token` are `need input`.
4. Default `PLAT.openai.audio.model` is `gpt-4o-mini-transcribe`; frontend users cannot choose this per request.
5. `PLAT.openai.audio.base` and `PLAT.openai.audio.token` select an optional transcription-only OpenAI-compatible upstream. When both are empty, transcription inherits `PLAT.openai.base` and `PLAT.openai.token`; when only one is configured, transcription fails with `openai.audio provider config incomplete` so credentials are not mixed across upstreams.
6. The reusable AI wrapper in `backend/mian_go_lib/tool/ai/openai.go` now uses the official Go SDK `github.com/openai/openai-go/v3`.
7. The wrapper still sends text requests through the Chat Completions API for compatibility with existing callers and OpenAI-compatible base URLs.
8. The wrapper also exposes audio transcription; callers must pass the model explicitly from the owning config layer.
9. The wrapper is provider-neutral and no longer exposes provider enums or DeepSeek-specific defaults/response cleanup; compatible providers must be configured through `PLAT.openai.base`, `PLAT.openai.model.*`, and the optional `PLAT.openai.audio.*` override.
10. The platform transcription route has a narrow OpenRouter request-format branch pending the broader v2 provider refactor: audio is streamed as Base64 JSON using OpenRouter's `input_audio` contract. The configured Base URL and model are otherwise used verbatim, so OpenRouter requires `https://openrouter.ai/api/v1` and a full model ID such as `openai/gpt-4o-mini-transcribe`. Other providers continue through the official OpenAI SDK multipart transcription path.
11. New provider capability code lives under `backend/mian_go_lib/tool/ai/v2` with Go package name `ai`; it does not replace the existing `tool/ai` wrapper.
12. `OpenAIProvider` in `tool/ai/v2` is for OpenAI-compatible providers only, currently `OpenAI` and `DeepSeek`; model availability is read through the SDK Models API with pagination, while reasoning capability lists are source-type based.
13. `OpenAIProvider.Chat` and `ChatStream` expose plain message chat plus reasoning controls and DeepSeek `thinking`; external tools/functions are intentionally left out of the first v2 chat slice, so `AvailableTools()` returns no callable tools.
14. `tool/ai/v2` provides base agent components and configuration helpers, not an agent-by-ID factory layer: `AgentID` and `ProviderID` are `uint32`, and the package-level singleton stores `ProviderID -> IProvider` and `AgentID -> IAgentSetting`, while callers still create and initialize agents explicitly.
15. `IAgent[S]` is the typed lifecycle surface for v2 agents: `GetID`, `Init`, and `InitWithSetting`; chat/streaming/factory/middleware behavior and provider/setting getters are intentionally outside this interface.
16. `BaseAgent` and `BaseAgentSetting` live in `tool/ai/v2/base_agent.go`; `BaseAgent` is a thin built-in reference implementation composed from public provider binding, generic setting state, and message history components that external agents can also reuse directly. `BaseAgent.Chat(ctx, content)` is stateful per agent instance: it prepends `SysPrompt`, reuses successful user/assistant history, tries `Models` in order as a fallback list, writes history only after a successful response, and returns errors instead of local fallback content. Chat calls on the same `BaseAgent` are serialized, including provider network I/O, to preserve strict history ordering.
17. v2 agent settings use `IAgentSetting` plus reflection helpers for JSON import/export and JSON doc generation; the supported setting surface is exported scalar fields and scalar slices/arrays only, with zero values treated as not configured. Importing zero values is a no-op for existing values, so JSON import cannot clear a previously configured scalar or slice by passing `""`, `0`, `false`, or `[]`.

## AI rewrite endpoint

1. Endpoint: `POST /misc/gpt-rewrite`
2. Required permission:
   - `gpt`, or
   - `admin`
3. Input payload:
   - `content`
4. Runtime steps:
   - load AI config from `CfgExt`
   - validate base/token presence
   - choose mode for `rewrite` scene
   - initialize OpenAI client with configured model pools
   - send rewrite prompt and return rewritten content
5. Common failure signatures:
   - `no permission`
   - `openai config error`
   - `openai.base is empty`
   - `openai.token is empty`
   - `openai init error`
   - `svr error`

## AI Gateway endpoint

1. Endpoint: `POST /misc/ai/run`
2. Required permission:
   - action-specific permission, or
   - `admin`
3. Request payload:
   - `action`: fixed backend allowlisted enum string
   - `payload`: action-specific structured JSON
4. Current action:
   - `library.reviewNotesDigest`
   - permission: `ai` or `admin`
   - scene: `library_review_digest`
   - payload: library item title/category/author/roundName plus current-round note list
   - response: positive points, negative points, and recordable items
   - prompt requires covering every viewpoint from the notes, with no point-count or point-length cap
   - prompt treats notes as possible speech-input text and asks uncertain corrections/guesses to be marked with Chinese parentheses
   - backend returns AI/model/JSON failures directly to frontend instead of generating local fallback content
5. Frontend caller should use `frontend/src/common/aiGateway.ts` so action/payload/response types stay paired.
6. Common failure signatures:
   - `no permission`
   - `unknown ai action`
   - `invalid payload`
   - `empty notes`
   - `openai config error`
   - `openai.base is empty`
   - `openai.token is empty`
   - `openai init error`
   - `svr error`
   - `ai response parse error`

## AI transcription endpoint

1. Endpoint: `POST /misc/ai/transcribe`
2. Required permission:
   - `ai`, or
   - `admin`
3. Request body uses `multipart/form-data`:
   - `file`: required audio file/blob
   - `language`: optional; forwarded as the transcription language hint
   - `prompt`: optional; forwarded as transcription context for the standard OpenAI-compatible SDK path; OpenRouter's generic STT JSON contract does not expose this field, so the narrow OpenRouter branch ignores it
4. Model selection is server-owned:
   - read from `PLAT.openai.audio.model`
   - default: `gpt-4o-mini-transcribe`
   - request-supplied model fields are ignored
5. Provider selection is server-owned:
   - use `PLAT.openai.audio.base` and `PLAT.openai.audio.token` when both are configured
   - otherwise inherit `PLAT.openai.base` and `PLAT.openai.token`
   - reject a partial audio provider override rather than mixing credentials and base URLs
   - OpenRouter Base URLs use the route's Base64 JSON compatibility path; other OpenAI-compatible providers use multipart transcription through the official SDK
6. Backend upload/request guards:
   - max audio upload size is 250 MB
   - prompt is capped at 4000 runes
   - language is capped at 32 bytes
   - upstream transcription call timeout is 10 minutes
7. Response payload:
   - `text`
   - optional `language`
   - optional `duration`
8. Common failure signatures:
   - `no permission`
   - `audio file is required`
   - `audio file is empty`
   - `audio file is too large`
   - `language is too long`
   - `prompt is too long`
   - `openai config error`
   - `openai.audio provider config incomplete`
   - `openai.base is empty`
   - `openai.token is empty`
   - `openai.audio.model is empty`
   - `openai init error`
   - `svr error`
9. An opt-in live provider check is available on macOS. Run `go test -tags live_ai -run '^TestLiveAudioProvider$' -count=1 -v ./platform` from `backend/`; it prompts for the provider URL and reads the API key with terminal echo disabled, generates a temporary WAV fixture, and does not persist credentials.

## Config read behavior in admin flows

1. Config reads use `GetWithFilter`.
2. Platform/service config responses can surface registered defaults before the first explicit save.
3. This is why admin UI can read AI config defaults even when nothing has been saved yet.

## R2 config and upload contract

1. Upload endpoint: `POST /misc/r2-presigned-url`
2. Required permission:
   - `file`, or
   - `admin`
3. Request payload:
   - `fileName`
   - `fileType`
4. Required config keys:
   - `PLAT.r2.endpoint`
   - `PLAT.r2.accessKey`
   - `PLAT.r2.secretKey`
   - `PLAT.r2.bucket`
   - `PLAT.r2.web`
5. Generated object key format:
   - `uploads/<year>/<month>/<day>/<user>/<uuid>/<fileName>`
6. Response payload returns:
   - `UploadURL`
   - `PublicURL`
7. Presigned PUT URL expiry is 15 minutes.
8. Common failure signatures:
   - `no permission`
   - `r2 config error`
   - `r2 params invalid`

## Loading guidance

1. Load this file when the task touches:
   - config defaults or writes
   - admin setting pages
   - AI rewrite behavior
   - R2 upload setup
   - platform/service/user config boundaries
