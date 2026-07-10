# D1 GORM Adapter 与 Worker Proxy 重构计划

Date: 2026-07-09

## 实施状态

Last verified: 2026-07-10

1. 独立仓库已建立在 `C:\GITHUB\gorm-d1-adapter`。
2. v1 已完成：REST executor、统一结果模型、context-aware driver、显式无事务策略、codec 和受限 Migrator 均已落地并通过测试。
3. v2 开发已完成：Worker executor、可部署 Worker proxy、Bearer 鉴权、请求限制、SQL policy、真实 D1 batch、双模式测试和 p50/p95/p99 benchmark runner 均已落地。
4. v2 已通过 Wrangler 本地 D1 的跨语言 HTTP、GORM CRUD、BLOB、batch 顺序与失败回滚验证。
5. 正式 benchmark 已统一为真实 `hk` 部署主机口径：同一 D1、REST/Worker 各 100 samples、并发 8、完整写入与迁移，2200 次采样零失败；单查 p50 从 106.53 ms 降至 63.20 ms，batch CRUD p50 从 428.84 ms 降至 64.79 ms（6.62x）。
6. 原始 v0 legacy 已在同一 `hk`、D1、Docker runtime 和 `10x` 设置下复测，正确性与 15 项 benchmark 全部通过；严格可比的单 SQL workload 提升 1.26x 至 1.85x，Open/Ping 提升 16.74x 至 18.10x。
7. 本机 benchmark 仅用于正确性和排障，不进入性能汇报。发布稳定性能结论前还需完成两次同条件 `hk` 成功运行；当前数据可作为 v3 集成决策依据，不作为公开稳定性能承诺。
8. v3 尚未开始，`platform` 业务依赖和 todone 初始化暂未切换。

## 背景

`platform` 当前通过 fork 的 `d1_gorm_adapter` 使用 GORM 访问 Cloudflare D1。现有路径本质是：

```text
GORM
  -> database/sql driver
    -> d1_gorm_adapter
      -> Cloudflare REST API /client/v4/accounts/{account}/d1/database/{db}/raw
```

这个实现能支撑简单 CRUD，但它不是完整 SQLite driver，也不具备真实数据库连接语义。当前已知问题包括：

1. 每条 SQL 都走一次远程 HTTP 请求，启动、迁移、批量写入时 round trip 很多。
2. `Begin/Commit/Rollback` 是 no-op，GORM transaction 语义不真实。
3. `Exec/Query` 没有传递调用方 `context.Context`。
4. 返回结果存在直接访问 `result[0]` 的 panic 风险。
5. 时间、bool、bytes 的 codec 依赖临时规则，长期不稳定。
6. todone 当前为加速启动并发开 5 个 GORM DB，但并发写 map 和并发 AutoMigrate 都有风险。

Cloudflare D1 更自然的访问方式是 Worker 内的 D1 binding。Worker proxy 可以让 Go 后端不再直接使用 Cloudflare 管理 REST API，并可利用 `prepare/bind/run/raw/batch`。但 Worker proxy 不能替代业务层一致性设计，也不能突破 D1 单库本身限制。

## 总目标

新建独立 git 仓库维护 D1 GORM adapter，`platform` 只作为真实业务集成与 benchmark 场景。

目标架构：

```text
GORM
  -> d1_gorm_adapter
    -> Executor interface
      -> Cloudflare REST executor
      -> Worker proxy executor
        -> Cloudflare Worker
          -> D1 binding
```

核心原则：

1. v0 先建立可重复 benchmark，不靠感觉判断性能。
2. v1 先修 Go 库正确性，不接 Worker。
3. v2 再开发 Worker proxy，并用同一套 benchmark 证明收益。
4. v3 才改业务层初始化、迁移和配置。
5. v4 用真实数据写博客。

## 仓库与集成策略

1. 新建独立库仓库，例如：

```text
go-d1-gorm
```

2. 新仓库初期从 `platform/backend/mian_go_lib/fork/d1_gorm_adapter` 抽取 legacy 代码。
3. `platform` 开发期通过 Go `replace` 指向本地新仓库。
4. `platform` 内的 fork 代码在 v3 之前保持可回滚，不在早期直接删除。
5. Worker 代码放在 adapter 仓库内：

```text
workers/d1-proxy/
  src/index.ts
  src/auth.ts
  src/compat.ts
  src/handlers.ts
  src/sqlPolicy.ts
  wrangler.toml
  test/
```

## v0: Baseline 与用例

目标：建立现有实现的基准数据和回归用例。

### 范围

1. 抽取当前 fork 到新仓库，保留 legacy 实现。
2. 建立测试用例：
   - DSN 解析
   - Query
   - Exec
   - AutoMigrate
   - GORM CRUD
   - SQL 错误返回
   - 空 result 返回
   - 时间、bool、bytes 基础扫描
