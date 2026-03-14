# Subscription Knowledge

Last verified: 2026-03-14

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
