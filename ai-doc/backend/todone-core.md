# Todone Backend Core

Last verified: 2026-02-27

## Scope

1. Covers backend internals under `backend/services/todone`.
2. Focuses on data model, in-memory model, ordering, cache, and move/delete semantics.

## Data model (DB layer)

1. `DirDB`: directory node (`id`, `parent_id`, `index`, title/note, user).
2. `GroupDB`: group node (`type`, `parent_dir`, `deleted`, `index`).
3. `SubGroupDB`: subgroup node (`parent_group_id`, `index`, `task_sequence`).
4. `TaskDB`: task entity (`parent_sub_group_id`, `parent_task_id`, `done`, `deleted`, time fields, task type/status fields).
5. `TagsDB`: task-tag relation (`task_id`, `tag`, user).

## Group type contract

1. `GroupTypeNormal = 0`
2. `GroupTypeLibrary = 1`
3. Frontend library mode depends on group type from backend group data.

## Service startup and DB connect

1. Todone service registers config keys:
   - `todone/db/account_id`
   - `todone/db/api_token`
   - `todone/db/db_id`
2. `db.InitGMgr` creates D1 gorm connections for:
   - dir
   - group
   - task
   - tags
   - subgroup
3. Auto-migrate runs on all todone tables at startup.
4. SQL trace is hooked into xbi table `todone_db_log`.

## Runtime model

1. User-level entry is `UserMgr -> UserLogic` (one per user ID).
2. `UserLogic` uses one mutex for full user graph operations (dir/group/subgroup/task path).
3. Dir tree is lazy-loaded into memory (`dirTree` + `dirMap`) from DB.
4. `GroupLogic` lazily loads subgroup list and caches it.
5. `SubGroupLogic` stores:
   - `unFinTasksCache` (unfinished task cache)
   - `taskSequence` (`MapIdTree`, parent->ordered child IDs)

## Ordering model

1. Dir/group visual order uses float `index`, with midpoint insertion for drag/move cases.
2. Task order is controlled by subgroup `taskSequence` JSON, not by DB float index.
3. `taskSequence` is persisted in `SubGroupDB.TaskSequence`.
4. Done tasks are placed behind unfinished tasks in returned protocol order by assigning large synthetic index in logic path.

## Task loading and cache behavior

1. `GetTasks(containDone=false)`:
   - loads unfinished tasks from DB
   - hydrates tags in batch
   - updates `unFinTasksCache`
   - rebuilds sequence and removes orphan chains from cache
2. `GetTasks(containDone=true)`:
   - loads all non-deleted tasks
   - keeps finished tasks but places them after unfinished tasks in output index mapping
3. Tag batch query uses chunked `IN` (`MaxInSize=50`) for D1/SQLite friendliness.

## Subgroup autosave behavior

1. `SubGroupLogic` starts autosave goroutine at creation.
2. Every 5 seconds, if subgroup mutable fields changed, `UpdateSubGroup` is called.
3. On context cancellation, pending subgroup changes are flushed once before exit.

## Move flow (`taskMove`)

1. Service handler calls:
   - old subgroup `BeforeTaskMove`
   - new subgroup `AfterTaskMove`
2. `BeforeTaskMove` recursively collects moving roots + descendants.
3. Returns:
   - temporary move sequence map
   - IDs that need parent change
   - IDs that keep relative parent within moving set
4. `AfterTaskMove` updates DB in batch:
   - `UpdateTasksParentTaskID` for root set
   - `UpdateTasksSubGroupID` for all moved IDs
5. Then merges sequence and rehydrates cache/tags in target subgroup.

## Delete semantics

1. `DelDir`: hard delete, only when no child dirs/groups.
2. `DelGroup`: soft delete (`deleted=true`).
3. `DelSubGroup`: hard delete.
4. `DelTask`: soft delete (`deleted=true`) and sequence/cache cleanup for unfinished path.

## Permission and validation contracts

1. RPC permission: `admin|todone`.
2. Request `UserID` must equal token user.
3. Frequent error strings:
   - `user err`
   - `user not exist`
   - `group not exist`
   - `sub group not exist`
   - `task not exist`

## Known design constraints

1. User-level global mutex simplifies consistency but serializes all operations per user.
2. Task order correctness depends on subgroup `taskSequence` integrity.
3. Mixed soft/hard delete strategy means troubleshooting should inspect both logical flags and physical rows.
4. `TODO-verify`: when a brand-new user has no dir row, root dir creation path in `buildDirTree` creates DB row but in-memory root binding should be rechecked during first request path.
