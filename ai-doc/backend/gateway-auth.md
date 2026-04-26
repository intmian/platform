# Backend Gateway And Auth

Last verified: 2026-04-26

## Scope

1. Covers Gin route families, gateway dispatch, cookie auth, and permission flow.
2. Service-internal permission rules still belong in `backend/services.md` or service deep docs.

## Route families

1. Public auth routes:
   - `POST /login`
   - `POST /logout`
   - `POST /check`
2. Admin routes under `/admin`:
   - service lifecycle
   - storage access
   - log lookup
   - system usage and SSE
   - BI log search
3. Service gateway routes:
   - `POST /service/:name/:cmd`
   - `POST /debug/:name/:cmd`
4. Config routes:
   - `POST /cfg/plat/set`, `/cfg/plat/get`
   - `POST /cfg/:svr/set`, `/cfg/:svr/get`
   - `POST /cfg/:svr/:user/set`, `/cfg/:svr/:user/get`
5. Misc routes:
   - `POST /misc/gpt-rewrite`
   - `POST /misc/r2-presigned-url`
   - `POST /misc/subscription/*`
   - `POST /misc/money/*`

## Service gateway contract

1. `POST /service/:name/:cmd` reads raw JSON body and wraps it into `share.Msg`.
2. Service lookup is by platform service name -> service flag mapping.
3. The gateway builds `share.Valid` from cookie token and forwards it to `service.HandleRpc`.
4. Unknown service returns `code=1`, `msg="service not exist"`.
5. Success envelope is:
   - `code=0`
   - `data=<service return>`
6. Failure envelope is usually:
   - `code=1`
   - `msg="svr error"`
7. When `base_setting.toml -> debug=true`, service errors can be returned directly instead of the generic message.

## Debug route contract

1. `POST /debug/:name/:cmd` only works when backend debug mode is enabled.
2. Request body is decoded into numeric/string debug arrays, not normal RPC payload.
3. Debug route does not replace normal service verification; it is an explicit debug-only side channel.

## Login flow

1. `POST /login` accepts:
   - `username`
   - `password`
2. Platform validates credentials by calling account service `checkToken` with `MakeSysValid()`.
3. On success, platform converts returned permissions into a signed token payload and stores it in cookie `token`.
4. Cookie payload is JSON containing:
   - `User`
   - `Permission`
   - `ValidTime`
   - signed token string
5. Admin login also triggers push notification through platform push integration.

## Check and refresh flow

1. `POST /check` reads cookie `token`.
2. Validation requires:
   - token signature valid
   - token not expired
3. Non-admin tokens are auto-refreshed when remaining validity is less than 2 days.
4. Refresh extends validity to 7 more days from current time.
5. Failure signatures include:
   - `token not exist`
   - `token invalid`

## Admin gate

1. `/admin/*` routes use `checkAdmin`.
2. `checkAdmin` only accepts tokens that still carry `admin` permission.
3. Admin gate happens before route handler logic.

## Permission boundary

1. Gateway auth only proves caller identity and passes permissions through.
2. Each backend service still owns its own business permission checks.
3. A successful `/check` response does not imply permission to call a given `/service/:name/:cmd`.
4. Platform-owned misc handlers also own their own permission checks; family money book management, delete/disable, JSON archive, Excel import, and record APIs require `admin`, while `dashboard/get` allows `admin` or per-book viewer ACL.

## Cookie and salt behavior

1. Web JWT signing salt is derived from:
   - persistent storage key `WebSalt1`
   - current year-month string
2. Rotating the month rotates effective token salt and can force re-login across months.

## Loading guidance

1. Load this file when the task touches:
   - login/logout/check behavior
   - cookie/session issues
   - permission propagation
   - gateway route dispatch
   - generic service error envelopes
