# Frontend Architecture

Last verified: 2026-07-11

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
8. Admin `AI 设置` page keeps `连接配置` on top, then `语音转写`, then uses a responsive two-column section layout on desktop: `模型池` on the left as a vertical stack and `场景档位` on the right; narrow screens collapse back to a single column. `语音转写` exposes its optional Base URL, secret Token, and model; leaving both connection fields empty inherits the main AI connection.
9. Admin settings expose `Todone Worker 配置` with Worker endpoint and a password-style Worker token. The endpoint placeholder is non-production, and changes require service restart.

## Shared AI UI helpers

1. `frontend/src/common/useAudioRecorder.ts` is the generic browser recording hook; it prefers Web Audio PCM capture encoded as `audio/wav` for transcription-provider compatibility, falls back to MediaRecorder when Web Audio is unavailable, and owns duration, stop/cancel, Blob output, microphone track cleanup, and a normalized 16-sample live `waveform` derived from the current PCM buffer.
2. `frontend/src/common/WhisperButton.tsx` composes `useAudioRecorder` with `transcribeAudio`; it emits transcription text through `onText` and keeps business-specific insertion behavior in the caller. When rendered without children, it defaults to an icon-only circular button with tooltip/ARIA labeling owned by the shared component. During recording it expands into a pill that shows elapsed `mm:ss`, renders the live microphone waveform on the right, and stops/transcribes when clicked again.
3. `WhisperButton` defaults to a 120-second maximum recording and stops automatically at the configured limit. Long-press opens settings after a 900ms hold, with progress feedback delayed for the first 300ms; the modal stores a configurable 10–600 second limit together with language and prompt in browser `localStorage` under `platform.ai.transcribe.settings.v1`.
4. `WhisperButton` defaults to Simplified Chinese transcription style; language is selected from 简体中文/英文/日语 and saved as `zh`/`en`/`ja`. Because some OpenAI-compatible transcription providers reject the `language` field, the shared component uses the selected language only to build the prompt: Simplified Chinese prepends a Simplified Chinese writing and punctuation style prompt, then appends any user-provided domain/context prompt.
5. Callers that need layout changes while recording use `onRecordingChange`; recording mechanics and transcription still remain owned by the shared component.

## Loading guidance

1. Load this file when the task touches:
   - shared routing
   - frontend auth/session behavior
   - request base/proxy behavior
   - app-shell ownership
2. Skip this file for narrow module work when domain docs already answer the question.
