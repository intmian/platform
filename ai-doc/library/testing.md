# Library Module Testing

Last verified: 2026-02-22

## Preconditions

1. Use group type `Library` (`type=1` in `/todone/:group`).
2. Backend auth must satisfy `admin|todone` and user identity match.
3. Ensure subgroup path is valid (`_library_items_` preferred).
4. Local login baseline:
   - username: `admin`
   - password source: `backend/test/base_setting.toml` -> `admin_pwd`

## Core matrix

1. Entry routing:
   - open `/todone/:group`
   - verify `type=1` renders library
2. First load:
   - verify `getSubGroup -> getTasks(ContainDone=true)`
   - verify default filters: `DOING + WAIT`
   - verify default sort: `default`
3. Add flow:
   - create item in add modal
   - verify `Task.Note` can be parsed to `LibraryExtra`
   - verify detail drawer auto-opens after success
4. Edit flow:
   - modify title/category/author/status
   - verify `changeTask` path and list update
5. Delete flow:
   - delete item
   - verify `delTask` and list removal

## Filters and sort checks

1. Status filter combinations, including empty selection => empty list.
2. TODO reason filter visible only when selected statuses are exactly `[TODO]`.
3. Category filter (`all`, specific, `_uncategorized_`).
4. Search over title/author/category.
5. Sort modes (`default/index/createdAt/updatedAt/title/score`).

## Status and timeline checks

1. TODO requires reason input.
2. WAIT can be empty reason.
3. DONE closes round.
4. Wait-expired rule validation.
5. New round prompt when restarting DOING after round end.
6. Timeline order and cutoff behavior.

## Failure isolation

1. No data:
   - check `getSubGroup` response
   - check subgroup ID used by `getTasks`
   - if direct route shows empty but known data exists, reselect the group once from left tree and re-check (`TODO-verify` root cause)
2. Data shape issue:
   - inspect `Task.Note` parse fallback
3. Save failed:
   - inspect `changeTask` payload
   - map backend error signatures
4. Wrong status rendering:
   - inspect latest status log derivation

## Regression minimum

1. Re-run target scenario with pre/post evidence.
2. Switch to non-library group and confirm normal task board still works.

## Performance check (list path)

1. In dev mode, use browser console metric `[LibraryPerf]`.
2. Compare identical interaction path before/after:
   - initial list load
   - status/category/search filter changes
   - sort changes (`default` and `score` at minimum)
3. Verify no behavior drift while perf probe improves or remains stable.

## Known non-blocking console warnings

1. Existing AntD/rc deprecation warnings may appear during regression:
   - `Select.Option` / `option`
   - `rc-collapse children`
   - `Timeline.Item`
2. Treat them as non-blocking for this module unless new functional errors are introduced.
