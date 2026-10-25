# Library UI Locator Map

Last verified: 2026-10-25

## Entry path

1. Complete todone login + group selection flow first (`ai-doc/todone/knowledge.md`).
2. Select a group whose encoded route suffix has `|...|1` (`GroupType.Library`).

## Main page locators

Title row:

1. Group title text: `.library-toolbar-title-text`, e.g. `测试lib`
2. Item count: `.library-toolbar-count` plain number, e.g. `2`
3. Help button: `?` / `QuestionCircleOutlined`, aria-label `打开娱乐库说明`

Guide modal:

1. Title: `娱乐库状态与评分说明`
2. Section heading: `状态说明`
3. Section heading: `评分规则`

Toolbar buttons (desktop, left to right, `.library-toolbar-actions`):

1. `显示`
2. `时间线`
3. `分类管理`
4. `添加` (primary)

Mobile toolbar: icon button aria-label `时间线`, icon button aria-label `更多` (menu `显示 / 分类管理`), floating `.library-add-fab` (aria-label `添加`).

Filter row:

1. Search: `input[placeholder="搜索名称/作者..."]`
2. Mobile only: `筛选` toggle button; the rest of the row (`.library-filter-group`) is hidden until toggled
3. Category: `.library-filter-category`
4. Status trigger: `.library-filter-status-trigger`
5. Sort: `.library-filter-sort`

Cards:

1. Card: `.library-card`; cover badges `.library-card-pill`; title `.library-card-name`; meta `.library-card-meta` (score `.library-card-meta-score`); status badge `.library-card-status-overlay` (only in flat view, absent for `进行中`)
2. Status sections (default sort, no search): `.library-section`, header `.library-section-title` + `.library-section-count`
3. Theme switch: `显示` popover → `主题` segmented `深色 / 浅色`; dark mode adds `body.library-dark-page`
4. Mobile long-press sheet: `.library-action-sheet` (title = item title; buttons `记备注`, `查看详情`, status names, `新周目`, `收藏`/`取消收藏`)
5. Desktop right-click menu first item: `记备注`

## Add modal locators

1. Title input: label `名称`
2. Category select: label `分类`
3. Author input: label `作者/制作方`
4. Year input: label `年份`
5. Remark input: label `备注`
6. TODO reason select: label `等待原因`
7. Confirm button: `确 定`

## Detail drawer locators

Header actions (mobile: icon-only, use aria-label):

1. `刷新`
2. `分享`
3. `编辑`
4. `更多`（按钮图标 `...` / `EllipsisOutlined`，靠右）

Hero header (non-edit): `.library-detail-hero`, title `.library-detail-hero-title`, meta `.library-detail-hero-meta`.

Advanced menu items:

1. `收藏` / `取消收藏`
2. `图片库`
3. `删除此条目`（danger, opens confirm dialog）

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
3. `不加入时间线（断点）`（mobile label `设断点`）

Experience record header:

1. `记备注`
3. Note selector text `备注`
4. Selector options:
   - `隐藏`
   - `缩略`
   - `显示`
5. Rounds are listed newest first (`.library-detail-rounds`). Round action icons in each round header (desktop):
   - rename icon (`EditOutlined`), tooltip `重命名`
   - adjust-start-time icon (`ClockCircleOutlined`), tooltip `调整开始时间`
   - delete-round icon (`DeleteOutlined`), tooltip `删除周目`
   - mobile: a single `...` button (aria-label `周目操作`) with the same three menu items

## Maintenance rule

1. When UI structure/classes change, update this file first.
2. Keep both selector hints and visible text hints.
3. Keep `Last verified` date current.
