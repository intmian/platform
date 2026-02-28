# Todone Module Knowledge

Last verified: 2026-02-27

## Scope and loading boundary

1. Todone is the shared task platform module under `frontend/src/todone` + `backend/services/todone`.
2. Group `Type=0` is normal task board; `Type=1` is library extension branch.
3. When current work touches library-specific behavior (timeline/score/cover/category/share), load `ai-doc/library/*` in addition to this file.
4. When current work touches backend internals (service startup/permission, sequence/cache/move correctness, DB model), also load:
   - `ai-doc/backend/architecture.md`
   - `ai-doc/backend/services.md`
   - `ai-doc/backend/todone-core.md`

## Route and entry model

1. Frontend routes: `/todone` and `/todone/:group` (`frontend/src/App.jsx`).
2. `:group` is URL-encoded `addr|title|type`; decode failure or missing data falls back to opening the directory drawer.
3. `addr` is hierarchical path like `dir-1/grp-2/subgrp-3/task-4` (`frontend/src/todone/addr.ts`).
4. Selecting a group in drawer rewrites URL via `window.history.replaceState` with encoded `addr|title|type`.
5. Page title switches by group type:
   - normal: `TODONE 任务板: <title>`
   - library: `TODONE 娱乐库: <title>`
6. Page favicon is replaced to `/todone-mini.png` in `Todone` mount effect.

## Auth and settings

1. Page-level login gate is handled by `useLoginGate()` in `Todone`, not by child components.
2. Drawer `User` component uses `autoOpenLoginPanel={false}` to avoid duplicate login popup.
3. Backend service requires permission `admin|todone` and enforces `req.UserID == valid.User`.
4. Todone server config keys:
   - `todone/db/account_id`
   - `todone/db/api_token`
   - `todone/db/db_id`
5. Frontend `TodoneSetting` and backend service both bind to the same config keys; runtime config update prompt indicates restart is required.
6. Health probe in frontend debug chain:
   - browser request uses `POST /api/check` (because `api_base_url="/api"` in `frontend/src/config.json`)
   - Vite proxy rewrites `/api/check` -> backend `POST /check` (`frontend/vite.config.js`)
   - direct backend probe should call `POST /check`
   - `GET /check` and `GET /api/check` are not valid for this route

## Data hierarchy and core flows

1. Hierarchy: `Dir -> Group -> SubGroup -> Task`.
2. Dir tree:
   - load via `getDirTree`
   - expanded keys persisted in `localStorage` key `todone:dir:expandedKeys`
   - supports create/change/delete/move dir and create/change/delete/move group.
3. Group type selection is available when creating group in dir tree:
   - `0` 普通
   - `1` 图书馆
4. Normal group page (`Group.tsx`) loads subgroup list via `getSubGroup`.
5. Subgroup panel (`SubGroups.tsx`) loads task list via `getTasks`:
   - default `ContainDone=false` in normal todone board
   - can toggle `显示已完成/隐藏已完成`.
6. Subgroup UI state persistence:
   - expand: `todone:subgroup:open:<subGroupAddr>`
   - index order: `todone:subgroup:indexsmallfirst:<subGroupAddr>`
7. Task tree is frontend in-memory structure (`TaskTree`) built by `ParentID`; used for render and optimistic move.
8. Task quick-create is in `TaskList`:
   - supports `TODO/DOING` type + auto-start
   - uses `createTask`.
9. Task detail (`TaskDetail`) edits title/note/time/status/type and saves via `changeTask`; deletes via `delTask`; move uses `taskMove`.
10. Row-level context menu supports copy content/path, flag tag (`[system]flag` via `taskAddTag/taskDelTag`), move, delete.
11. Drag sorting and bulk move both call `taskMove`; success path currently triggers refresh/reload to resync server order.

## Backend RPC contract (prefix `/service/todone/`)

1. Dir/Group: `getDirTree`, `moveDir`, `moveGroup`, `createDir`, `changeDir`, `delDir`, `createGroup`, `changeGroup`, `delGroup`
2. SubGroup: `getSubGroup`, `createSubGroup`, `changeSubGroup`, `delSubGroup`
3. Task: `getTask`, `getTasks`, `createTask`, `changeTask`, `delTask`, `taskMove`, `taskAddTag`, `taskDelTag`

## Common failure signatures

1. `no permission`
2. `user err`
3. `user not exist`
4. `group not exist`
5. `sub group not exist`
6. `task not exist`
