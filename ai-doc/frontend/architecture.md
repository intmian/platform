# Frontend Architecture

Last verified: 2026-07-23

## Scope

1. Covers frontend shell structure, route ownership, shared auth state, and request conventions.
2. Module-specific behavior still belongs in domain docs such as `todone/*`, `library/*`, and `note-mini/*`.

## App shell

1. Frontend entry is `frontend/src/main.jsx`.
2. Root app is `frontend/src/App.jsx`.
3. `App` mounts `GlobalCtx`, then `RouterProvider`.
4. Day.js locale is initialized to `zh-cn` in `App`.

## Route map

1. Admin shell:
   - `/`
   - `/admin`
2. Debug tools:
   - `/debug`
   - `/debug/:mode`
3. Cmd tools:
   - `/cmd`
   - `/cmd/:mode`
   - `/cmd/:mode/:id`
4. Domain pages:
   - `/todone`
   - `/todone/:group`
   - `/note_mini`
   - `/day-report`
   - `/day-report/:date`
   - `/subscription`
   - `/money`
   - `/money/:bookId/config`
   - `/money/:bookId/reconcile/:recordId`
   - `/money/:bookId/history`
   - `/money/:bookId/dashboard`
   - `/money/:bookId/import`
5. Misc pages:
   - `/love47`
   - `/loss-fat`
   - `/kana`
   - `/rate/jianxing`
6. Error route:
   - `/404`
7. Admin header adds a direct `订阅管理` navigation entry that routes to `/subscription`.
8. `/subscription` is a logged-in user page with manual subscription checks, and does not require `admin` permission.
9. Subscription API returns relative share paths; the page resolves them against `window.location.origin` for display/copy.
10. `/money` is a logged-in family money book module; admin users can manage books/items/records/Excel imports/JSON archives/delete flows, while viewer users only receive dashboard access from the backend per-book ACL.

## Shared request model

1. Frontend request base comes from `frontend/src/config.json`:
   - `api_base_url = "/api"`
2. In local dev, Vite proxy rewrites `/api/*` to backend `http://127.0.0.1:8080/*`, and also forwards `/share-link/*` to the same backend so relative share links work in dev.
3. Shared HTTP helpers live mainly in:
   - `frontend/src/common/sendhttp.js`
   - `frontend/src/common/newSendHttp.ts`
4. Common AI protocol types live in `frontend/src/common/aiProtocol.ts`; `frontend/src/common/aiGateway.ts` owns typed JSON AI actions and multipart audio transcription sends.
5. Common backend envelope assumption:
   - `code = 0` means success
   - `code != 0` means failure
   - payload is usually in `data`
6. Most page/service requests use JSON `POST`, even for reads; audio transcription is a multipart exception.

## Shared auth model

1. Browser auth is cookie-based; frontend does not manage the token directly.
2. Shared login state is provided through `frontend/src/common/loginCtx.jsx`.
3. `LoginProvider` auto-checks login by calling `POST /check`.
4. Desktop periodically re-checks login every 60 seconds when a user is present.
5. Mobile additionally re-checks on focus-loss recovery path.
6. Page-level permission/login gates are usually enforced in business pages instead of in the router layer.

## Frontend and backend hosting modes

1. Preferred development mode is separate frontend Vite + backend Gin runtimes.
2. Backend can optionally serve built frontend assets from `./front` when:
   - `./front` exists
   - `use_front = true`
3. In backend-served mode, non-API routes fall back to SPA entry handling.

## Shared config UI