3. 建立 benchmark：
   - `gorm.Open`
   - token verify
   - `AutoMigrate`
   - 单条 `SELECT`
   - 单条 `INSERT`
   - 单条 `UPDATE`
   - 单条 `DELETE`
   - 批量 CRUD
   - 并发请求
   - todone 初始化模拟
4. 在 `platform` 记录真实 baseline：
   - 后端启动总耗时
   - todone DB 初始化耗时
   - AutoMigrate 耗时
   - D1 REST 请求次数
   - p50 / p95 / p99
   - 错误率

### 产物

1. `BENCHMARK.md`
2. benchmark 命令脚本
3. legacy 行为回归测试
4. 当前问题清单和可复现用例

### 验收

1. benchmark 可重复运行；正式性能数据固定从 `hk` 产生，本机和 CI 运行仅用于正确性门禁。
2. 当前实现慢在哪里有数据支撑。
3. 后续 v1/v2 可以复用同一套用例做对比。

## v1: Go D1/GORM 库完全重构

目标：先修库本身的正确性和边界，不引入 Worker proxy。

### 范围

1. 引入 `Executor` 抽象：

```go
type Executor interface {
    Execute(ctx context.Context, req ExecuteRequest) (ExecuteResult, error)
    Batch(ctx context.Context, req BatchRequest) (BatchResult, error)
    Verify(ctx context.Context) error
}
```

2. 建立内部统一结果模型：

```go
type ResultSet struct {
    Meta    ResultMeta
    Columns []string
    Rows    [][]any
}
```

3. REST executor 保持现有 Cloudflare REST 能力。
4. Worker executor 只保留接口占位，不在 v1 开发 Worker。
5. 重写 DSN/config 解析，避免 token 特殊字符破坏 DSN。
6. 实现 context-aware driver：
   - `driver.ExecerContext`
   - `driver.QueryerContext`
   - `driver.StmtExecContext`
   - `driver.StmtQueryContext`
7. `Exec` 明确使用 `mode=exec`。
8. `Query` 明确使用 `mode=query`。
9. 修复空 result、异常 rows、空 columns 等 panic 风险。
10. 去掉假事务：
    - 默认 `SkipDefaultTransaction: true`
    - 显式 `db.Transaction` 返回 unsupported
    - 需要原子多语句时走 adapter `Batch`
11. 重写类型 codec：
    - `time.Time` 使用 RFC3339Nano
    - bool 使用 SQLite/D1 友好的 integer 或明确转换
    - bytes 不再依赖 `\u00XX` 字符串猜测
12. 清理 GORM Dialector：
    - `DataTypeOf`
    - `BindVarTo`
    - `QuoteTo`
    - 日志噪音
13. 清理 Migrator：
    - 保留简单 `CreateTable` / `CreateIndex` / `HasTable` / `HasColumn`
    - 禁用或重写正则改 `sqlite_master.sql` 的 `AlterColumn` / `DropColumn`
    - 多步骤 schema migration 必须走 batch 或显式 migration

### 产物

1. 重构后的 Go adapter。
2. REST executor。
3. 内部统一 result adapter。
4. context-aware database/sql driver。
5. 明确事务不支持策略。
6. v0 用例全部迁移到新结构。

### 验收

1. v0 全部测试通过。
2. REST 模式行为等价或错误更明确。
3. 无 panic 型错误。
4. benchmark 不明显劣化。
5. 事务语义不再伪装。

## v2: Worker Proxy 开发、联调与性能确认

目标：新增 Worker proxy executor，并用 v0 benchmark 证明是否有性能收益。

### Worker API

```text
GET  /health
POST /v1/query
POST /v1/batch
```

`/v1/query` 请求：

```json
{
  "mode": "query",
  "sql": "SELECT * FROM table WHERE id = ?",
  "params": [1],
  "requestId": "..."
}
```

`/v1/batch` 请求：

```json
{
  "statements": [
    {"mode": "exec", "sql": "INSERT INTO t(id) VALUES(?)", "params": [1]},
    {"mode": "exec", "sql": "UPDATE t SET name = ? WHERE id = ?", "params": ["a", 1]}
  ],
  "requestId": "..."
}
```

### Worker 执行策略

1. `mode=query`：

```ts
await stmt.raw({ columnNames: true })
```

将第一行转为 `columns`，剩余行转为 `rows`。

2. `mode=exec`：

```ts
await stmt.run()
```

保留 `changes`、`last_row_id`、`rows_read`、`rows_written`。

3. `batch`：

