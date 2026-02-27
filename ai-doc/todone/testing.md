# Todone Module Testing

Last verified: 2026-02-27

## Preconditions

1. Shared contracts/routes/permissions follow `ai-doc/todone/knowledge.md`.
2. Frontend dev URL should use `http://localhost:5173` (this runtime bound `::1:5173`; `127.0.0.1:5173` may fail).
3. Health baseline for debug:
   - frontend chain: use `POST /api/check` (Vite proxy strips `/api`)
   - direct backend chain: use `POST /check`
   - `GET /api/check` is not the health baseline
4. Login baseline:
   - username: `admin`
   - password source: `backend/test/base_setting.toml` -> `admin_pwd`

## Core matrix (normal group, type=0)

1. Entry route:
   - open `/todone`
   - if no encoded group in URL, directory drawer should auto-open
2. Group selection:
   - select a normal group in directory tree
   - expect URL becomes `/todone/<encodeURIComponent(addr|title|0)>`
   - expect title becomes `TODONE 任务板: <title>`
3. First load data:
   - expect `getSubGroup`
   - each expanded subgroup should request `getTasks` with `ContainDone=false` by default
4. Subgroup header controls:
   - collapse/expand (`caret-up/caret-down`)
   - index ordering toggle (`vertical-align-bottom/vertical-align-top`)
   - select mode toggle (`check-square` / `close-square`)
5. Subgroup menu:
   - open `更多`
   - verify menu contains `显示已完成/隐藏已完成`、`复制路径`、`修改分组`、`删除分组`
6. Task quick-create area:
   - input placeholder desktop: `新增任务,Ctrl+Enter 或 Command+Enter 添加`
   - verify task type selector (`TODO/DOING`) and auto-start checkbox are visible
7. Task detail:
   - click task title opens right drawer `任务详情`
   - verify fields: `任务标题`、`任务类型`、`任务状态`、`等待`、日期控件、编辑器
   - verify action buttons: `清除高级`、`移动`、`删除`
8. Task context menu:
   - right-click task title text
   - verify menu items: `复制内容`、`复制路径`、`标记任务/取消标记`、`移动`、`删除`
9. Directory tree menu:
   - folder node `更多` should include `添加`、`修改`、`复制`、`删除`
   - group node `更多` should include `修改`、`复制`、`删除`
10. Directory add modal:
   - from folder `更多 -> 添加`
   - verify fields: `标题`、`备注`、`是否为任务组` switch、`任务组类型(普通/图书馆)`

## Adjacent regression path

1. Switch from normal group (`|...|0`) to a library group (`|...|1`) and confirm:
   - title changes to `TODONE 娱乐库: <title>`
   - library toolbar (`显示/时间线/分类管理/添加`) is rendered
2. Switch back to the original normal group and confirm:
   - title returns to `TODONE 任务板: <title>`
   - normal subgroup/task board renders correctly.

## Interaction evidence summary (verified via interaction, 2026-02-27)

1. Route/title switch observed:
   - normal: `/todone/dir-12%2Fgrp-18%7Ctestmove%7C0` + `TODONE 任务板: testmove`
   - library: `/todone/dir-12%2Fgrp-27%7C%E6%B5%8B%E8%AF%95lib%7C1` + `TODONE 娱乐库: 测试lib`
2. Network observed in MCP:
   - `/api/check`
   - `/api/service/todone/getDirTree`
   - `/api/service/todone/getSubGroup`
   - `/api/service/todone/getTasks`
3. Right-click task menu and subgroup/directory menus all rendered as expected.

## Known non-blocking console messages

1. AntD deprecation warning:
   - ``Warning: `children` should be `Select.Option` or `Select.OptGroup` instead of `option`.``
2. In library regression path, missing DNS for mock R2 may log:
   - `Failed to load resource: net::ERR_NAME_NOT_RESOLVED`
   - `[LibraryCoverCompat] skip task=..., 无法下载原始图`
3. Treat above as non-blocking for todone normal-path verification unless target task涉及对应功能。
