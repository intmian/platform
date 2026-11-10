# 后端

## 运行与配置

- 启动必须在含 `base_setting.toml` 的目录里（本地是 `backend/test`）。
- D1 只通过 Cloudflare Worker 访问，一个 Worker 绑一个库：
  - 日志/BI 库：`base_setting.toml` 的 `d1_log_worker_*`；
  - Todone 库：`CfgExt` 里的 `todone.db.worker_endpoint/worker_token`（存在 `db_addr` 指向的 sqlite 里）。
  - 两者都可以用环境变量 `PLATFORM_D1_LOG_WORKER_*` / `PLATFORM_TODONE_WORKER_*` 覆盖，代码里没有默认的生产地址。
- **启动时会对 Todone 库自动迁移（AutoMigrate）**，所以本地运行绝不能指向生产 Worker。
- 服务出错时网关默认只回 `svr error`；`base_setting.toml` 里设 `debug = true` 才会返回真实错误。
- 登录 cookie 的签名盐带着年月，跨月会被要求重新登录，属正常现象。
- 首次用 `admin` 登录时，如果账号还不存在，会用 `base_setting.toml` 的 `admin_pwd` 自动创建。

## 坑

- **D1 适配器不能给字段加数据库默认值 tag**（也别给 UUID 字段声明长度）：适配器读不到列默认值，下次 AutoMigrate 会误以为要做破坏性修改。需要初始值就在写入时显式赋值。
- **Todone 的任务顺序存在子分组的 `taskSequence` 里**，不是任务表的 index。
  - `SubGroupLogic.GetTaskLogic` 对未缓存的任务会把它追加进顺序：校验外来 ID 时要直接查 `TaskDB`，不能借它。
  - 子分组缓存没加载时，`createTask` 不会写入顺序，而建子任务会把父任务提前插入。用接口批量造数据前，先对每个子分组调一次 `getTasks`。
- 新用户第一次 `getDirTree` 会建根目录行但在内存里没绑上，那一次会 panic，第二次请求就好了。
- Todone 删除策略混用：目录、子分组是硬删，分组、任务是软删（`deleted`），排查时两种都要看。
- 每个用户的 Todone 操作共用一把锁，天然串行。子分组每 5 秒自动落盘一次变更。
- `platform/core.go` 里所有服务的"启动时开启"都读的是 `auto/open_when_start`（已知问题）；`auto` 服务内部又用 `<unit>.open`，两者不一致。
- `account` 服务里多数接口在无权限时返回空的成功结果，而不是报错。
- `/cfg/:svr/:user/*` 网关层没有权限校验，复用时注意。
- Todone 配置页的 GET 会返回 Worker token，SET 会把提交的值打进日志；`cfgServiceSet` 不检查 `Cfg.Set` 的错误，`startService` 失败也会返回成功。改配置后要以重启后的实际行为为准。
- 实时转写 WebSocket 收尾：写出 `completed` 后要先发 `Close(1000)`，复用现有读循环等对方回应（最多 2 秒）再断开，直接 `Close()` 会导致前端收到 1006。
- AI 调用协议总是显式配置，绝不能从模型名推断。带 `live_ai` 构建标签的测试会真实调用付费接口，平时不要跑。

## 历史迁移工具

- `cmd/migrate_library_notes`、`cmd/migrate_library_score_details`：Library 停服迁移的参考实现（默认只读出计划，`--apply` 必须配合 `--confirm-stopped` 并先写备份，支持 `--verify`/`--rollback`）。以后写数据迁移照这个模式来。
