# Todone UI Locator Map

Last verified: 2026-02-28 (verified via interaction + code)

## Entry path

1. Open `/todone`.
2. If no valid encoded group in URL, left `目录` drawer auto-opens.
3. Select a normal group (`|...|0`) from directory tree to enter task board.

## Main page locators (normal group)

1. Left-top directory trigger:
   - role button, name `menu`
2. Group header:
   - text equals current group title (for example `testmove`)
3. Add subgroup:
   - role button, name `appstore-add`
4. Subgroup block actions (inside subgroup divider):
   - expand/collapse: role button `caret-up` or `caret-down`
   - index ordering: role button `vertical-align-bottom` or `vertical-align-top`
   - select mode: role button `check-square` or `close-square`
   - subgroup menu: role img `more`
5. Quick-create input:
   - desktop placeholder `新增任务,Ctrl+Enter 或 Command+Enter 添加`
   - mobile placeholder `新增任务，回车或移出焦点`

## Task row locators

1. Drag handle:
   - icon `holder` (wrapper class `.drag-handle`)
2. Status action button:
   - first small button after drag handle (icon may switch among blank/retweet/check/loading)
3. Task title text:
   - click opens `任务详情` drawer
   - right-click opens task context menu
4. Subtask toggle:
   - right-side small button with `plus-circle` / `minus-circle` / `down`
5. Drag drop targets:
   - subgroup list root droppable id: `subgroup-drop-<subGroupID>`
   - task card droppable/sortable id: `task-<taskID>`
   - expanded child-list droppable id: `task-children-<taskID>`

## Task context menu (right-click title)

1. `复制内容`
2. `复制路径`
3. `标记任务` / `取消标记`
4. `移动`
5. `删除`

## Task detail drawer locators

1. Drawer title: `任务详情`
2. Header fields:
   - input placeholder `任务标题`
   - save button icon `save`
3. Address row:
   - text like `dir-*/grp-*/subgrp-*/task-*`
   - copy button `复制`
4. Select fields:
   - `任务类型` (`TODO/DOING`)
   - `任务状态` (`未开始/进行中/已完成`)
5. Action buttons:
   - `清除高级`
   - `移动`
   - `删除`
6. Advanced fields:
   - input placeholder `等待`
   - date pickers placeholders: `无开始时间`, `无结束时间`
   - editor toolbar with markdown actions + `file-add`

## Directory drawer locators

1. Drawer title: `目录`
2. Node types:
   - folder node icon `folder`
   - group node icon `file`
3. Folder node menu (`more`):
   - `添加` / `修改` / `复制` / `删除`
4. Group node menu (`more`):
   - `修改` / `复制` / `删除`
5. Add modal (folder -> `添加`):
   - `标题`, `备注`
   - switch `是否为任务组`
   - select `任务组类型` (`普通` / `图书馆`)

## Subgroup menu locators

1. Trigger: subgroup header right-side `more` icon.
2. Menu items:
   - `显示已完成` or `隐藏已完成`
   - `复制路径`
   - `修改分组`
   - `删除分组`

## Notes

1. `任务`行菜单不是固定按钮，必须对标题区域执行右键。
2. When detail drawer is open, its mask blocks underlying subgroup/menu clicks; close drawer first.
