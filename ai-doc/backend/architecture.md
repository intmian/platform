# Backend Architecture

Last verified: 2026-03-06

## Scope

1. Covers backend bootstrap, platform composition, service registration, and hosting mode.
2. Cross-cutting details are split out to:
   - `backend/gateway-auth.md`
   - `backend/config-and-ai.md`
   - `backend/observability.md`
   - `backend/services.md`
   - `backend/todone-core.md`

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
   - base platform keys in `PlatForm.InitCfg()`
   - AI keys from `share.DefaultAIConfigParams()`
   - see `backend/config-and-ai.md` for the complete config surface
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

## Frontend hosting mode (optional)

1. If `./front` exists and `use_front=true`, Gin serves frontend static resources and SPA fallback.
2. For development, frontend and backend are usually started separately.

## Reading map

1. Load `backend/gateway-auth.md` for:
   - route families
   - auth chain
   - cookie/session behavior
   - gateway error envelope
2. Load `backend/config-and-ai.md` for:
   - `CfgExt`
   - config routes and defaults
   - AI config and `/misc/gpt-rewrite`
   - R2 config and upload contract
3. Load `backend/observability.md` for:
   - logs
   - BI
   - SQL trace
   - pprof
