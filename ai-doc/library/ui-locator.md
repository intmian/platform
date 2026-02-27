# Library UI Locator Map

Last verified: 2026-02-27 (code verified, TODO-verify via interaction)

## Entry path

1. Open `/todone`.
2. If login modal appears, use fields:
   - `用户名`
   - `密码`
   - submit `提 交`
3. Select a group whose encoded route suffix has `|...|1` (`GroupType.Library`).

## Main page locators

Toolbar buttons (left to right):

1. `显示` (text match), approx `(730,16)`
2. `时间线` (text match), approx `(820,16)`
3. `分类管理` (text match), approx `(924,16)`
4. `添加` (text match), approx `(1042,16)`

Filter row:

1. Search: `input[placeholder="搜索名称/作者..."]`, approx `(106,69)`
2. Category: `.library-filter-category`, approx `(284,64)`
3. Status trigger: `.library-filter-status-trigger`, approx `(432,64)`
4. Sort: `.library-filter-sort`, approx `(558,64)`

Note: coordinates are desktop-relative hints; selector + text should be the primary locator.

## Add modal locators

1. Title input: label `名称`
2. Category select: label `分类`
3. Author input: label `作者/制作方`
4. Year input: label `年份`
5. Remark input: label `备注`
6. TODO reason select: label `等待原因`
7. Confirm button: `确 定`

## Detail drawer locators

Header actions:

1. `刷新`
2. `分享`
3. `编辑`
4. `更多`（按钮图标 `...` / `EllipsisOutlined`，靠右）

Advanced menu items:

1. `收藏` / `取消收藏`
2. `图片库`

Status actions row:

1. `等待`
2. `开始`
3. `搁置`
4. `放弃`
5. `完成`
6. `归档`
7. `新周目`

Timeline actions row:

1. `添加评分`
2. `添加备注`
3. `不加入时间线（断点）`

Danger action:

1. `删除此条目`

## Maintenance rule

1. When UI structure/classes change, update this file first.
2. Keep both selector hints and visible text hints.
3. Keep `Last verified` date current.