```ts
await env.DB.batch(statements.map(s => env.DB.prepare(s.sql).bind(...s.params)))
```

返回顺序必须与请求顺序一致。

### 安全策略

1. 第一版使用 Bearer token。
2. 第二版可升级为 HMAC + timestamp + nonce。
3. Worker 不给浏览器前端直接调用。
4. 限制请求体大小、SQL 长度、params 数量、batch statement 数量。
5. 禁止危险 SQL：
   - `ATTACH`
   - `PRAGMA writable_schema`
   - 多语句 raw exec
6. 日志默认记录 SQL hash，不记录完整 SQL。

### Go 侧联调

1. 新增 Worker proxy executor。
2. 支持配置：

```text
d1.mode = rest | worker
d1.worker.endpoint
d1.worker.token
```

3. 同一套测试在 REST 和 Worker 两种 executor 下运行。
4. 同一套 benchmark 对比 REST vs Worker。

### 产物

1. Worker proxy 项目。
2. Worker executor。
3. REST/Worker 双模式 benchmark 报告。
4. 回滚开关。

### 验收

1. REST/Worker 两种 executor 测试都通过。
2. platform 可以通过配置切换 executor。
3. 有明确性能数据：
   - 启动耗时
   - AutoMigrate 耗时
   - CRUD p50 / p95 / p99
   - 请求失败率
   - D1 meta
4. Worker 出问题时可回滚到 REST。

## v3: platform 业务层改动

目标：让 `platform` 正式接入新库，并处理业务启动、迁移和配置问题。

### 范围

1. 替换 `platform` 依赖到新 adapter 仓库。
2. todone DB 初始化重构：
   - 不再为了每类表开 5 个独立 GORM DB
   - 优先使用一个 `*gorm.DB`
   - 如果保留 `ConnectType -> *gorm.DB` 接口，内部可全部指向同一个 DB
3. todone migration 策略：
   - migration 串行
   - 不并发 AutoMigrate 同一个 D1
   - 引入 schema version 或显式 migrate 命令
   - 尽量从启动热路径移除破坏性迁移
4. 修复 map 并发写风险。
5. xbi 接入新 adapter 配置。
6. 增加运行观测：
   - executor 类型
   - SQL 请求耗时
   - D1 meta
   - 错误率
   - Worker requestId
7. 若 library 新架构启动，再接 memory-first/outbox，不与 adapter 重构混在一起。

### 产物

1. platform 接入 PR。
2. todone 初始化重构。
3. migration 策略文档。
4. 运行观测指标。
5. 回滚说明。

### 验收

1. platform 正常启动。
2. todone 核心路径通过：
   - dir
   - group
   - subgroup
   - task
   - tags
3. xbi 日志写入正常。
4. 启动耗时和 D1 请求数有量化改善。
5. REST/Worker 可配置切换。

## v4: 博客

目标：基于真实重构过程和 benchmark 数据写技术博客。

### 建议结构

1. 问题背景：为什么 D1 + GORM 会慢。
2. 原 adapter 实现方式。
3. 原实现的问题：
   - 假事务
   - context 丢失
   - REST round trip
   - codec 脆弱
   - migration 热路径
4. v0 benchmark 数据。
5. v1 Go adapter 重构：
   - Executor
   - result model
   - codec
   - context-aware driver
   - transaction 策略
6. v2 Worker proxy 设计：
   - D1 binding
   - query
   - exec
   - batch
   - auth
7. REST vs Worker 性能对比。
8. v3 业务层取舍：
   - todone 初始化
   - migration 策略
   - 回滚策略
9. 结论：
   - Worker proxy 解决了什么
   - 没解决什么
   - 后续 outbox / queue / memory-first 的边界

### 产物

1. 博客初稿。
2. benchmark 图表。
3. 架构图。
4. 可公开的核心代码片段。

## 风险与决策点

1. Worker proxy 未必显著降低单条 SQL 的 D1 执行时间，但应减少 REST 管理 API 依赖和 token 暴露。
2. D1 单库吞吐限制仍然存在，Worker proxy 不等于数据库扩容。
3. `batch()` 可以修复部分多语句原子执行需求，但不应让业务层继续依赖隐式 GORM transaction。
4. 启动慢的根因可能主要来自 AutoMigrate 和多次 verify，因此 v0 必须先量化。
5. 业务层 memory-first/outbox 属于 v3 之后的架构演进，不应塞进 v1/v2。

## 里程碑门禁

1. v0 没有 benchmark，不进入 v1。
2. v1 没有正确性修复，不进入 v2。
3. v2 没有 REST vs Worker 对比数据，不进入 v3。
4. v3 没有真实业务回归，不发布为默认路径。
5. v4 只使用已验证数据，不写无法复现的性能结论。
