# Backend Config And AI

Last verified: 2026-07-23

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
2. The active structured AI document is stored as the string-valued `PLAT.ai.config` key and is exposed through typed AI config routes rather than the generic config form.
3. Legacy AI keys are still registered as migration inputs by `share.DefaultAIConfigParams()`:
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

1. `PLAT.ai.config` is a version-2 JSON document with three top-level collections:
   - `providers`: provider connections; each provider has a generated stable internal ID, owns its registered models and credentials, and selects either the `OpenAI` or `DeepSeek` protocol; the admin UI edits only the provider name and keeps the ID hidden
   - `queues`: ordered model-call presets; each queue declares `text` or `stt`, and the first successful item wins
   - `businesses`: five fixed `scene + type + queueID` bindings; only `queueID` is configurable, and transcription uses `transcribe + stt` rather than a dedicated STT field
2. Each registered model has a generated stable provider-local ID, upstream model name, `text` or `stt` type, optional `callProtocol`, and optional reasoning/tool capabilities. The internal ID is persisted for queue references but is not an admin-editable field. An omitted `callProtocol` inherits from the provider protocol plus model type: `OpenAI` maps `text -> OpenAIText` and `stt -> OpenAISTT`, while `DeepSeek` maps text to `DeepSeekText` and has no implicit STT protocol. Per-model overrides support intermediaries whose models use different request formats. Text supports `OpenAIText` and `DeepSeekText`; STT supports exactly `OpenAISTT`, `DashScopeQwen3ASR`, and `DashScopeFunASR`. Protocol selection is explicit and execution never infers it from an upstream model name. Reasoning and tools only apply to `text`. A queue item selects one provider/model pair plus a supported reasoning effort and tool subset, and its model type must match the queue type. DeepSeek text uses the single reasoning-effort surface `none/high/max`: `none` is translated to `thinking.type=disabled` without a `reasoning_effort`, while `high/max` send `thinking.type=enabled` plus the selected `reasoning_effort`. Legacy queue-item `thinking` values are normalized into this representation and omitted on the next save.
3. Structured config reads and writes use:
   - `POST /misc/ai/config/get`
   - `POST /misc/ai/config/set`
   Both require `admin` or `plat.cfg`; writes validate provider protocols, model call protocol/type compatibility, provider/model/queue references, model capability selections, explicit queue/model type equality, the fixed business scene/type set, and business/queue type equality before persistence.
   Queue draft testing uses `POST /misc/ai/config/queue/test` with `multipart/form-data` fields `config`, `queueID`, and either `input` for text or `file` for STT. It has the same permission requirement, does not persist the supplied draft, and returns output plus the winning provider/model and every ordered attempt. Text testing reuses `AIPlatformConfig.RunTextQueueContext`; STT testing and the production transcription endpoint both reuse `webMgr.transcribeQueue`.
4. When no structured document has been saved, `GetAIPlatformConfig` builds an in-memory migration view from the legacy keys. The legacy model pools become `text` queues named `cheap`, `fast`, and `normal`; legacy scene modes become `text` business bindings; legacy audio connection/model values become an `stt` queue plus the `transcribe + stt` business binding. Previously saved version-1 structured documents are also normalized in memory: `chat` becomes `text`, queue types are inferred once from their registered models, and `scenes`/`sttQueueID` become the unified `businesses` list. The migrated view is persisted only when the typed config is saved.
5. Legacy default model pools are:
   - `cheap`: `gpt-5.4-mini`, `gpt-5.4-nano`
   - `fast`: `gpt-5-chat-latest`
   - `normal`: `gpt-5.4`, `gpt-5-chat-latest`
6. Legacy default scene-to-mode mapping is:
   - `rewrite -> fast`
   - `summary -> cheap`
   - `translate -> cheap`
   - `library_review_digest -> cheap`
