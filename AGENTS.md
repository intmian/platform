# Platform

个人项目：作者就是唯一用户，自己写、自己用。没有线上值班，发布可以很随意；但有几份长期积累的数据很重要，要认真对待。

## Codex 与 Claude Code 共用

- 本文件和各模块目录下的 `AGENTS.md` 两边都会读；没有 `CLAUDE.md`，也不要再加（Claude 只要发现 `CLAUDE.md` 就不读 `AGENTS.md` 了）。
- 技能放在 `.agents/skills/`：Codex 直接读取；Claude Code 通过 `.claude/skills` 软链读取，clone 后运行一次 `scripts/link-agent-skills.sh`（Windows 用 `.bat`）。
- 写指令和技能时保持工具中立：技能 frontmatter 只用 `name`、`description`，提到浏览器、预览等能力时两边都要能用。只给某一个工具的配置放在它自己的目录（`.claude/settings.json`、`.claude/launch.json` 只对 Claude Code 生效）。
- Codex 只加载从仓库根目录到当前工作目录路径上的 `AGENTS.md`，所以下面列出了模块笔记的位置，改模块前要主动去读。

## 项目地图

- `frontend/`：Vite + React + antd 5，按模块分目录（`src/todone` 里同时有普通任务板、Library 娱乐库和例行清单，另有 `src/money`、`src/subscription`、`src/admin` ……）。
- `backend/`：Go + Gin，入口 `backend/main/main.go`。RPC 服务在 `backend/services/*`，平台自带的接口（登录、配置、AI、记账、订阅）在 `backend/platform/`。
- `backend/mian_go_lib`：子模块，属于本项目，但有独立的 Git 历史，改了要单独提交并更新父仓库的引用。
- `plan/`、`docs/plan/`：规划和历史资料，不代表当前实现。
- 改某个模块前先读它目录下的 `AGENTS.md`（如果有），里面是拍过板的产品决定和不明显的坑：`backend/`、`frontend/`、`frontend/src/todone/`、`frontend/src/money/`、`frontend/src/subscription/`。

## 数据（唯一的硬线）

重要数据在生产环境：Todone 的 D1（任务、Library、例行清单都在里面）和服务器上的 sqlite（记账、订阅、配置、账号）。

- 只新增表、字段或数据，可以直接做（后端启动时会自动迁移）。
- 要改写、删除生产数据，或者做破坏性的 schema 变更，先加载 `platform-data` 技能，备份后问我。
- 本地开发连的是测试库，可以随便造数据、随便删，见 `platform-local` 技能。

## 发布

- push 到 master 会自动构建并部署；提交信息里带 `#ignoreDeploy` 就跳过。只改文档、AI 配置这类不需要部署的提交带上它。
- 让提交、推送就直接做，不用盯着 CI 跑完，也不用做线上检查，除非我要求。

## 常用命令

- 前端：`npm --prefix frontend run dev`（地址用 `localhost:5173`）、`cd frontend && npx vite build`、`npx tsc --noEmit -p .`。tsc 目前本来就有约 29 个旧错误，只看新增的。
- 后端：`cd backend && GOWORK=$(pwd)/go.work go build ./...`、`go test ./...`。本地跑后端见 `platform-local` 技能。

## 协作方式

- 用中文交流。
- 涉及产品、交互、数据结构的决定，先和我对齐再动手；技术实现自己决定，不用问。
- UI 和交互要有自己的设计和判断，在保持现有风格的前提下可以大胆一点。
- 测多少、怎么验证，自己判断。
- 只在 `AGENTS.md` 里记代码看不出来的东西：拍过板的决定、踩过的坑、环境事实。同一个错误第二次出现再补一条，不要写操作流水。
