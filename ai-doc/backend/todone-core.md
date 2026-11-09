# Todone Backend Core

Last verified: 2026-07-13

## Scope

1. Covers backend internals under `backend/services/todone`.
2. Focuses on data model, in-memory model, ordering, cache, and move/delete semantics.

## Data model (DB layer)

1. `DirDB`: directory node (`id`, `parent_id`, `index`, title/note, user).
2. `GroupDB`: group node (`type`, `parent_dir`, `deleted`, `index`).
3. `SubGroupDB`: subgroup node (`parent_group_id`, `index`, `task_sequence`).
4. `TaskDB`: task entity (`parent_sub_group_id`, `parent_task_id`, `done`, `deleted`, time fields, task type/status fields).
5. `TagsDB`: task-tag relation (`task_id`, `tag`, user).
6. `LibraryNoteDB`: private Library round notes (`task_id`, stable `round_id`, content, event time, revision, idempotency id, soft delete).
7. `LibraryScoreDetailDB`: per-score evaluation detail (`score id`, task/round scope, mode, main/dimension comments and values, revision, idempotency id, soft delete).
8. `RoutineNodeDB` (`routine_nodes`): routine checklist config/current state per node. String primary key `kind:nodeID` (kind 0 group, 1 subgroup, 2 task), scoped by `user_id`+`group_id`; fields `folder`, `optional`, `temp`, `rule` (JSON), `mark`, `prev_mark`. No history rows.

## Group type contract

1. `GroupTypeNormal = 0`
2. `GroupTypeLibrary = 1`
3. `GroupTypeRoutine = 2`
4. Frontend library/routine mode depends on group type from backend group data.

## Service startup and DB connect

1. Todone D1 is Worker-only. Startup registers and reads `todone.db.worker_endpoint` / `todone.db.worker_token` from `CfgExt`, with `PLATFORM_TODONE_WORKER_*` environment overrides for tests/operations. There is no production endpoint default and no legacy `todone.db.api_token` migration.
2. `db.InitGMgr` opens one root `*gorm.DB`, then keeps the existing logical connection map for:
   - dir
   - group
   - task
   - tags
   - subgroup
   - library note
   - library score detail
   - routine
   Every `ConnectType` maps to the same root GORM handle and underlying `database/sql` pool.
3. Auto-migrate runs serially in the above order at startup; it no longer writes the connection map or migrates the same D1 concurrently.
4. `library_notes.revision` is initialized explicitly by application/migration writes and intentionally has no GORM database-default tag. The D1 adapter cannot introspect column defaults, so adding one makes a second `AutoMigrate` incorrectly request a destructive alteration. UUID columns likewise use D1 `TEXT` without GORM size declarations.
5. SQL trace is hooked into xbi table `todone_db_log`.
6. GORM connection creation explicitly pings the Worker so missing endpoint, invalid bearer auth, or unavailable Worker fails service startup.
7. GORM SQL logging uses parameterized queries so private note bodies and other values do not enter local SQL/BI logs.
8. Production Worker deployment, secret rotation, diagnosis, and D1 recovery are owned by `backend/d1-worker-operations.md`.

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
4. Library notes are loaded only for an open Library task and only for round UUIDs currently present in `Task.Note`; removed-round notes remain stored but inaccessible.
5. Library score details are never batch-loaded. Core score logs remain in `Task.Note`; an explicit view/edit/share action resolves one active score UUID and reads only its detail row.

## Library note contract

1. Public commands are `getLibraryNotes`, `createLibraryNote`, `changeLibraryNote`, and `delLibraryNote` under the existing todone RPC namespace.
2. Handlers require the normal `admin|todone` gate, exact user match, a Library group, a live task, and valid stable round UUIDs.
3. Create uses a client request UUID for idempotency; edit/delete use revision-based optimistic locking.
4. Delete is soft delete. Note operations never mutate `Task.Note` or Library business `updatedAt`.
5. Note bodies are capped at 64 KiB and a single task read fails rather than silently truncating beyond 500 active notes.
6. Historical embedded notes are moved only by the stopped-service command `backend/cmd/migrate_library_notes`; runtime code does not perform online migration or dual reads.

## Library score detail contract

1. Public commands are `getLibraryScoreDetail`, `createLibraryScoreDetail`, and `changeLibraryScoreDetail` under the Todone RPC namespace.
2. The normal Todone permission/user gate applies. Reads and edits require the score UUID to exist in the current Task/round core graph; create may prewrite an idempotent detail for an active round before the slim score is saved into `Task.Note`.
3. Score details have a combined 64 KiB comment limit. Dimension values are 1-5 and adjustment is `-1/0/1`.
4. Score detail create is idempotent by client request UUID; edits use revision optimistic locking.
5. Score deletion removes the slim core score. Its detail row is retained but becomes inaccessible, matching removed-round note behavior.
6. `backend/cmd/migrate_library_score_details` performs the stopped-service conversion: stable score IDs and `mainScoreID` remain in Task, while comments/mode/complex dimensions move into the side table.

## Routine checklist contract

1. Public commands are `getRoutine` (all nodes of one group) and `saveRoutine` under the Todone RPC namespace, with the normal `admin|todone` gate and exact user match; the group must be `GroupTypeRoutine`.
2. `saveRoutine` validates every node and deletion first (group node ID must equal the group, subgroup must belong to the group, task must be live, owned by the user and belong to `SubGroupID`), then deletes `DelTasks` through `SubGroupLogic.OnDeleteTasks` plus their routine nodes, then upserts nodes. Deleted task IDs in the same request are skipped from upsert.
3. Upsert reads existing IDs then updates/creates rows; it does not depend on dialect `ON CONFLICT` support. Limits: rule 2 KiB, marks 64 bytes, 2000 nodes per request.
4. Backend stores rules and marks opaquely; refresh dates, the current period, grace and missed counts are computed in the frontend (`routineRule.ts`) using the viewer's local date. See `routine/knowledge.md`.
5. Orphan nodes left by ordinary `delTask`/`delSubGroup` are harmless and ignored by the frontend.
6. Task ownership checks read `TaskDB` directly. Do not validate foreign IDs through `SubGroupLogic.GetTaskLogic`: for uncached tasks it calls `taskSequence.GetSequenceOrAdd`, which appends the ID to that subgroup's order before any ownership check.
7. `UserLogic.CreateGroup` seeds a "默认" subgroup for every group type except `GroupTypeRoutine`.

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
4. Confirmed via real Worker interaction (2026-11-09): `CreateTask` only appends to `taskSequence` after the subgroup cache is loaded, while creating a child calls `GetTaskLogic(parent)`, which appends the parent immediately. Creating tasks through the API on a subgroup whose cache was never loaded therefore moves parents with children ahead of earlier siblings. The UI always loads `getTasks` first; API seed scripts must call `getTasks` for each subgroup before creating tasks.
5. Confirmed via real Worker interaction (2026-07-10): when a brand-new user has no dir row, the first `getDirTree` creates the root DB row but leaves the in-memory root unbound and panics in `dirTreeToProtocol`; the next request succeeds after rebuilding from the persisted row.
