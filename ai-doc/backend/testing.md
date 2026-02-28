# Backend Testing Baseline

Last verified: 2026-02-27

## Goal

1. Provide a repeatable backend verification flow for API/service changes.
2. Ensure tests include both target path and one adjacent regression path.

## Runtime baseline

1. Default debug working directory: `backend/test`.
2. Default run command:
   - `GOWORK=$(pwd)/../go.work go run ../main/main.go`
3. Required startup file in run directory:
   - `base_setting.toml`
4. Health endpoint (direct backend):
   - `POST /check`

## Pre-check before startup

1. Confirm whether backend is already running and healthy.
2. Reuse existing healthy runtime instead of starting duplicates.
3. Confirm current `base_setting.toml` points to intended test DB/log paths.

## Minimal API verification chain

1. Health:
   - `curl -s -X POST http://127.0.0.1:8080/check`
2. Login:
   - `curl -i -s -X POST http://127.0.0.1:8080/login -H 'Content-Type: application/json' -d '{"username":"admin","password":"<pwd>"}'`
3. Service call:
   - use cookie from login to call `POST /service/:name/:cmd`.
4. Assert envelope and behavior:
   - success: `code=0`
   - failure: `code=1` with expected failure signature.

## Backend evidence sources

1. Platform/gin runtime log:
   - `backend/test/gin.log`
2. SQL log:
   - `backend/test/sql.log`
3. Service logs:
   - `backend/test/log/*`
4. Todone BI SQL trace:
   - table `todone_db_log` via `/admin/bi_log/todone_db_log/search`

## Service-specific smoke matrix

1. `account`:
   - `checkToken` and one token-management command (`createToken` or `getAllAccount`).
2. `todone`:
   - `getDirTree` plus one write path (`createTask`/`changeTask`/`taskMove`) and one readback.
3. `auto`:
   - `getReportList` and one report read (`getReport` or `getWholeReport`).
4. `cmd`:
   - `getTools` and one env/task command (`createEnv` or `runEnv` path).

## Adjacent regression requirement

1. After target verification, run one nearby non-target command in the same service.
2. If change touches gateway/auth/config, regression must include a second service call (cross-service check).

## Data mutation accounting

1. Record changed entities during verification (user/account, dir/group/task IDs, env/tool IDs).
2. Provide cleanup plan (or perform cleanup when safe).
3. Do not treat test-created rows/files as implicit non-issues.

## Common blockers

1. Missing `base_setting.toml` in current run dir.
2. Invalid or missing todone D1 config keys (`todone/db/*`).
3. Permission mismatch (`no permission`, `user err`).
4. Cookie not persisted between login and `/service/*` calls.
