# Library Module Knowledge

Last verified: 2026-02-22

## Route and entry model

1. Library is rendered under `/todone/:group` (not standalone `/library`).
2. `group` is URL-encoded `addr|title|type`.
3. `type === 1` (`GroupType.Library`) renders library UI; otherwise normal task board.
4. Group creation UI allows `groupType=1` label `图书馆`.

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

## Subgroup convention

1. Preferred subgroup title: `_library_items_`.
2. Load behavior:
   - find `_library_items_`
   - fallback first subgroup for legacy data
   - create `_library_items_` if none exists, then reload

## Backend contract used by library page

Endpoint prefix: `/service/todone/`

1. `getSubGroup`
2. `createSubGroup`
3. `getTasks` with `ContainDone: true`
4. `createTask`
5. `changeTask`
6. `delTask`

Permission and identity gates:

1. Need permission in `admin` or `todone`.
2. `req.UserID` must equal authenticated `valid.User`.

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
4. `user not exist`
5. `no permission`
6. `user err`
7. `TODO-verify`: direct `/todone/:group` open may occasionally render empty list while API is healthy; reselecting same group from left tree can recover expected items.
