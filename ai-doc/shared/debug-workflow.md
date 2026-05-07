# Shared Debug Workflow

Last verified: 2026-05-07

## Positioning

1. This file defines debug-specific additions to `shared/engineering-workflow.md`.
2. Always apply engineering first; this file only adds steps and checks unique to debugging.
3. Completion, evidence, and reporting gates are defined in engineering — do not redefine them here.

## Service startup baseline

1. Backend:
   - program: `backend/main/main.go`
   - working directory: `backend/test`
   - env: `GOWORK=${workspaceFolder}/backend/go.work`
2. Frontend:
   - working directory: `frontend`
   - command: `npm run dev`
   - use the exact Vite runtime URL printed in terminal
   - request base path is `frontend/src/config.json` -> `api_base_url="/api"`
   - Vite proxy (`frontend/vite.config.js`) maps `/api/*` -> `http://127.0.0.1:8080/*` by stripping `/api` prefix

## Delta: fault-domain classification

Insert after engineering step 3 (Plan with risk map):

1. Before patching, classify which layer owns the fault:
   - route/handler
   - auth/account
   - storage/config
   - frontend-backend contract mismatch
   - shared-library boundary mismatch
2. If the suspected fix requires changing a shared lib, first prove the bug is not better owned by the business caller or adapter layer.
3. Reproduce with the smallest failing path first before expanding to edge cases.

## Delta: pre-verification checks

Insert into engineering step 5 (Runtime readiness), before verification:

1. Confirm runtime readiness before any UI conclusion:
   - backend reachable (`POST /check` direct call success, or `POST /api/check` success via Vite proxy)
   - frontend reachable on one stable URL
   - login/auth is actually successful via normal user flow
   - do not bypass auth blockers (for example closing login modal to force operations on disabled/unauthorized UI)
   - when a config/UI result looks inconsistent with code, verify the backend process PID/cwd/version before patching around the symptom
2. For config/default-value issues, verify the final displayed value comes from the owning backend/config path; do not accept a frontend fallback as proof of backend correctness.
3. For performance tasks, compare pre/post with the same interaction path and same dataset context.

## Delta: frontend-first checks

Apply before classifying a frontend issue as resolved:

1. Confirm route and required params.
2. Confirm auth state and account context.
3. Confirm request payload and API response shape.
4. Confirm render conditions and fallback paths.
5. When a page requires login, start backend and complete real login before interactive verification; if login is unavailable, mark verification blocked instead of using hack paths.

## Delta: backend-first checks

Apply when debugging backend issues:

1. Collect evidence from:
   - `backend/test/log`
   - `backend/test/gin.log`
   - `backend/test/sql.log`
2. If backend startup fails due external network dependency, record exact error and continue with reachable runtime path when feasible (for example existing service responding to `/api/check`).
   - direct backend health route is `POST /check`; in frontend dev chain use `POST /api/check` (proxied).
3. Codex sandbox note (`verified via interaction`):
   - `dlv debug` may fail with `listen tcp 127.0.0.1:*: bind: operation not permitted`.
   - Root cause is sandbox socket binding restriction, not `.vscode` `launch.json` mismatch.
   - Re-run debug command outside sandbox when debugging is required.
4. Codex sandbox network note (`verified via interaction`):
   - `go run ../main/main.go` may fail with `lookup api.cloudflare.com: no such host`.
   - This is an environment/network restriction; validate startup once outside sandbox before changing code.
5. Codex backend debug execution policy:
   - For backend debug in Codex, treat non-sandbox execution as default path (not fallback).
   - Run `dlv` and backend `go run` with elevated execution first, then continue debugging.
   - Use fixed baseline: `program=backend/main/main.go`, `cwd=backend/test`, `GOWORK=${workspaceFolder}/backend/go.work`.

## Performance/refactor guard

1. Unless user explicitly requests backend/database schema changes, assume frontend/module-local changes only.

## Conflict handling

1. Code facts override doc notes.
2. If uncertain, mark `TODO-verify` and avoid hard assertions.
