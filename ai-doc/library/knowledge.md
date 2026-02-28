# Library Module Knowledge

Last verified: 2026-02-28

## Entry dependency on Todone

1. Library is rendered under `/todone/:group` and is activated only when `group type = 1` (`GroupType.Library`).
2. Shared `todone` behavior (route parsing, login gate, dir/group/subgroup baseline, permission gate, common RPC contract) is defined in `ai-doc/todone/knowledge.md`.
3. If current task涉及 todone 基础设定或入口问题，先加载 `ai-doc/todone/knowledge.md`，再回到本文件处理 library 特有逻辑。

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

## Subgroup convention

1. Preferred subgroup title: `_library_items_`.
2. Load behavior:
   - find `_library_items_`
   - fallback first subgroup for legacy data
   - create `_library_items_` if none exists, then reload

## Backend calls used by library page

1. Based on todone RPC (`/service/todone/*`), library page主要使用：
   - `getSubGroup`
   - `getTasks` with `ContainDone: true`
   - `createTask`
   - `changeTask`
   - `delTask`

## Default UI state

1. `selectedCategory = all`
2. `selectedStatuses = [DOING, WAIT]`
3. `todoReasonFilter = all`
4. `sortBy = default`
5. `searchText = ''`

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

## Common failure signatures

1. `group not exist`
2. `sub group not exist`
3. `task not exist`
4. `TODO-verify`: direct `/todone/:group` open may occasionally render empty list while API is healthy; reselecting same group from left tree can recover expected items.
