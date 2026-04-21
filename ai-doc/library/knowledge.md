# Library Module Knowledge

Last verified: 2026-04-22 (code + interaction verified)

## Module role and loading boundary

1. Library is rendered under `/todone/:group` and is activated only when `group type = 1` (`GroupType.Library`).
2. Shared `todone` behavior (route parsing, login gate, dir/group/subgroup baseline, permission gate, common RPC contract) is defined in `ai-doc/todone/knowledge.md`.
3. If current task涉及 todone 基础设定、共享路由鉴权、或入口问题，先加载 `ai-doc/todone/knowledge.md`；如果问题落在前端壳层，再补 `ai-doc/frontend/architecture.md`，再回到本文件处理 library 特有逻辑。
4. Library has no dedicated backend service; it is a behavior layer built on todone task storage plus `LibraryExtra` JSON in `Task.Note`.

## Frontend entry

1. Library lives inside `/todone/:group`, not under an independent route namespace.
2. It activates only when selected group type is `Library`.
3. Shared route/login/title behaviors come from todone shell; library adds list/detail/timeline/category/share behavior on top.

## API surface

1. Library uses todone RPC instead of a dedicated library RPC namespace.
2. Main calls are:
   - `getSubGroup`
   - `getTasks` with `ContainDone: true`
   - `createTask`
   - `changeTask`
   - `delTask`

## Backend dependency

1. Backend persistence is still todone `Task`.
2. Library-specific structure is serialized into `Task.Note`.
3. Subgroup convention prefers `_library_items_`, with legacy fallback to first subgroup and auto-create when none exists.

## Data model

1. Library item is stored as TODONE `Task`.
2. `Task.Note` stores `LibraryExtra` JSON.
3. Parse fallback:
   - empty or parse fail => default `LibraryExtra`
   - missing rounds => create `首周目`
4. Serialize cleans deprecated fields but does not auto-refresh `updatedAt`.
5. `updatedAt` refresh trigger:
   - manual `刷新` button
   - latest non-note/non-`timelineCutoff` log change (time-based sync)
6. List page derives runtime meta via `deriveLibraryMeta(extra)` with one log scan per item:
   - status snapshot (`status`, `todoReason`)
   - wait-expired flag (`鸽了`)
   - main score
   - parsed `createdAt/updatedAt` timestamps for sort
7. Derived meta is in-memory only and must not add new backend/database fields.
8. Cover asset contract:
   - `extra.pictureAddress`: original cover URL.
   - `extra.pictureAddressDetail` (optional): detail cover URL (cropped 2:3).
   - `extra.picturePreview` (optional): preview cover URL (list/timeline).
   - `extra.pictureAddressPreview` is kept as deprecated alias for legacy compatibility.
   - list/timeline read order is `picturePreview -> pictureAddressPreview -> pictureAddress -> placeholder`.
   - detail/share read order is `pictureAddressDetail -> pictureAddress -> picturePreview -> placeholder`.
9. Cover upload strategy:
   - always keep 2:3 crop interaction and upload 3 assets together:
     - original file => `pictureAddress`
     - cropped detail => `pictureAddressDetail` (`quality=0.92`; PNG source converts to JPEG for detail)
     - cropped preview => `picturePreview` (`width=480`, `quality=0.85`, JPEG)
   - detail drawer `更多 -> 图片库` provides "re-crop from original" action:
     - source uses `pictureAddress`
     - action opens interactive 2:3 crop again
     - updates only `pictureAddressDetail` and `picturePreview` (keeps original URL unchanged)
   - for legacy records missing detail/preview:
     - UI falls back to `pictureAddress` with center-crop display.
     - frontend background job tries to generate missing files from original URL with center crop.
     - successful backfill writes only backend data and logs console info; current page keeps old display until reopen (`verified via interaction`).
   - remote image fetch path used by legacy backfill and share/timeline export adds `__cf_bust` query + `cache: no-store` to reduce stale edge-cache CORS mismatch impact.

## Default UI state

1. `selectedCategory = all`
2. `selectedStatuses = [DOING, WAIT]`
3. `todoReasonFilter = all`
4. `sortBy = default`
5. `searchText = ''`
6. Main-page display options only keep:
   - `showScore`
   - `showCategory`
