---
name: platform-local
description: 在本地跑起 Platform 前后端、登录、调用接口、造或清理测试数据，并在浏览器里验证页面。需要本地真后端、测试数据、联调或在页面上亲手验证功能时使用。
---

# 本地环境与测试数据

## 启动

- 后端（在后台运行）：`cd backend/test && GOWORK=$(pwd)/../go.work go run ../main/main.go`，端口 8080。先 `python3 <本技能>/scripts/api.py check` 看是否已经在跑，别重复启动。日志在 `backend/test/gin.log`、`sql.log`、`log/`。
- 前端：`npm --prefix frontend run dev`（Claude Code 可直接用预览启动 `.claude/launch.json` 里的 `frontend`）。浏览器用 `http://localhost:5173`。
- 想看后端真实报错，在 `backend/test/base_setting.toml` 里设 `debug = true` 后重启。

## 连的是哪个库

- `backend/test` 连的是**测试** Worker（`platform-test-d1-todone`、`platform-test-d1-log`），可以随便造数据、随便删。
  - Todone 的 Worker 地址存在 `backend/test/db.sqlite` 的 `todone.db.worker_endpoint` 里，不在 `base_setting.toml`；后者只有日志库的配置。
  - 生产 Worker 名字里没有 `test`。后端启动会自动迁移，绝不能把本地配置指向生产。
- 本地的 `db.sqlite` 也存着记账、订阅等平台数据，都是测试数据。

## 账号

- 用户名 `admin`，密码就是 `backend/test/base_setting.toml` 的 `admin_pwd`。这是本地测试密码，可以直接读取使用，不要在回复里复述。
- 内置浏览器里通常已经登录；没登录就用这个账号登。

## 调接口和造数据

`scripts/api.py` 自动登录、自动补 `UserID`：

```bash
python3 .agents/skills/platform-local/scripts/api.py call todone getDirTree
python3 .agents/skills/platform-local/scripts/api.py post /misc/money/book/list
```

写批量造数脚本时 `from api import Client` 复用。注意：
- Todone 建任务前，先对每个新子分组调一次 `getTasks`，否则带子项的父任务会跑到前面（见 `backend/AGENTS.md`）。
- 造的数据用独立的分组或账本装着，用完删掉（`delGroup` 是软删，配套的 `routine_nodes` 等孤儿行无害）。我明确说要留着体验的数据就不删，并告诉我入口地址。

## 浏览器验证

- 用当前工具自带的浏览器（Codex 内置浏览器、Claude Code 浏览器面板），除非我要求，不另装 Playwright。
- 读页面优先读文本或无障碍树，再按元素交互；截图只在需要看视觉时用。
- 测拖拽：`scripts/drag.js` 里的 `dragTo` 可以在页面里执行，模拟 dnd-kit 拖动并返回落点提示。拖动途中截图会让拖动被取消。
- 测手机宽度时把视口调到约 375px，测完恢复。
- 浏览器窗口被隐藏时动画会停住，截图可能是空白，以 DOM 读数为准。
