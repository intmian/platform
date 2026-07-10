# Backend Observability

Last verified: 2026-07-10

## Scope

1. Covers reusable runtime visibility paths for backend startup, logs, metrics, SQL traces, and profiling.
2. Service-specific business debugging still belongs in service or domain docs.

## Runtime log channels

1. Platform runtime uses `xlog` with push integration.
2. Recent platform log messages are also written into `xnews` topic `PLAT`.
3. Release-mode Gin logs are written to `gin.log` in backend run directory.
4. Platform SQL logs write to `utils.GetSqlLog("plat")`.
5. Todone SQL logs write to `utils.GetSqlLog("todone")`.

## HTTP visibility endpoints

1. Recent platform logs:
   - `POST /admin/log/get`
2. System resource snapshot:
   - `POST /admin/system/usage`
3. System resource stream:
   - `GET /admin/system/usage/sse`
4. BI log table search:
   - `POST /admin/bi_log/:table/search`

## BI and SQL tracing

1. Platform initializes `xbi` with the dedicated D1 log Worker during startup and fails startup when Worker health/auth validation fails.
2. BI errors are routed into platform log channel `PLAT.XBI`.
3. Todone DB layer registers BI log entity `todone_db_log`.
4. For todone DB behavior, `/admin/bi_log/todone_db_log/search` is the reusable query path.
5. The D1 Worker logs request ID, SQL hash, mode, latency, success, and D1 result metadata; full SQL and bearer tokens are not logged.

## Profiling

1. `pprof` is exposed on `127.0.0.1:12351`.
2. This is a local profiling surface and is separate from the Gin application port.

## Startup and shutdown signals

1. Platform sends startup push after core init.
2. On interrupt or terminate signals, platform logs exit intent and pushes an exit notice.
3. Signal handling currently exits the process after a short delay instead of coordinating a full graceful shutdown chain.

## Common evidence sources during debugging

1. `backend/test/gin.log`
2. `backend/test/sql.log`
3. `backend/test/log/*`
4. `/admin/log/get`
5. `/admin/system/usage`
6. `/admin/bi_log/:table/search`
7. local `pprof` on `127.0.0.1:12351`

## Loading guidance

1. Load this file when the task touches:
   - startup visibility
   - platform logs
   - CPU or memory inspection
   - SQL trace inspection
   - BI-backed backend debugging
