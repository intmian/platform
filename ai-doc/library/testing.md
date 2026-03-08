# Library Module Testing

Last verified: 2026-03-08 (matrix updated, TODO-verify via interaction)

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
   - ratio-fit edge case: when source image ratio exactly equals crop ratio, confirm max selectable crop can cover full source (no 1-3px width/height loss caused by rounding).
7. Cover upload strategy regression:
   - new upload should write 3 URLs:
     - `pictureAddress` (original)
     - `pictureAddressDetail` (cropped detail)
     - `picturePreview` (cropped preview, `480w`)
   - list/timeline should use preview URL; detail/share should use detail URL.
   - deleting cover should clear `pictureAddress`, `pictureAddressDetail`, `picturePreview` (and deprecated alias `pictureAddressPreview`).
   - detail toolbar should provide `更多(...) -> 图片库` entry and show all 3 URLs.
   - in image library modal, click `从原图重裁并更新`:
     - must re-open interactive crop modal with `pictureAddress` as source
     - after confirm, `pictureAddressDetail` + `picturePreview` should change
     - `pictureAddress` should remain unchanged
   - legacy item (missing detail/preview) should:
     - render with `pictureAddress` fallback
     - trigger background backfill and print console log indicating next-open visibility.
8. Mobile layout regression:
   - photo wall should stay at fixed 2 columns on mobile viewport.
   - opening detail drawer on mobile should not show right-side blank strip / horizontal overflow.
9. Export content regression:
   - in detail `分享预览`, exported card bottom section should include main evaluation text (main score log comment).
   - when item current status is `DONE`, share export should show date range as `YYYY-MM-DD - YYYY-MM-DD` without prefix text.

## Filters and sort checks

1. Status filter combinations, including empty selection => empty list.
2. TODO reason filter visible only when selected statuses are exactly `[TODO]`.
3. Category filter (`all`, specific, `_uncategorized_`).
4. Search over title/author/category.
5. Sort modes (`default/index/createdAt/updatedAt/title/score`).
6. URL sync for list filters:
   - set category/status/todo reason/sort/search and verify URL query changes accordingly.
   - refresh page and verify filter state restores from URL.
   - for empty status selection verify `library_statuses=_empty_`.
7. `default` sort regression:
   - same status (for example `WAIT`) + different categories
   - mark item A favorite
   - edit item B to refresh `updatedAt`
   - expect A still ranked before B.

## Display options checks

1. Main-page display options only include:
   - `显示评分`
   - `显示分类`
2. Verify removed options (`显示作者/显示开始时间/显示更新时间`) no longer appear in desktop and mobile entry menus.

## Detail URL checks

1. Open any item detail from card list and verify URL includes `library_detail=<taskId>`.
2. Close detail and verify `library_detail` is removed.
3. Direct-open page with `library_detail=<taskId>` and verify detail auto-opens after list data loaded.

## Status and timeline checks

1. TODO requires reason input.
2. WAIT can be empty reason.
3. DONE closes round.
4. Wait-expired rule validation.
5. New round prompt when restarting DOING after round end.
6. Timeline order and cutoff behavior.
7. Timeline merged-status behavior:
   - same-day `DOING -> DONE` shows `开始并完成`
   - same-day `DOING -> GIVE_UP` shows `开始并放弃`
   - if original round has no `DOING`, standalone `DONE` / `GIVE_UP` still show merged text
   - if `DOING` exists but is hidden by year/cutoff, keep `DONE` / `GIVE_UP` as plain status text
8. Guide modal:
   - click title-row `?` button
   - verify modal `娱乐库状态与评分说明` opens
   - verify status section contains `等待/进行中/搁置/鸽了/已完成/放弃` tags
   - verify scoring section contains total-score summary plus `SE / CA / IV` dimension explanations
9. `updatedAt` trigger regression:
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
