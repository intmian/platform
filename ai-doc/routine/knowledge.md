# Routine Checklist Knowledge

Last verified: 2026-11-09 (code; rule-engine scenario script; UI interaction against the real backend on the test Todone Worker/D1)

## Scope

1. Routine checklist ("例行清单") is Todone group `Type=2`. It reuses the Todone hierarchy (`Group -> SubGroup -> Task tree`) for structure, titles, notes and order, and stores routine configuration/state in the side table `routine_nodes`.
2. Frontend: `frontend/src/todone/Routine.tsx` (page), `RoutineParts.tsx` (check, ring, rhythm chip, rule editor), `routineRule.ts` (pure rule engine), `Routine.css`. Selected from `Main.tsx` by group type; created from the directory add modal option `例行清单`.
3. Backend: `backend/services/todone/{msg_routine.go,msg_process_routine.go,db/routine.go}`; contract in `backend/todone-core.md`.

## Structure

1. Top-level cards are SubGroups. Inside, tasks nest arbitrarily via `ParentID`. Creating a routine group does not seed the usual "默认" subgroup; the page starts empty.
2. A task is a folder when its routine node has `Folder=true` or it has children. Folders only aggregate; leaves are the checkable items. Folders and items render as the same kind of row (no folder icon); folders add a count and a caret.
3. `Optional` and `Temp` inherit downward. Optional leaves never block "this period is done".
4. Task `Done` is never used for routine items, so normal subgroup ordering (`taskSequence`) stays stable; tasks are always loaded with `ContainDone=false`.

## Rhythm model

1. Only a layer that sets a rule (group, subgroup, folder or single item) has a rhythm; it is the "rhythm owner". Every descendant without its own rule follows the nearest owner and is a plain checkbox with no dates of its own. The group default is manual.
2. When the owner reaches a refresh date, all following leaves start over (checks from before the period start no longer count). Nothing is written at refresh time; it is derived on read.
3. A descendant with its own rule is an independent owner: the parent refresh does not touch it, and it does not count toward the parent's "period done".
4. Temp items ("本次补充") cannot own a rule; they follow their owner, are only unchecked on refresh, and are never removed automatically.
5. No lead time: a period starts on its refresh date. Before the first refresh date (on or after `start`) the owner is "未开始": its leaves are greyed, not checkable and excluded from progress.
6. A layer's check, x/y count and progress bar cover only the leaves following that layer's rhythm; leaves with their own rhythm are noted as "另有 N 项各自节奏" and toggled only by themselves. A folder whose leaves all have their own rhythm is a pure container: no checkbox, tapping it collapses/expands.

## Rule engine (`routineRule.ts`)

1. Rules (JSON in `routine_nodes.rule`), each periodic rule has `start` (count from this date) and optional `grace` days:
   - `manual` (described as "手动重置", with a reset icon instead of the calendar icon): refreshed only by "清空重来".
   - `day`: every N days from `start`.
   - `week`: every N weeks on one or more weekdays; weeks start Monday and the phase comes from `start`'s week.
   - `month`: every N months with N in 1/2/3/4/6/12, aligned to the calendar year; `offset` is the month inside the cycle (the month itself for yearly); day is a date (clamped to month end), last day, or nth/last weekday. Descriptions list the months, e.g. `2/5/8/11 月第一个周六`.
   - `after`: next refresh = completion date + N days ("完成后 N 天"); the first period starts at `start`. An unfinished period never refreshes; it just stays overdue.
   - Old `calendar`/`interval` JSON parses as null (inherit).
2. Deadline = period start + `grace` (capped to the day before the next refresh). Status: `今天` / `还剩 N 天` / `今天截止` / `逾期 N 天` / `下次 X` / `X 开始`. If the next refresh arrives unfinished, checks are cleared anyway and the owner shows `前 N 期没做`, counted from refresh dates after the last completed period.
3. Marks:
   - Following leaf: check time (ISO); checked iff its date ≥ current period start (manual: non-empty).
   - Owner: `periodStart|doneDate`, written when the period becomes complete. When it becomes incomplete again it is restored from `PrevMark`, or, if there is none, set by `undoneMark` (calendar: previous period marked done, so no missed count appears; `after`: `periodStart|` keeps the period start). It drives `after` rules, single-item owners' check state and the missed count.
4. Changing a layer's rule clears that layer's owner mark; leaf checks are left as is and re-evaluated against the new period.

## Interaction notes

1. Row tap toggles; a folder or card toggles its same-rhythm active leaves (all checked → uncheck all). Tapping a not-started item shows "X 才开始".
2. Every layer shows its rhythm: owners a two-part chip (rule | status, rule text truncates first); folders and cards that inherit a muted rule text, clickable to set their own. Leaves that inherit show nothing. Unchecked leaves of an overdue owner get a red ring.
3. Same features on every layer: rhythm, count, and adders `事项 / 分组 / 本次补充` (nested adders appear on hover). Top-level cards additionally keep the card frame, progress bar, overdue dot (counted over the whole card) and the "清空重来" menu entry.
4. Header: progress ring over all active leaves, group rhythm chip, overdue/today counts, hide-done toggle, review drawer, manual reset, settings.
5. "清空重来" (group or top-level subgroup) opens a dialog: it clears checks under manual rhythms; each temp item has a "留下" switch that converts it to a permanent item, the others are deleted. Date-based rhythms are not affected.
6. Rule editor: 跟随 / 手动 / 按天 / 按周 (weekday chips, multi-select) / 按月 (frequency, month in cycle, date / nth weekday / last day) / 顺延, plus "从…起算", "宽限 N 天", and a live preview of the current period and the next refreshes.
7. Drag (one `DndContext` for the whole page, `useDraggable` on the handle + `useDroppable` per row and per card, `DragOverlay` for the moving row): pointer in the top/bottom part of a row inserts before/after it at that level; the middle of a folder row drops inside (end); over a card but not a row drops at the card's end. Cross-level and cross-card moves go through `taskMove` (`TrgTaskID=0, After=true` appends). A node cannot be dropped into its own subtree; a parent that loses its last child keeps `Folder=true`; collapsed folders/cards auto-expand after hovering 500 ms. Rows are not translated while dragging (each row sits in a clipping collapse wrapper), and the drop position uses the real pointer position because dnd-kit deltas exclude page scroll.
8. Row hit areas: handle, caret and `⋯` are full-row-height square zones (hover tint drawn on an inner pseudo element, so corners still hit); only the checkbox, title and remaining row area toggle.
9. "清空重来" stays visible wherever manual-rhythm items or temp items exist, disabled when there is nothing to clear.
10. Per-viewer UI state lives in localStorage keys `todone:routine:*`.

## Verification focus

1. Run the real backend from `backend/test`: its CfgExt (`db.sqlite`, key `todone.db.worker_endpoint`) points at the test Todone Worker, not production; `base_setting.toml` carries no Todone Worker keys. Login uses `admin` with `admin_pwd` from `backend/test/base_setting.toml` (see `todone/testing.md`). Startup auto-migrates `routine_nodes`, so never point a local run at the production Worker.
2. When seeding through the API, call `getTasks` for each new subgroup before creating tasks (see `backend/todone-core.md` known constraints), otherwise folders jump ahead of earlier siblings.
3. Create a dedicated routine group for tests and delete it afterwards with `delGroup` (soft delete; its `routine_nodes` rows stay as harmless orphans).
4. Rule engine scenarios worth re-running after changes: weekly overdue and missed count, grace and its cap, monthly nth/last weekday and day-31 clamping, quarterly/yearly month alignment, every-N-weeks phase, `after` done/reopen, not-started.