1. Shared config form component lives in `frontend/src/common/UniConfig.jsx`.
2. `ConfigsCtr` owns config metadata plus init/cache state; concurrent `UniConfig` mounts now reuse the same init request instead of issuing duplicate loads.
3. Slice config editors use a collapse summary label that shows the current values joined by `,`; drag sorting and deletion update that summary immediately before save.
4. Config metadata supports `secret` fields; string inputs render as password boxes with eye-toggle visibility, and current admin settings use that for token/key style fields.
5. `UniConfig` supports `hideLabels` for grouped card layouts where the card title already names the config item.
6. Slice config rows use a dedicated drag handle for reordering and keep the delete `X` on the far right of each row, matching the action alignment used by the save button column.
7. Slice config inline editors keep focus during typing; row identity stays stable while values change, so editing a single character does not remount the input.
8. Admin `AI 设置` uses typed `/misc/ai/config/get` and `/misc/ai/config/set` routes instead of `UniConfig`. Its tabs manage provider connections and provider-owned model registration, ordered `调用策略`, and fixed business-to-strategy bindings. Provider, model, and queue IDs remain generated stable references in the persisted document but are hidden from normal UI, including copy actions and selectors. The editor shows provider names, editable strategy names, and each upstream API model string as `上游模型 ID`; queue selectors and strategy-test results also resolve internal references back to provider/model names. Provider types are `OpenAI` and `DeepSeek`; OpenAI-compatible intermediaries such as OpenRouter use `OpenAI`. Every model exposes a separate `调用协议` selector: its default entry visibly inherits from the provider and model type (`OpenAI 文字`/`OpenAI STT` or `DeepSeek 文字`), while a DeepSeek STT model requires an explicit override. Text models can select `OpenAI 文字` or `DeepSeek 文字`; STT models can select `OpenAI STT`, `DashScope 千问3-ASR-Flash（同步）`, `DashScope Fun-ASR-Flash`, or `DashScope Fun-ASR 实时（8 kHz）`. Models and strategies both declare either `text` or `stt`; strategy selectors only expose models with the same type. Tool configuration is two-layered: a model declares its available tools, then each strategy item selects the subset enabled for that call. Strategy items also expose one `思考强度` selector; DeepSeek text uses `none/high/max`, where `none` disables thinking and `high/max` enable it at the selected effort. Each strategy can test the current unsaved draft: text strategies start with an editable `Hello` prompt, while STT strategies provide a bundled `Hi.` WAV sample plus optional local audio replacement. Results show output, the winning provider/model, and every fallback attempt. Business configuration always shows the five built-in entries (`rewrite + text`, `summary + text`, `translate + text`, `library_review_digest + text`, and `transcribe + stt`); internal scene codes stay hidden, entries cannot be added or removed, and only a matching strategy can be selected.
9. Admin settings expose `Todone Worker 配置` with Worker endpoint and a password-style Worker token. The endpoint placeholder is non-production, and changes require service restart.

## Shared AI UI helpers

1. `frontend/src/common/useAudioRecorder.ts` is the generic browser recording hook; it prefers Web Audio PCM capture encoded as `audio/wav` for transcription-provider compatibility, falls back to MediaRecorder when Web Audio is unavailable, and owns duration, stop/cancel, microphone track cleanup, and a normalized 16-sample live `waveform` derived from the current PCM buffer. Before Web Audio PCM is encoded, it conservatively removes low-volume leading/trailing ranges and compresses long internal pauses; the stop result explicitly reports whether effective voice remains. MediaRecorder fallback blobs remain untrimmed because PCM levels are unavailable there.
2. `frontend/src/common/WhisperButton.tsx` asks `/misc/ai/transcribe/capability` before each recording. It uses `useRealtimeTranscription` for configured realtime Fun-ASR and otherwise preserves the `useAudioRecorder` plus `transcribeAudio` file path. Recordings with no effective voice end without emitting text, while successful final text is emitted through `onText` and business-specific insertion remains in the caller. When rendered without children, it defaults to an icon-only circular button with tooltip/ARIA labeling owned by the shared component. During recording it expands into a pill that shows elapsed `mm:ss`, renders the live microphone waveform on the right, and stops/transcribes when clicked again.
3. `WhisperButton` defaults to a 120-second maximum recording and stops automatically at the configured limit. Long-press opens settings after a 900ms hold, with progress feedback delayed for the first 300ms; the modal stores a configurable 10–600 second limit together with language and prompt in browser `localStorage` under `platform.ai.transcribe.settings.v1`.
4. `WhisperButton` defaults to Simplified Chinese transcription style; language is selected from 简体中文/英文/日语 and saved as `zh`/`en`/`ja`. Because some OpenAI-compatible transcription providers reject the `language` field, the shared component uses the selected language only to build the prompt: Simplified Chinese prepends a Simplified Chinese writing and punctuation style prompt, then appends any user-provided domain/context prompt.
5. During realtime recognition, `WhisperButton` keeps a visible `实时转写` popover open. It concatenates all confirmed sentences with the current mutable partial sentence, so sentence-final events do not make the preview disappear. Callers can consume the same continuous aggregate through `onPartialText`; `onText` still fires once with the authoritative completed result.
6. Callers that need layout changes while recording use `onRecordingChange`; recording mechanics and transcription still remain owned by the shared component.

## Loading guidance

1. Load this file when the task touches:
   - shared routing
   - frontend auth/session behavior
   - request base/proxy behavior
   - app-shell ownership
2. Skip this file for narrow module work when domain docs already answer the question.
