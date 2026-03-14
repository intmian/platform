# Subscription Knowledge

Last verified: 2026-03-14

## Scope

1. Covers `/subscription` page behavior for user-managed subscription links.
2. Focuses on card layout and inspection-result presentation rules.

## UI behavior

1. Desktop subscription cards use a responsive grid with a minimum card width of `335px`; column count should reduce automatically instead of forcing four columns when space is insufficient.
2. Mobile subscription cards render as a single column.
3. Each card always renders the three metric blocks:
   - `本期用量`
   - `过期时间`
   - `上次检查`
4. When a subscription has no inspection data yet, the metric blocks stay visible and render `无数据` placeholders instead of disappearing.
5. If automatic monitoring is enabled but no usage data has been fetched yet, `本期用量` secondary text remains `等待巡检结果`.
