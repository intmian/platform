# Backend Services Catalog

Last verified: 2026-02-27

## Scope

1. Summarizes registered backend services, their permission gates, and public RPC commands.
2. Focuses on stable contract-level facts for debugging and change impact analysis.

## Registered services

1. `auto`: report generation/query service.
2. `account`: account + permission token management.
3. `cmd`: script tool + runtime env execution service.
4. `todone`: todone domain service (dir/group/subgroup/task/tag).

## Not currently registered

1. `note` flag exists in shared enums but is not registered in `platform/core.go`.
2. `web-storage` service code exists, but is not registered in `platform/core.go`.

## Common RPC gateway contract

1. HTTP path: `POST /service/:name/:cmd`
2. Request body: forwarded as raw JSON into `share.Msg`.
3. Core dispatch calls `service.HandleRpc(msg, valid)`.
4. Service errors are wrapped by gateway as generic `svr error` unless debug mode is enabled.

## Service: account

## Responsibility

1. Account registration/deregistration.
2. Password-token permission mapping.
3. Login token verification source for web login.

## Permission gate

1. RPC handlers check `valid.HasPermission(admin)` for all management operations.
2. `/login` works because platform calls account with `MakeSysValid()`.

## Data storage

1. Uses local sqlite file `account.db` in backend run directory.
2. Password token is derived with `sha256(salt + pwd + account)`.
3. First `admin` login can bootstrap account from `base_setting.toml -> admin_pwd` if account does not exist yet.

## Public commands

1. `register`
2. `deregister`
3. `checkToken`
4. `delToken`
5. `changeToken`
6. `createToken`
7. `getAllAccount`

## Service: auto

## Responsibility

1. Daily/whole report generation and reading.
2. Integrates modules in `services/auto/mods` and scheduler/task manager.

## Permission gate

1. Base gate: `admin` or `auto` or `auto.report`.
2. Non-admin users:
   - only report read/generate commands are allowed when `auto.report` exists.
   - other commands are denied.

## Public commands

1. `getReport`
2. `getWholeReport`
3. `getReportList`
4. `generateReport`

## Service: cmd

## Responsibility

1. Manage script tools.
2. Manage runtime environments and files.
3. Run tasks and stream runtime IO/state.

## Permission gate

1. Allowed when any condition is true:
   - platform debug mode (`base_setting.toml -> debug=true`)
   - user has `admin`
   - user has `cmd`

## Runtime directories

1. Service base dir: `services/cmd`
2. Tool dir: `services/cmd/tool`
3. Runtime env dir: `services/cmd/run`

## Public commands

1. `createTool`
2. `updateTool`
3. `getTools`
4. `getToolScript`
5. `deleteTool`
6. `createEnv`
7. `getEnvs`
8. `getEnv`
9. `setEnv`
10. `getFile`
11. `setFile`
12. `runEnv`
13. `getTasks`
14. `getTask`
15. `stopTask`
16. `taskInput`

## Service: todone

## Responsibility

1. Dir/group/subgroup/task/tag CRUD and move flows.
2. Backend authority for task tree/state/order.

## Permission gate

1. Requires `admin` or `todone` permission.
2. Requires request payload `UserID` equals `valid.User`.

## Startup config keys

1. `todone/db/account_id`
2. `todone/db/api_token`
3. `todone/db/db_id`

## Public commands

1. `getDirTree`
2. `moveDir`
3. `moveGroup`
4. `createDir`
5. `changeDir`
6. `delDir`
7. `createGroup`
8. `changeGroup`
9. `delGroup`
10. `getSubGroup`
11. `createSubGroup`
12. `changeSubGroup`
13. `delSubGroup`
14. `getTask`
15. `getTasks`
16. `createTask`
17. `changeTask`
18. `delTask`
19. `taskMove`
20. `taskAddTag`
21. `taskDelTag`

## Core failure signatures to recognize

1. `no permission`
2. `user err`
3. `user not exist`
4. `group not exist`
5. `sub group not exist`
6. `task not exist`
7. `cmd not found`
