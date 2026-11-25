# 后端

## 运行与配置

- 启动必须在含 `base_setting.toml` 的目录里（本地是 `backend/test`）。
- D1 只通过 Cloudflare Worker 访问，一个 Worker 绑一个库：
  - 日志/BI 库：`base_setting.toml` 的 `d1_log_worker_*`；
  - Todone 库：`CfgExt` 里的 `todone.db.worker_endpoint/worker_token`（存在 `db_addr` 指向的 sqlite 里）。
  - 两者都可以用环境变量 `PLATFORM_D1_LOG_WORKER_*` / `PLATFORM_TODONE_WORKER_*` 覆盖，代码里没有默认的生产地址。
- **启动时会对 Todone 库自动迁移（AutoMigrate）**，所以本地运行绝不能指向生产 Worker。
- 服务出错时网关默认只回 `svr error`；`base_setting.toml` 里设 `debug = true` 才会返回真实错误。
- 登录 cookie 的签名盐带着服务启动时的年月，跨月后第一次重启会要求所有人重新登录；`/check` 只给非 admin 账号续签（剩余不足两天时）。两者都是有意的：admin 的 token 被盗用最多再用 7 天，自动续期的账号每月至少重新登录一次。不要改成“接受上月盐”或“admin 也续签”。
- 首次用 `admin` 登录时，如果账号还不存在，会用 `base_setting.toml` 的 `admin_pwd` 自动创建。

## 坑

- **D1 适配器（`gorm-d1-adapter`，独立仓库，`go.mod` 锁版本引用）拒绝一切改列/删列**，AutoMigrate 一旦认为要改已有列，Todone 服务就起不来。从 `1bcbea0` 起适配器会忽略已有列的默认值差异，所以默认值 tag 只在新加列时生效、改了也不会出事；类型、长度、可空的差异仍会让启动失败。例外：生产库 `group_dbs.deleted`、`task_dbs.deleted/done/started` 是 2025 年旧驱动建的，声明类型是 `string`（代码是 bool），适配器从 `f46d850` 起放行这一种组合，测试库没有这个差异。**升级适配器前必须用生产库表结构的副本验证**（只导 schema，灌进本地 D1，跑两遍全部表的迁移），只测测试库发现不了。别给 UUID 字段声明长度。
- **Todone 的任务顺序存在子分组的 `taskSequence` 里**，不是任务表的 index。
  - `SubGroupLogic.GetTaskLogic` 对未缓存的任务会把它追加进顺序：校验外来 ID 时要直接查 `TaskDB`，不能借它。
  - 子分组缓存没加载时，`createTask` 不会写入顺序，而建子任务会把父任务提前插入。用接口批量造数据前，先对每个子分组调一次 `getTasks`。
- 新用户第一次 `getDirTree` 会建根目录行但在内存里没绑上，那一次会 panic，第二次请求就好了。
- Todone 表里有叫 `index` 的列，是 SQL 关键字：手写 SQL 里要写成 `` `index` ``。gorm 的 `Scan` 报错不会冒出来，曾经因此导致线上所有子分组的序号都是 1（老数据至今重复，排序靠 `id` 兜底）。
- 服务重启后，要先调一次 `getDirTree` 把用户加载进内存，否则 `createGroup` 等写接口会直接返回 `svr error`。
- **D1 读取按行计费（免费额度每天 500 万行），而且库上没有统计信息**。Todone 库只有一个用户，查询里只要带着 `user_id = ?`，SQLite 往往会选 `user_id` 索引，等于全表扫描，哪怕有更合适的组合索引也一样（2026-11 关注页因此每次读 6000 多行，差点打满额度）。热点查询别在 SQL 里带 `user_id`，用别的方式保证归属（关注页是靠子查询加 Go 里再筛一遍）；新写的查询先用 `EXPLAIN QUERY PLAN` 看一眼。用量用 `wrangler d1 insights` 按读取行数排序查，日志库 `todone_db_log.rows` 记的是返回行数，不是读取行数。
- Todone 删除策略混用：目录、子分组是硬删，分组、任务是软删（`deleted`），排查时两种都要看。
- 每个用户的 Todone 操作共用一把锁，天然串行。子分组每 5 秒自动落盘一次变更。
- `platform/core.go` 里所有服务的"启动时开启"都读的是 `auto/open_when_start`（已知问题）；`auto` 服务内部又用 `<unit>.open`，两者不一致。
- `account` 服务里多数接口在无权限时返回空的成功结果，而不是报错。
- `/cfg/:svr/:user/*` 网关层没有权限校验，复用时注意。
- Todone 配置页的 GET 会返回 Worker token，SET 会把提交的值打进日志；`startService` 失败也会返回成功。改配置后要以重启后的实际行为为准。
- Todone 启动迁移失败时服务仍会接收请求：失败之前已迁移的表能用，之后的（如例行、收藏）的连接是 nil。所以会出现“例行清单报错、关注页却正常”这种半残状态（关注页所有查询都走任务表的连接）。
- 实时转写 WebSocket 收尾：写出 `completed` 后要先发 `Close(1000)`，复用现有读循环等对方回应（最多 2 秒）再断开，直接 `Close()` 会导致前端收到 1006。
- AI 调用协议总是显式配置，绝不能从模型名推断。带 `live_ai` 构建标签的测试会真实调用付费接口，平时不要跑。
- 生产服务器在香港，OpenAI 官方接口不对香港开放，经 Cloudflare Worker 转发也会被判定为香港（见 `workers/ai-proxy/AGENTS.md`）。不要在香港服务器上使用 OpenAI 官方 key。

