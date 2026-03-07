# Account Service

Last verified: 2026-03-06

## Scope

1. Covers backend account service internals under `backend/services/account`.
2. Focuses on account storage, token-permission mapping, bootstrap login behavior, and RPC quirks.

## Responsibility

1. Owns account records and password-derived permission tokens.
2. Provides the credential check used by platform `/login`.
3. Supports admin-side account and token management.

## Startup and runtime dependencies

1. Service is registered in `platform/core.go`.
2. Startup calls `accountMgr.Init(share.BaseSetting.AdminPwd)`.
3. Account storage is a dedicated local sqlite file:
   - `account.db`
4. Service property is `SvrPropCoreOptional`, so it is treated as core-optional and cannot be stopped through the normal admin stop path.

## Storage model

1. One storage row is keyed by account name.
2. Stored JSON shape contains:
   - `ID2PerInfos`
   - `LastTokenIndex`
   - `Creator`
   - `CreateAt`
   - `ModifyAt`
3. Each token record stores:
   - hashed token string
   - permission list
4. Password/token derivation is:
   - `sha256(salt + password + account)`
5. Password format accepted by token creation is:
   - only `\\w`
   - length `6-20`

## Bootstrap admin behavior

1. If account `admin` does not yet exist, `checkPermission("admin", pwd)` compares the submitted password against `base_setting.toml -> admin_pwd`.
2. On a match, service auto-creates account `admin`.
3. It then adds one token carrying `admin` permission.
4. This bootstrap path is only used before a persisted admin account exists.

## Permission model

1. Platform `/login` succeeds because it calls account `checkToken` with `MakeSysValid()`.
2. For normal RPC calls, management operations are intended to require `admin`.
3. `getAllAccount` explicitly returns `no permission` for non-admin callers.
4. Code fact: several other handlers (`register`, `deregister`, `checkToken`, `delToken`, `changeToken`, `createToken`) return zero-value success-shaped results when caller lacks `admin`, instead of returning a permission error.

## Public RPC commands

1. `register`
2. `deregister`
3. `checkToken`
4. `delToken`
5. `changeToken`
6. `createToken`
7. `getAllAccount`

## Common failure signatures

1. `account not exist`
2. `token not exist`
3. `token already exist`
4. `password format error`
5. `no permission`
6. `unknown cmd`

## Verification focus

1. Login bootstrap:
   - `POST /login` with initial admin password
2. Admin RPC:
   - `POST /service/account/checkToken`
   - `POST /service/account/getAllAccount`
3. Regression:
   - create or change one token, then read back via `getAllAccount`

## Known design constraints

1. Password token hashing uses a hardcoded salt constant in code.
2. Account data is stored outside the shared platform storage DB.
3. Permission-denied behavior is inconsistent across handlers, so callers should not assume all denied account RPCs fail with `code=1`.