7. The legacy placeholder values for `PLAT.openai.base` and `PLAT.openai.token` are `need input`; the legacy default STT model is `gpt-4o-mini-transcribe`.
8. Text scene calls use `share.SceneAI`: resolve the `scene + text` business binding, iterate the selected queue in order, resolve the effective model call protocol, construct the matching OpenAI or DeepSeek v2 adapter, register the selected model, validate its capabilities, and return the first non-empty successful response. `OpenAIText` uses the Responses API; `DeepSeekText` uses the Chat Completions API and derives its `thinking` payload from the queue item's unified reasoning effort. Platform rewrite/library digest and Auto summary/translation/news callers use this path.
9. `OpenAIProvider` in `tool/ai/v2` supports provider-local `ModelConfig` registration. `AvailableReasoning` and `AvailableTools` are adapter upper bounds; registered chat calls use the model's declared reasoning/tool subset and resolve its stable ID to the upstream model name.
10. `OpenAIProvider.Chat` and `ChatStream` expose messages, reasoning controls, DeepSeek `thinking`, and the hosted OpenAI `web_search` Responses tool. Requests may limit tool calls with `MaxToolCalls`, and responses expose final URL annotations through `ChatResponse.Citations`.
11. The legacy `tool/ai` wrapper remains for multipart audio transcription. The platform STT queue supplies provider/model selection. `OpenAISTT` uses the official SDK multipart transcription path, except OpenRouter hosts use their Base64 JSON `input_audio` contract; an OpenRouter root Base URL is normalized to `/api/v1/audio/transcriptions`, while an already complete transcription endpoint is preserved. Both native DashScope protocols use the synchronous `multimodal-generation` endpoint but keep separate wire contracts: `DashScopeQwen3ASR` sends `input.messages[].content[].audio`, passes `language` through `parameters.asr_options`, and parses `output.choices[].message.content[].text`; `DashScopeFunASR` sends a typed `input_audio.data` plus audio `format`, sets `X-DashScope-SSE: disable`, and parses `output.text` with `output.output.sentence.text` as a compatibility fallback. Upstream model names remain independently configurable and never select the protocol. `qwen3-asr-flash-filetrans` is not covered by `DashScopeQwen3ASR`; it uses the separate asynchronous file-transcription contract, which is not implemented.
12. `tool/ai/v2` provides base agent components and configuration helpers, not an agent-by-ID factory layer: `AgentID` and `ProviderID` are `uint32`, and the package-level singleton stores `ProviderID -> IProvider` and `AgentID -> IAgentSetting`, while callers still create and initialize agents explicitly.
13. `IAgent[S]` is the typed lifecycle surface for v2 agents: `GetID`, `Init`, and `InitWithSetting`; chat/streaming/factory/middleware behavior and provider/setting getters are intentionally outside this interface.
14. `BaseAgent` and `BaseAgentSetting` live in `tool/ai/v2/base_agent.go`; `BaseAgent` is a thin built-in reference implementation composed from public provider binding, generic setting state, and message history components that external agents can also reuse directly. `BaseAgent.Chat(ctx, content)` is stateful per agent instance: it prepends `SysPrompt`, reuses successful user/assistant history, tries `Models` in order as a fallback list, writes history only after a successful response, and returns errors instead of local fallback content. Chat calls on the same `BaseAgent` are serialized, including provider network I/O, to preserve strict history ordering.
15. v2 agent settings use `IAgentSetting` plus reflection helpers for JSON import/export and JSON doc generation; the supported setting surface is exported scalar fields and scalar slices/arrays only, with zero values treated as not configured. Importing zero values is a no-op for existing values, so JSON import cannot clear a previously configured scalar or slice by passing `""`, `0`, `false`, or `[]`.
16. The opt-in v2 live web-search check is `TestLiveOpenAIWebSearch` under build tag `live_ai`. It reads `OPENAI_API_KEY`, optional `OPENAI_BASE_URL`, optional `OPENAI_MODEL` (default `gpt-5.4`), and optional `OPENAI_REASONING_EFFORT` (default `low`), performs one real billable request, and requires at least one URL citation. Its compatibility-oriented request keeps reasoning while omitting output-token and tool-call-limit controls. Normal test runs exclude it.

## AI rewrite endpoint

1. Endpoint: `POST /misc/gpt-rewrite`
2. Required permission:
   - `gpt`, or
   - `admin`
3. Input payload:
   - `content`
4. Runtime steps:
   - load the structured AI config from `CfgExt`, or its legacy migration view
   - resolve the queue bound to the `rewrite` scene
   - try configured provider/model items in order with model capability validation
   - send rewrite prompt and return rewritten content
5. Common failure signatures:
   - `no permission`
   - `ai scene "rewrite" is not configured`
   - `<provider>/<model>: provider token is empty`
   - joined per-model upstream errors after the queue is exhausted

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
   - missing scene binding or queue
   - joined per-model queue errors
   - `ai response parse error`

## AI transcription endpoint

1. Endpoint: `POST /misc/ai/transcribe`
2. Required permission:
   - `ai`, or
   - `admin`
3. Request body uses `multipart/form-data`:
   - `file`: required audio file/blob
   - `language`: optional; forwarded as the transcription language hint
   - `prompt`: optional; forwarded as transcription context only for the standard OpenAI-compatible SDK path. OpenRouter JSON STT and both native DashScope branches ignore it in the current integration.
4. Provider/model selection is server-owned:
   - resolve the `transcribe + stt` entry from `AIPlatformConfig.businesses`
   - require the selected queue and every referenced model to use `stt`
   - try queue items in order and rewind the uploaded file between attempts
   - request-supplied model fields are ignored
   - resolve the model's explicit call protocol or inherit it from provider protocol and model type
   - `OpenAISTT` uses OpenRouter's Base64 JSON compatibility path for OpenRouter hosts and multipart transcription through the official SDK elsewhere
   - `DashScopeQwen3ASR` uses the native DashScope synchronous Qwen3-ASR message and response structure
   - `DashScopeFunASR` uses the distinct native DashScope synchronous Fun-ASR-Flash structure
   - the asynchronous `/services/audio/asr/transcription` task protocol and Qwen OpenAI-chat-compatible protocol are intentionally not implemented
5. Backend upload/request guards:
   - max audio upload size is 250 MB
   - prompt is capped at 4000 runes
   - language is capped at 32 bytes
   - upstream transcription call timeout is 10 minutes
6. Response payload:
   - `text`
   - optional `language`
   - optional `duration`
   - audio with no recognizable speech is a successful transcription with an empty `text`; the STT queue stops at that provider/model without logging an upstream warning or trying later fallback items
7. Common failure signatures:
   - `no permission`
   - `audio file is required`
   - `audio file is empty`
   - `audio file is too large`
   - `language is too long`
   - `prompt is too long`
   - `ai config error`
   - `stt queue is not configured`
   - `stt queue <id> must contain stt models`
   - `<provider>/<model>: provider token is empty`
   - joined per-model upstream errors after the STT queue is exhausted
8. An opt-in live provider check is available on macOS. Run `go test -tags live_ai -run '^TestLiveAudioProvider$' -count=1 -v ./platform` from `backend/`; it prompts for the provider URL and reads the API key with terminal echo disabled, generates a temporary WAV fixture, and does not persist credentials.

## Config read behavior in admin flows

1. Config reads use `GetWithFilter`.
2. Platform/service config responses can surface registered defaults before the first explicit save.
3. This is why admin UI can read AI config defaults even when nothing has been saved yet.
4. The AI settings page does not use `UniConfig` for the structured document. It loads/saves the typed AI config routes and separates editing into provider/model registration, typed ordered model queues, and the unified business configuration list.

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
