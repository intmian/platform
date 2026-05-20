# Subscription Knowledge

Last verified: 2026-05-20

## Scope

1. Covers `/subscription` page behavior for user-managed subscription links.
2. Focuses on card layout and inspection-result presentation rules.

## UI behavior

1. Desktop subscription cards keep a fixed breakpoint-based grid (`4 / 3 / 2 / 1` columns by viewport range) sized so each card stays at or above `335px`; the page should reduce column count before cards are compressed below that width.
2. Mobile subscription cards render as a single column.
3. Each card always renders the three metric blocks:
   - `本期用量`
   - `过期时间`
   - `上次检查`
4. When a subscription has no inspection data yet, the metric blocks stay visible and render `无数据` placeholders instead of disappearing.
5. If automatic monitoring is enabled but no usage data has been fetched yet, `本期用量` secondary text remains `等待巡检结果`.

## Download behavior

1. Public share downloads use `GET /share-link/:username/:token`.
2. Each download resolves the record by share token, builds the upstream or Worker-forward URL, performs a fresh backend HTTP GET, and streams that upstream response body to the caller.
3. When per-subscription cache is enabled, successful share downloads store the response body plus `Content-Type`, `Content-Encoding`, `Content-Disposition`, and cache time on the subscription record.
4. If the upstream or Worker-forward request fails during a share download, the route returns the last cached body only when cache is enabled and available; cache hits include `X-Subscription-Cache: HIT`.
5. Changing the upstream URL, Worker URL, Worker enabled state, or cache enabled state clears the stored body to avoid serving a file from the previous source.
6. The live download response forwards only upstream `Content-Type` and `Content-Encoding`, then sets `Content-Disposition`; it does not currently set explicit cache headers such as `Cache-Control: no-store`.

## Inspection behavior

1. Manual and automatic checks request the configured upstream or Worker-forward URL directly.
2. Inspection success requires a 2xx upstream response plus parsable traffic and expiration metadata.
3. When per-subscription cache is enabled, any successful 2xx inspection fetch stores the fetched body and response metadata before parsing usage; this means a valid subscription can refresh fallback content even if usage parsing later fails.
4. The parser first reads the standard `subscription-userinfo` response header (`upload`, `download`, `total`, `expire`) so both raw SS subscription bodies and Clash YAML conversion responses can report usage.
5. If `subscription-userinfo` is absent or invalid, inspection falls back to parsing legacy body text containing `Traffic: ...` and `Expire: YYYY-MM-DD`.
