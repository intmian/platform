# Shared Debug Workflow

Last verified: 2026-02-22

## Service startup baseline

1. Backend:
   - program: `backend/main/main.go`
   - working directory: `backend/test`
   - env: `GOWORK=${workspaceFolder}/backend/go.work`
2. Frontend:
   - working directory: `frontend`
   - command: `npm run dev`
   - use Vite output URL (`http://127.0.0.1:5173` preferred when available)

## Mandatory flow

1. Reproduce with the smallest path first.
2. Capture baseline evidence before code change:
   - MCP snapshot
   - screenshot (if UI visible)
   - console/network for failure path
   - for performance tasks, include at least one quantitative baseline metric
3. Apply minimal patch.
4. Re-run the same path and capture post-change evidence.
5. Run at least one adjacent regression path.
6. For performance tasks, compare pre/post with the same interaction path and same dataset context.
7. Report repro, evidence, patch summary, regression, residual risk.
8. UI behavior fixes (including sort/filter/display order) must include MCP pre/post interaction evidence; compile/build success cannot replace this requirement.

## Frontend-first checks

1. Confirm route and required params.
2. Confirm auth state and account context.
3. Confirm request payload and API response shape.
4. Confirm render conditions and fallback paths.

## MCP/browser troubleshooting

1. If Playwright MCP fails to launch Chrome with message indicating existing browser session, close local Chrome processes and retry MCP launch.
2. Keep one stable dev server URL for the full pre/post comparison path (`127.0.0.1` preferred when explicitly specified).
3. Treat framework deprecation warnings (for example AntD/rc component deprecations) as non-regression unless new runtime errors or behavior drift appears.

## Backend-first checks

1. Classify failing layer:
   - route/handler
   - auth/account
   - storage/config
   - frontend-backend contract mismatch
2. Collect evidence from:
   - `backend/test/log`
   - `backend/test/gin.log`
   - `backend/test/sql.log`
3. If backend startup fails due external network dependency, record exact error and continue with reachable runtime path when feasible (for example existing service responding to `/api/check`).
4. Codex sandbox note (`verified via interaction`):
   - `dlv debug` may fail with `listen tcp 127.0.0.1:*: bind: operation not permitted`.
   - Root cause is sandbox socket binding restriction, not `.vscode` `launch.json` mismatch.
   - Re-run debug command outside sandbox when debugging is required.
5. Codex sandbox network note (`verified via interaction`):
   - `go run ../main/main.go` may fail with `lookup api.cloudflare.com: no such host`.
   - This is an environment/network restriction; validate startup once outside sandbox before changing code.
6. Codex backend debug execution policy:
   - For backend debug in Codex, treat non-sandbox execution as default path (not fallback).
   - Run `dlv` and backend `go run` with elevated execution first, then continue debugging.
   - Use fixed baseline: `program=backend/main/main.go`, `cwd=backend/test`, `GOWORK=${workspaceFolder}/backend/go.work`.

## Performance/refactor guard

1. Unless user explicitly requests backend/database schema changes, assume frontend/module-local changes only.

## Fix output checklist

1. Repro steps.
2. Pre-change evidence summary.
3. Patch summary.
4. Post-change evidence summary.
5. Regression checklist and results.
6. AI-doc updates performed.
7. Residual risk.

## Completion gate

1. Do not declare completion without evidence summary and regression result.
2. For UI behavior fixes, if MCP pre/post interaction evidence is missing, task is not complete.

## Conflict handling

1. Code facts override doc notes.
2. If uncertain, mark `TODO-verify` and avoid hard assertions.