## 日报关注关键词

- 已拍板：不再用 Google News RSS（服务器 IP 会被 429）。每个关键词搜一次（不限语言、取 50 条），再由模型筛选和写摘要（`mods/day_keyword_news.go`）。搜索走业务“联网搜索”（`web_search`，搜索类型的队列，目前是 DeepSeek Search API），筛选走业务“日报关键词筛选”（`keyword_news`，推荐 `deepseek-flash`，调用协议选“OpenAI 文字”才有严格的结构化输出，medium）。两个业务没绑队列时每个关键词记一条错误。某个关键词失败只记在它自己的 `Error` 上，日报其余部分照常生成。
- 暂停一个关键词是在 `auto.news.keys` 里给它加 `#废弃` 后缀（设置页的开关写这个，`#已废弃` 是旧写法，同样算暂停）。列表整个为空时日报会直接生成失败，所以设置页不允许删空。
- 结果存在 `DayReport.KeywordNews`，摘要里的引用是 `kw:组:条`。旧日报的 `GoogleNews` / `google:组:条` 只读不写，前端 `report/keywordNews.ts` 把它转成同样的结构展示。
- 全量日报页（"生成汇总"）仍走旧的 RSS，按决定不管它。
- 飞书推送里的日报链接带 `?t=签名`，不登录也能看那一天（`mods/day_share.go`，接口 `getSharedReport` 不看登录态）。签名是 HMAC(日期)，密钥在 `auto.report.share_secret`，首次启动自动生成；已拍板不设过期，泄露了就改密钥让旧链接全部失效。
- 飞书卡片的 markdown 每个换行都原样显示：标题转成加粗行后只在上方空一行，下方紧贴正文（`mian_go_lib/xpush/pushmod/feishu.go`）。
- 收录原则是宁可多收不漏：爆料、前瞻、论坛讨论都收，用 `kind` 标类型；来源不设黑名单，内宣媒体、收钱发稿由模型判断后写进 `caution` 打标签。发布日期接受目标日前后各一天，日期缺失也保留，重复靠前一天日报的链接去重。
- 模型只返回候选编号，链接和已知日期由代码从搜索结果取，模型编不出链接。Search API 的日期是 UTC，要换算成北京时间再判断范围。
- 选型实测（2026-11）：限定中文搜索漏得多；deepseek-v4-pro 自带联网有一半关键词输出解析失败；flash 自带联网约贵 3 倍；把候选砍到 25 条以内只省约 3 元/月，重要新闻却漏一半，不要为省 token 精简候选。
- `openai-go` 停在 v3.29：新版要求 Go 1.26，而项目是 1.23。GPT-6 需要的东西（`max` 强度、`phase`、`tool_usage`）都在 `tool/ai/v2/chat.go` 里按原始 JSON 处理了，升级 Go 时再一起升。


## 历史迁移工具

- `cmd/migrate_library_notes`、`cmd/migrate_library_score_details`：Library 停服迁移的参考实现（默认只读出计划，`--apply` 必须配合 `--confirm-stopped` 并先写备份，支持 `--verify`/`--rollback`）。以后写数据迁移照这个模式来。
