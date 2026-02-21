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
- `/note_mini`：快速发送到 Memos
- `/loss-fat`：营养计算器
- `/kana`：假名练习
- `/debug`：调试页

## 技术栈

- 前端：React + Vite + Ant Design + TypeScript
- 后端：Go + Gin
- 数据与基础能力：xstorage / xlog / xpush / xbi（内置在项目依赖中）

## 后端服务（当前已注册）

- `auto`：自动日报生成与查询
- `account`：账号与权限令牌管理
- `cmd`：脚本工具管理与运行环境
- `todone`：TODONE 业务

## 快速开始（开发模式）

### 1) 启动后端

在 `backend` 目录运行，后端启动时会读取当前目录下的 `base_setting.toml`。

```bash
cd backend
cp test/base_setting.toml ./base_setting.toml
go run ./main
```

默认会监听 `web_port`（示例为 `8080`）。
建议先把 `base_setting.toml` 里的密码和第三方密钥改成你自己的配置。

### 2) 启动前端

```bash
cd frontend
npm install
npm run dev
```

前端默认通过 Vite 代理把 `/api` 转发到 `http://127.0.0.1:8080`。

### 3) 登录

- 默认管理员账号：`admin`
- 首次登录密码：`base_setting.toml` 里的 `admin_pwd`

首次用 `admin + admin_pwd` 登录会自动创建管理员账户。

## 一体化部署（可选）

如果希望由后端直接托管前端静态资源：

1. 构建前端
2. 将 `frontend/dist` 内容拷贝到 `backend/front`
3. 在 `base_setting.toml` 中设置 `use_front = true`
4. 仅启动后端即可

## 配置说明

`backend/base_setting.toml` 的核心字段：

- `db_addr`：主存储 sqlite 路径
- `log_addr`：日志输出目录
- `web_port`：后端端口
- `admin_pwd`：管理员初始密码
- `use_front`：是否启用后端托管前端静态资源
- `gin_debug`：Gin 调试模式
- `debug`：平台调试开关

后台「设置」页面里还能配置：

- `auto.news.keys`：日报新闻关键词
- `todone.db.*`：TODONE 数据库接入参数
- `PLAT.r2.*`：R2 上传相关参数（图片上传等功能）

## 项目结构

```text
backend/      Go 后端与服务实现
frontend/     React 前端
docs/         流程图与设计草图
skills/       本地技能相关文件
```

## 额外说明

- 后端会开启本地 pprof：`127.0.0.1:12351`
- 前后端分开启动是日常开发的推荐方式
- 项目仍在持续迭代，README 会随功能更新
