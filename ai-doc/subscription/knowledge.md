# Subscription Knowledge

Last verified: 2026-05-30

## Scope

1. Covers `/subscription` page behavior for user-managed subscription links.
2. Focuses on card layout and inspection-result presentation rules.

## UI behavior

1. Desktop subscription cards keep a fixed breakpoint-based grid (`4 / 3 / 2 / 1` columns by viewport range) sized so each card stays at or above `420px`; the page should reduce column count before cards are compressed below that width.
2. Mobile subscription cards render as a single column.
3. Card headers keep the link icon, name, status tags, and edit/delete actions in one custom header row so `Cache Ready` does not wrap under the title before the action buttons on two-column desktop layouts.
4. Each card always renders the three metric blocks:
   - `本期用量`
   - `过期时间`
   - `上次检查`
5. When a subscription has no inspection data yet, the metric blocks stay visible and render `无数据` placeholders instead of disappearing.
6. If automatic monitoring is enabled but no usage data has been fetched yet, `本期用量` secondary text remains `等待巡检结果`.

## Download behavior

1. Public share downloads use `GET /share-link/:username/:token`.
2. Each download resolves the record by share token, builds the upstream or Worker-forward URL, performs a fresh backend HTTP GET, and treats the live response as usable only when it is 2xx and parses subscription traffic/expiration metadata from `subscription-userinfo` or legacy body fields.
3. When per-subscription cache is enabled, usable share downloads store the response body plus `Content-Type`, `Content-Encoding`, `Content-Disposition`, and cache time on the subscription record.
4. If the upstream or Worker-forward request fails, returns non-2xx, or returns 2xx content that cannot parse traffic/expiration metadata, the route returns the last cached body only when cache is enabled and available; cache hits include `X-Subscription-Cache: HIT`.
5. Changing the upstream URL, Worker URL, Worker enabled state, or cache enabled state clears the stored body to avoid serving a file from the previous source.
6. The live download response forwards only upstream `Content-Type` and `Content-Encoding`, then sets `Content-Disposition`; it does not currently set explicit cache headers such as `Cache-Control: no-store`.

## Inspection behavior

1. Manual and automatic checks request the configured upstream or Worker-forward URL directly.
2. Inspection success requires a 2xx upstream response plus parsable traffic and expiration metadata.
3. When per-subscription cache is enabled, inspection stores the fetched body and response metadata only after usage parsing succeeds; parse failures must not overwrite the last usable fallback content.
4. The parser first reads the standard `subscription-userinfo` response header (`upload`, `download`, `total`, `expire`) so both raw SS subscription bodies and Clash YAML conversion responses can report usage.
5. If `subscription-userinfo` is absent or invalid, inspection falls back to parsing legacy body text containing `Traffic: ...` and `Expire: YYYY-MM-DD`.
