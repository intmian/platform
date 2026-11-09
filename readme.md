# Platform

一个偏个人化的自托管平台，核心目标是把「后台管理 + 自动化任务 + 脚本运行 + TODONE 管理」放在同一套系统里。

当前代码已经稳定可用的主线是：

- 管理后台（服务状态、配置、日志、账号权限、性能、Bi 日志）
- TODONE（目录/分组/子分组/任务管理）
- TODONE 娱乐库模式（状态流转、周目、评分、时间线、分类、封面上传）
- 自动日报（新闻 + 天气 + 汇总）
- 脚本工具与运行环境管理（在线编辑、执行、任务输出）

## 主要页面

- `/admin`：后台管理入口
- `/todone`：任务板（支持普通分组 + 娱乐库分组）
- `/cmd`：脚本工具与运行环境
- `/day-report`：日报与新闻汇总
- `/loss-fat`：营养计算器
- `/kana`：假名练习

## Note Mini 已独立

Platform 已移除旧 `/note_mini` 页面及其专属配置入口；Note Mini 由独立项目 `memos-mian` 维护。既有配置、浏览器草稿和历史文件不做删除或迁移。共享 R2 上传、AI 改写／转写及娱乐库、TODONE 笔记功能继续保留。源码调整不修改线上 Caddy、Cloudflare 或 R2 规则，退役边界见 [说明](ai-doc/note-mini/knowledge.md)。

## 娱乐库语音输入

新增或编辑评分时，总评价及复杂评分的客观、主观、创新评价均可使用输入框下方的麦克风；添加条目和编辑资料中的作品备注也支持。单击开始，再次单击结束并转写，文字追加到原文末尾；实时转写配置下会直接在输入框预览。识别期间请等待完成后再保存，关闭表单会取消本次输入。等待／搁置原因仍使用文字输入。

## 技术栈

- 前端：React + Vite + Ant Design + TypeScript
- 后端：Go + Gin
- 数据与基础能力：xstorage / xlog / xpush / xbi（内置在项目依赖中）

## 后端服务（当前已注册）

- `auto`：自动日报生成与查询
- `account`：账号与权限令牌管理
- `cmd`：脚本工具管理与运行环境
- `todone`：TODONE 业务

## 一体化部署（可选）

如果希望由后端直接托管前端静态资源：

1. 构建前端
2. 将 `frontend/dist` 内容拷贝到 `backend/front`
3. 在 `base_setting.toml` 中设置 `use_front = true`
4. 仅启动后端即可

## 配置说明

`base_setting.toml` 的核心字段：

- `db_addr`：主存储 sqlite 路径
- `log_addr`：日志输出目录
- `web_port`：后端端口
- `admin_pwd`：管理员初始密码
- `use_front`：是否启用后端托管前端静态资源

后台「设置」页面里还能配置：

- `auto.news.keys`：日报新闻关键词
- `todone.db.*`：TODONE 数据库接入参数
- `PLAT.r2.*`：R2 上传相关参数（图片上传等功能）
- AI 供应商及模型的 `text/stt` 能力、可继承或按模型覆盖的调用协议（含 OpenAI 文字、OpenAI STT、DashScope 千问3-ASR、DashScope Fun-ASR-Flash）、同类型顺序回退队列，以及统一的业务场景/类型/队列绑定

## 项目结构

```text
backend/      Go 后端与服务实现
frontend/     React 前端
ai-doc/       当前架构、领域知识与验证说明
.agents/skills/ 仓库级开发、测试、调试和知识维护技能（Codex 直接读取；Claude Code 需本地运行一次 `scripts/link-agent-skills.sh`（Windows：`scripts\link-agent-skills.bat`），把 .claude/skills 链接到这里，该链接不入库）
docs/         设计、计划与历史材料
plan/         中长期产品规划
```

## CI 与部署

- push 到 `master` 会触发前后端构建和自动部署。
- 推送的提交消息中包含 `#ignoreDeploy` 时跳过构建和部署。
- `backend/mian_go_lib` 是独立 Git submodule，但属于本项目的逻辑代码范围。

## 额外说明

- 项目仍在持续迭代，README 会随功能更新
- 开发指引：拆分公共组件时，优先做成可复用的通用组件（接口清晰、业务字段最小化、避免写死单场景逻辑）
