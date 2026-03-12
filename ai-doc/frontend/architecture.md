# Frontend Architecture

Last verified: 2026-03-10

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

## Shared request model

1. Frontend request base comes from `frontend/src/config.json`:
   - `api_base_url = "/api"`
2. In local dev, Vite proxy rewrites `/api/*` to backend `http://127.0.0.1:8080/*`, and also forwards `/share-link/*` to the same backend so relative share links work in dev.
3. Shared HTTP helpers live mainly in:
   - `frontend/src/common/sendhttp.js`
   - `frontend/src/common/newSendHttp.ts`
4. Common backend envelope assumption:
   - `code = 0` means success
   - `code != 0` means failure
   - payload is usually in `data`
5. Most page/service requests use JSON `POST`, even for reads.

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
3. Slice config editors use a collapse summary label that shows the current values joined by `,`; reordering items updates that summary immediately before save.
4. Config metadata supports `secret` fields; string inputs render as password boxes with eye-toggle visibility, and current admin settings use that for token/key style fields.
5. `UniConfig` supports `hideLabels` for grouped card layouts where the card title already names the config item.

## Loading guidance

1. Load this file when the task touches:
   - shared routing
   - frontend auth/session behavior
   - request base/proxy behavior
   - app-shell ownership
2. Skip this file for narrow module work when domain docs already answer the question.
