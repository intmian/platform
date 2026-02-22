# Shared Debug Workflow

Last verified: 2026-02-22

## Positioning

1. This file is a specialized playbook for debugging tasks.
2. Always apply `shared/engineering-workflow.md` first.
3. This file only adds debug-specific constraints and tactics.

## Service startup baseline

1. Backend:
   - program: `backend/main/main.go`
   - working directory: `backend/test`
   - env: `GOWORK=${workspaceFolder}/backend/go.work`
2. Frontend:
   - working directory: `frontend`
   - command: `npm run dev`
   - use Vite output URL (`http://127.0.0.1:5173` preferred when available)

## Debug-specific mandatory flow

1. Keep engineering workflow gates, then apply debug gates below.
2. Confirm runtime readiness before any UI conclusion:
   - backend reachable (`/api/check` success or startup logs show ready)
   - frontend reachable on one stable URL
   - login/auth is actually successful
3. Reproduce with the smallest failing path first.
4. Capture baseline evidence before code change:
   - MCP snapshot
   - screenshot (if UI visible)
   - console/network for failure path
   - for performance tasks, include at least one quantitative baseline metric
5. Classify fault domain before editing:
   - route/handler
   - auth/account
   - storage/config
   - frontend-backend contract mismatch
6. Apply minimal patch with explicit fault hypothesis.
7. Re-run the same path and capture post-change evidence.
8. Run at least one adjacent regression path.
9. For performance tasks, compare pre/post with the same interaction path and same dataset context.
10. Report repro, evidence, patch summary, regression, residual risk.
11. UI behavior fixes (including sort/filter/display order) must include MCP pre/post interaction evidence; compile/build success cannot replace this requirement.
12. Run a short retrospective before final response:
   - what went wrong in this task
   - root cause
   - prevention rule
   - process/doc update applied in this turn
13. If verification mutates real data, record changed entities and provide cleanup plan (or execute cleanup when safe).

## Frontend-first checks

1. Confirm route and required params.
2. Confirm auth state and account context.
3. Confirm request payload and API response shape.
4. Confirm render conditions and fallback paths.

## MCP/browser troubleshooting

1. If Playwright MCP fails to launch Chrome with message indicating existing browser session, close local Chrome processes and retry MCP launch.
2. Keep one stable dev server URL for the full pre/post comparison path (`127.0.0.1` preferred when explicitly specified).
3. Treat framework deprecation warnings (for example AntD/rc component deprecations) as non-regression unless new runtime errors or behavior drift appears.

## Backend-first checks (debug)

1. Collect evidence from:
   - `backend/test/log`
   - `backend/test/gin.log`
   - `backend/test/sql.log`
2. If backend startup fails due external network dependency, record exact error and continue with reachable runtime path when feasible (for example existing service responding to `/api/check`).
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

## Fix output checklist

1. Repro steps.
2. Pre-change evidence summary.
3. Patch summary.
4. Post-change evidence summary.
5. Regression checklist and results.
6. AI-doc updates performed.
7. Retrospective: mistake, root cause, prevention.
8. Process update made from retrospective (or explicit `none` with reason).
9. Residual risk.

## Completion gate

1. Do not declare completion without evidence summary and regression result.
2. For UI behavior fixes, if MCP pre/post interaction evidence is missing, task is not complete.

## Conflict handling

1. Code facts override doc notes.
2. If uncertain, mark `TODO-verify` and avoid hard assertions.
