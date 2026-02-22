# Shared Debug Workflow

Last verified: 2026-02-22

## Mandatory flow

1. Reproduce with the smallest path first.
2. Capture baseline evidence before code change:
   - MCP snapshot
   - screenshot (if UI visible)
   - console/network for failure path
3. Apply minimal patch.
4. Re-run the same path and capture post-change evidence.
5. Run at least one adjacent regression path.
6. Report repro, evidence, patch summary, regression, residual risk.

## Frontend-first checks

1. Confirm route and required params.
2. Confirm auth state and account context.
3. Confirm request payload and API response shape.
4. Confirm render conditions and fallback paths.

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

## Conflict handling

1. Code facts override doc notes.
2. If uncertain, mark `TODO-verify` and avoid hard assertions.
