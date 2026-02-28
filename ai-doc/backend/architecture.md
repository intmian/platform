# Backend Architecture

Last verified: 2026-02-27

## Scope

1. Covers backend bootstrap, gateway routes, auth chain, config surface, and runtime observability.
2. Service-internal business details are split to `backend/services.md` and `backend/todone-core.md`.

## Bootstrap chain

1. Entry is `backend/main/main.go`:
   - create `platform.PlatForm`
   - call `Init(context.Background())`
   - call `Run()` and block on context
2. `PlatForm.Init` hard-requires `base_setting.toml` in current working directory.
3. Base infra initialized in order:
   - `xstorage` (sqlite, from `base_setting.toml -> db_addr`)
   - `xpush` (Feishu webhook)
   - `xnews` topic `PLAT` for recent logs
   - `xlog` (and push on log)
   - `xbi` (D1-backed, SQL metrics/log sink)
   - `xstorage.WebPack` + `CfgExt`
4. Global config keys registered in platform init:
   - `note.setting`
   - `PLAT.realUrl`, `PLAT.outUrl`, `PLAT.baseUrl`
   - `auto.news.keys`
   - `PLAT.r2.endpoint`, `PLAT.r2.accessKey`, `PLAT.r2.secretKey`, `PLAT.r2.bucket`, `PLAT.r2.web`
5. `core.Init` starts registered services and sends startup push.
6. `webMgr.Init` starts Gin HTTP server on `base_setting.toml -> web_port`.
7. `pprof` is exposed on `127.0.0.1:12351`.

## Service registration and lifecycle

1. Registered in `platform/core.go`:
   - `auto`
   - `account`
   - `cmd`
   - `todone`
2. Service flags include `note`, but `note` is currently not registered into `core.service`.
3. Stop gate:
   - services with `SvrPropCore` or `SvrPropCoreOptional` cannot be stopped via admin API.
4. Startup gate uses storage key `<service>/open_when_start` design intent, but current code reads `auto/open_when_start` for all services (`platform/core.go`, code fact).

## HTTP route surface

## Admin/auth root

1. `POST /login`
2. `POST /logout`
3. `POST /check`
4. `POST /admin/services`
5. `POST /admin/service/:name/start`
6. `POST /admin/service/:name/stop`
7. `POST /admin/storage/get`, `/set`, `/get_all`
8. `POST /admin/log/get`
9. `POST /admin/system/usage`
10. `GET /admin/system/usage/sse`
11. `POST /admin/bi_log/:table/search`

## Service and config root

1. `POST /service/:name/:cmd`
2. `POST /debug/:name/:cmd`
3. `POST /cfg/plat/set`, `/cfg/plat/get`
4. `POST /cfg/:svr/set`, `/cfg/:svr/get`
5. `POST /cfg/:svr/:user/set`, `/cfg/:svr/:user/get`
6. `POST /misc/gpt-rewrite`
7. `POST /misc/r2-presigned-url`

## Auth and permission chain

1. `/login` validates account/password by RPC calling `account` service `checkToken` with `MakeSysValid()`.
2. On success, server writes cookie `token` (JSON payload with user/permissions/validTime/token-signature).
3. `/check` validates token signature + validity window; non-admin tokens near expiry are refreshed.
4. `/service/:name/:cmd` builds `share.Valid` from cookie and forwards it to service `HandleRpc`.
5. Service-level permission checks are mandatory and differ per service (see `backend/services.md`).

## Error envelope and debug behavior

1. API envelope is unified with `code` (`0` success, `1` failure).
2. `/service/:name/:cmd` returns generic `msg="svr error"` on service error by default.
3. When `base_setting.toml -> debug=true`, service error detail can be returned directly.
4. `/debug/:name/:cmd` is disabled unless `debug=true`.

## Frontend hosting mode (optional)

1. If `./front` exists and `use_front=true`, Gin serves frontend static resources and SPA fallback.
2. For development, frontend and backend are usually started separately.

## R2 presigned upload contract

1. Endpoint: `POST /misc/r2-presigned-url`
2. Required permission: `file` or `admin`.
3. Reads R2 config from `PLAT.r2.*` keys.
4. Returns:
   - `UploadURL` (presigned PUT, 15 minutes)
   - `PublicURL` (public object URL)

## Runtime observability

1. Gin log file (release mode): `gin.log` in backend run directory.
2. SQL logs:
   - platform SQL: `utils.GetSqlLog("plat")`
   - todone SQL: `utils.GetSqlLog("todone")`
3. Recent platform logs can be read from `/admin/log/get` (topic `PLAT`).
4. Process/memory/cpu snapshots available via `/admin/system/usage` and SSE stream.
