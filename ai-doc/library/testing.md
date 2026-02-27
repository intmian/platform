# Library Module Testing

Last verified: 2026-02-27

## Preconditions

1. Shared todone baseline (route/auth/permission/addr) follows `ai-doc/todone/knowledge.md`.
2. Use group type `Library` (`type=1` in `/todone/:group`).
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
6. Cover crop interaction (verified via interaction, 2026-02-25):
   - open add/detail cover upload, enter crop modal
   - on mobile viewport, drag image with touch/pointer should move preview position
   - on desktop viewport, mouse drag should still work
7. Cover upload strategy regression:
   - new upload should write 3 URLs:
     - `pictureAddress` (original)
     - `pictureAddressDetail` (cropped detail)
     - `picturePreview` (cropped preview, `480w`)
   - list/timeline should use preview URL; detail/share should use detail URL.
   - deleting cover should clear `pictureAddress`, `pictureAddressDetail`, `picturePreview` (and deprecated alias `pictureAddressPreview`).
   - detail toolbar should provide `更多(...) -> 图片库` entry and show all 3 URLs.
   - legacy item (missing detail/preview) should:
     - render with `pictureAddress` fallback
     - trigger background backfill and print console log indicating next-open visibility.
8. Mobile layout regression:
   - photo wall should stay at fixed 3 columns on mobile viewport.
   - opening detail drawer on mobile should not show right-side blank strip / horizontal overflow.

## Filters and sort checks

1. Status filter combinations, including empty selection => empty list.
2. TODO reason filter visible only when selected statuses are exactly `[TODO]`.
3. Category filter (`all`, specific, `_uncategorized_`).
4. Search over title/author/category.
5. Sort modes (`default/index/createdAt/updatedAt/title/score`).
6. `default` sort regression:
   - same status (for example `WAIT`) + different categories
   - mark item A favorite
   - edit item B to refresh `updatedAt`
   - expect A still ranked before B.

## Status and timeline checks

1. TODO requires reason input.
2. WAIT can be empty reason.
3. DONE closes round.
4. Wait-expired rule validation.
5. New round prompt when restarting DOING after round end.
6. Timeline order and cutoff behavior.
7. `updatedAt` trigger regression:
   - click detail `刷新` => `updatedAt` changes
   - add/edit only `备注` or set `时间线断点` => `updatedAt` unchanged
   - add status/score log and ensure it becomes latest non-note/non-cutoff log => `updatedAt` follows latest log time

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