7. `showAuthor / showStartTime / showUpdateTime` are removed because they are no longer bound to card rendering.
8. Main-page title row includes a help button that opens `娱乐库状态与评分说明`, covering status semantics and scoring rules.
9. Detail drawer `体验记录` area exposes a note-visibility selector with 3 modes:
   - `隐藏`: hide note logs entirely
   - `缩略`: default mode; consecutive note logs collapse into `x条备注` and only show the plain start/end time range in the left content area
   - `显示`: render note logs in full with edit/delete/time controls
10. Detail drawer `体验记录` header adds `新增最新备注`, which opens the same add-note modal as `当前周目 -> 添加备注` and still writes to `extra.currentRound`.

URL sync contract (list + detail):

1. List page syncs current filters to URL query:
   - `library_category`
   - `library_statuses`
   - `library_todo_reason` (only when statuses exactly `[TODO]`)
   - `library_sort`
   - `library_search`
2. Detail drawer syncs currently opened item id to `library_detail`.
3. On first load, page restores filters/detail from URL query.
4. Default values are omitted from URL to keep links clean.
5. Empty status selection is encoded as `library_statuses=_empty_`.

Default sort rank:

1. `DOING`
2. `WAIT`
3. `none`
4. `TODO`
5. `DONE`
6. `wait_expired` (`鸽了`)
7. `GIVE_UP`
8. `ARCHIVED`

Within same status:

1. favorite first
2. then `updatedAt` descending
3. verified via interaction (2026-02-22): when two items are both `WAIT` and in different categories, a favorited item still stays ahead after the non-favorited item is edited.

## Status and timeline rules

1. Display status derives from logs (not deprecated cache fields).
2. `TODO` and `WAIT` allow same-status reason updates.
3. `DONE` closes current round (`endTime`).
4. Starting `DOING` on ended round should prompt confirmation.

Wait-expired (`鸽了`) rule:

1. Latest status is `WAIT`.
2. Wait reason is empty.
3. Wait duration >= 30 days.
4. If reason exists, do not classify as `鸽了`.

Timeline rules:

1. Aggregate logs across rounds by time descending.
2. `timelineCutoff` log itself is hidden.
3. Logs before cutoff are excluded.
4. Legacy `note: 添加到库` is normalized to `addToLibrary`.
5. `开始并完成` / `开始并放弃` only appear when:
   - same-day visible `DOING -> DONE` or `DOING -> GIVE_UP` pair can be merged, or
   - that round truly has no `DOING` log in original round logs.
   If `DOING` exists but is filtered out by year/cutoff, keep `DONE` as `完成` and `GIVE_UP` as `放弃`.
6. Round maintenance rules:
   - detail header provides `重命名 / 调整开始时间 / 删除周目`
   - deleting the last remaining round is blocked in UI and data layer
   - changing `round.startTime` also updates the current round's auto-generated start log time when that log can be identified
   - renaming a round also updates the auto-generated start log comment
7. Auto-generated round start log identification:
   - new rounds persist `autoRoundStart=true` on the first `DOING` status log
   - legacy data without the flag falls back to the first `DOING` log whose comment matches `开始<旧周目名>` or `开始了<旧周目名>`
   - once matched during rename/start-time edit, the log is normalized by writing back `autoRoundStart=true`

Share export rules:

1. Library detail `分享预览` export card must include main evaluation text at the bottom section (from main score log `comment`, with legacy fallback).
2. When current status is `DONE`, share export card must include current round date range in `YYYY-MM-DD - YYYY-MM-DD` format (without `开始/结束` prefix).

Score log display rules:

1. Both simple-score and complex-score timeline rows are clickable and open the same score detail popover.
2. Score comment preview in timeline/detail log list is single-line only.
3. When score comment preview is truncated, it renders as `前缀...(N字)` where `N` is the full trimmed character count.

## Common failure signatures

1. `group not exist`
2. `sub group not exist`
3. `task not exist`
4. `TODO-verify`: direct `/todone/:group` open may occasionally render empty list while API is healthy; reselecting same group from left tree can recover expected items.

## Verification focus

1. Load `library/testing.md` for add/edit/delete/filter/sort/cover/share regression matrix.
2. Regression should include switching back to a normal todone group because library and todone share the same entry shell and RPC family.
