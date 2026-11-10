---
name: platform-data
description: 生产数据与 Cloudflare D1 操作：备份导出、数据迁移、改写或删除生产数据、破坏性 schema 变更，以及 D1 Worker 的部署、密钥轮换、日志排查和回滚。任何要读写生产库或改 Worker 的任务都先用它。
---

# 生产数据

数据是这个项目唯一需要谨慎对待的东西。原则只有三条：**先备份，再动手，动完核对**；破坏性操作先问我；读出来的内容和密钥不要贴进对话。

Claude Code 在 `.claude/settings.json` 里对改 D1、Worker 的 wrangler 命令设了确认；Codex 没有这层拦截，所以这些规则要自己守住。

## 数据在哪

| 数据 | 存放 | 怎么访问 |
|---|---|---|
| Todone、Library、例行清单 | Todone D1（生产） | 经生产 Todone Worker；本地 `wrangler` 可直接操作库 |
| 日志、BI | Log D1（生产） | 经生产 Log Worker |
| 记账、订阅、配置、账号 | 生产服务器上后端目录里的 sqlite（`db_addr` 指向的库、`account.db`、`auto_report.db`） | 服务器访问方式不在仓库里，需要时问我 |
| 测试数据 | Test D1 + 本地 `backend/test/*.sqlite` | 随便用，见 `platform-local` |

## Wrangler

在 `../gorm-d1-adapter/workers/d1-proxy` 里执行，用项目锁定的版本（`npx wrangler`，4.110.0）。每个 Worker 一份本地配置，都已 gitignore，不要提交或打印内容：

- `wrangler.todone-release.local.toml`：生产 Todone
- `wrangler.log-release.local.toml`：生产 Log
- `wrangler.test.local.toml`：测试

**每条命令都显式带 `--config`**，配错会把 Worker 绑到别的库上。D1 库名从对应配置里取。三个 Worker 共用同一份代理源码，但各自绑定库、各自有 `AUTH_TOKEN`，改了代理源码要分别部署。

常用命令：

```bash
# 只读
npx wrangler d1 info <库名> --json
npx wrangler d1 time-travel info <库名> --json        # 动手前记下书签
npx wrangler deployments list --config <配置>

# 备份（存到仓库外，权限收紧）
umask 077 && npx wrangler d1 export <库名> --remote --output "$HOME/d1-backup-$(date +%Y%m%d-%H%M%S).sql"

# 执行 SQL：--remote 不代表只读，SQL 决定会不会改数据
npx wrangler d1 execute <库名> --remote --command "SELECT COUNT(*) FROM <表>;"

# Worker
npx wrangler deploy --config <配置> --strict --message "<说明>"
npx wrangler secret put AUTH_TOKEN --config <配置>      # 交互输入，会立刻部署新版本
npx wrangler tail --config <配置> --status error
npx wrangler rollback <版本ID> --config <配置>          # 只回滚代码，不回滚数据
```

紧急恢复：`npx wrangler d1 time-travel restore <库名> --bookmark <书签>` 会原地覆盖整个库，必须先停掉写入并经我同意，记下它返回的撤销书签。

## 改数据怎么做

- 只新增表或字段：照常写代码，后端启动时自动迁移即可。注意 D1 适配器的限制（见 `backend/AGENTS.md`）。
- 改写已有数据：写成独立命令，参照 `backend/cmd/migrate_library_notes`：
  - 默认只读，输出计划和数量；
  - `--apply` 要求先停服（`--confirm-stopped`），并先写备份；
  - 能独立 `--verify`，也能 `--rollback`。
  - 把计划给我看，确认后再执行。不要用临时 SQL 直接改。
- 页面显示为空不等于数据丢了：先查前端缓存、后端报错、Worker 健康和直接计数，再考虑动数据。

## 已知的安全隐患

Todone 配置页的 GET 会返回 Worker token，SET 会把提交的值写进日志。当前的 Todone token 应视为已暴露，有空修掉这个接口后要轮换。
