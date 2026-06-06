# 硬件数据上报设计

日期：2026-06-01

## 概要

在 `platform` 中新增一等硬件数据上报模块，用于接入 `mian-hardware` 的 core 网关。该模块接收 core 上报的完整环境采样数据，将原始采样永久写入 D1，管理固定设备 token，在前端提供硬件看板，并预留网页到 core 的命令队列。

硬件项目保持当前边界：`env-mov` 是 BLE 传感器/显示节点，`core` 是唯一 Wi-Fi/HTTP 网关。platform 凭据归属 core 网关。`env-mov` 节点只作为上报 payload 内的节点数据存在，不持有面向互联网的凭据。

## 目标

1. 在 platform 内管理 core 网关设备和固定上传 token。
2. 永久保存原始环境采样数据，不设置保留期限。
3. 在独立前端页面展示网关在线状态、节点状态、最新读数、指标定义和基础看板。
4. 保证上报链路具备持久性和幂等性，让 core 可以安全重试 SD 队列中的上传。
5. 预留命令队列，让网页 UI 后续可以要求 core 执行网关或节点命令。
6. 遵循现有后端服务风格，同时使用 D1/GORM 持久化硬件数据，接近 todone 的 D1-backed 模型。

## 非目标

1. 不恢复 `env-mov` 直连 Wi-Fi 上传。
2. 第一版不给每个 `env-mov` 节点分配 platform token。
3. 不增加 MQTT、Home Assistant 自动发现或第三方 telemetry 转发。
4. 第一版不实现服务端主动推送命令。
5. 正常运行中不删除、不降采样原始采样数据。
6. 不使用 `xstorage` 存储高频采样行。

## 架构

### 后端边界

新增名为 `hardware` 的后端模块。

管理 RPC 使用现有登录态服务网关：

```text
POST /service/hardware/:cmd
```

设备侧路由使用固定网关 token，不依赖浏览器 cookie：

```text
POST /device/hardware/ingest
POST /device/hardware/poll-commands
POST /device/hardware/command-result
```

该模块负责：

1. 网关注册和 token 生命周期。
2. 基于上报 payload 派生节点注册和 last-seen 状态。
3. 将完整原始采样写入 D1。
4. 为前端提供看板/查询 API。
5. 命令队列存储和状态流转。

platform 服务注册表新增 `NameHardware`、`FlagHardware` 和 `hardware` 权限。admin 用户可以管理所有网关和 token。后续如需要只读看板，可再增加 viewer 权限。

### 存储边界

硬件持久化数据使用 D1/GORM。token 和小规模元数据与采样数据放在同一个 D1-backed 模块中，使运行状态和原始采样有同一个权威来源。不要把原始采样写入 `xstorage`，因为采样数据是追加密集型、按时间范围查询，并且必须永久保留。

第一版可以使用一个 D1 数据库存放所有硬件表。schema 必须让采样表保持窄表设计，使单库能支撑较长周期。按 1 分钟采样计算，一个节点每年产生 525,600 条采样。使用窄数字行和必要索引时，单节点每年预计在数百 MB 级别；多节点、多年部署可能接近 D1 单库大小限制。

在需要前预留拆分路径：

```text
hardware_meta
hardware_data_2026
hardware_data_2027
```

第一版实现不需要多个数据库，但数据访问层不能写死会阻碍后续年度数据分库的假设。当单库接近 7-8 GB、节点数量增长影响看板延迟，或跨年归档操作变得常见时再拆分。

## 数据模型

### `hardware_gateways`

表示一个 `mian-home-core` 网关。

核心字段：

```text
id
name
token_hash
token_prefix
enabled
last_seen_at
last_ingest_at
created_at
updated_at
note
```

Token 规则：

1. 只保存 token 哈希和短显示前缀。
2. 完整 token 只在创建或轮换后立即显示一次。
3. 支持禁用和轮换。
4. 已禁用网关不能上报采样，也不能轮询命令。

### `hardware_nodes`

表示 core 网关背后的一个上传传感器节点。

核心字段：

```text
id
gateway_id
node_key
name
kind
enabled
last_seen_at
latest_sample_at
metadata_json
created_at
updated_at
```

`node_key` 由 core 提供。第一版可以使用稳定默认值，例如 `env-mov-1`。多节点支持要求同一网关下每个节点有唯一 `node_key`。

### `hardware_samples`

永久保存原始环境采样。

核心字段：

```text
id
gateway_id
node_id
node_key
session_id
seq
epoch_sec
temp_c10
humi_rh
batt_pct
scd41_co2_ppm
tvoc_ppb
voc_aqi
eco2_ppm
flags
received_at
```

索引：

```text
unique(gateway_id, node_key, session_id, seq)
index(node_id, epoch_sec)
index(gateway_id, received_at)
```

第一版不要为每个指标字段单独加索引。看板查询应按节点和时间范围过滤，再只读取需要的列。

`session_id` 初期可以为空。当前 `EnvMovRecordV2` 只有 `seq`，所以第一版幂等键为：

```text
gateway_id + node_key + seq
```

在支持多个 env-mov 节点、设备替换、清空数据后序号重置，或长期多 session 历史之前，硬件协议必须包含稳定节点身份和 boot/session generation。届时幂等键改为：

```text
gateway_id + node_key + session_id + seq
```

### `hardware_commands`

保存网页发给 core 的排队命令。

核心字段：

```text
id
gateway_id
node_id
type
payload_json
status
created_by
created_at
delivered_at
finished_at
expires_at
```

状态：

```text
pending
delivered
acked
failed
expired
```

第一版只需要队列、轮询 API 和结果记录。不需要服务端主动推送。

### `hardware_command_logs`

保存命令执行结果明细。

核心字段：

```text
id
command_id
gateway_id
status
result_json
message
created_at
```

## 上报契约

Core 从自己的 SD 队列批量上传。

请求：

```json
{
  "gatewayTime": 1780291200,
  "records": [
    {
      "nodeKey": "env-mov-1",
      "sessionId": "",
      "seq": 123,
      "epochSec": 1780291140,
      "tempC10": 245,
      "humiRh": 51,
      "battPct": 83,
      "scd41Co2Ppm": 732,
      "tvocPpb": 120,
      "vocAqi": 2,
      "eco2Ppm": 650,
      "flags": 255
    }
  ]
}
```

响应：

```json
{
  "accepted": 1,
  "duplicate": 0,
  "failed": 0,
  "serverTime": 1780291205
}
```

后端把重复幂等键视为成功，core 因此可以安全重试。Core 只有在收到成功的 ingest 响应后，才应该移除本地 SD 队列中的记录。

鉴权使用以下任一形式：

```text
Authorization: Bearer <device_token>
```

或：

```text
X-Device-Token: <device_token>
```

优先使用 `Authorization: Bearer`，除非 core HTTP 库约束导致实现不方便。

## 前端

新增顶级路由：

```text
/hardware
```

页面位于：

```text
frontend/src/hardware/
```

初始视图：

1. Gateways：列出 core 网关、在线状态、最后上报时间、启用状态、备注和 token 操作。
2. Token management：创建、一次性复制、轮换、禁用。
3. Nodes：展示每个网关下的节点列表、类型、最后采样时间和最新读数。
4. Dashboard：按时间范围查询 CO2、温度、湿度、电池、TVOC、AQI 和 eCO2 诊断值趋势。
5. Metrics definitions：稳定展示标签、单位、字段名和有效位含义。
6. Commands：列出排队/近期命令，并在命令类型定义后允许创建命令。

使用 platform 请求 envelope（`code = 0`，数据在 `data` 中）和现有请求 helper。不要在浏览器侧保存设备 token。

## 后端 RPC 面

初始管理命令：

```text
listGateways
createGateway
rotateGatewayToken
disableGateway
updateGateway
listNodes
updateNode
queryLatest
querySamples
listCommands
createCommand
cancelCommand
```

查询 API 必须要求显式时间范围和分页/点数限制。看板渲染应在服务端降采样，或对较大时间范围返回 bucketed series；原始表保持不变。

## 错误处理

1. token 无效或网关已禁用时，设备侧返回错误，但不暴露网关是否存在。
2. 批量中的坏记录不应阻塞有效记录，除非整个 payload 格式非法。
3. 重复记录计入 accepted duplicates，不作为硬失败。
4. ingest 只有在 token 校验通过后，才更新 `last_seen_at` 和节点最新状态。
5. 命令轮询只返回当前已鉴权网关的 pending 命令。
6. 过期命令不再下发给 core。

## 测试和验证

后端：

1. 单测 token 创建、哈希、轮换、禁用和一次性 token 返回。
2. 单测批量 ingest：有效记录、重复记录、坏记录、禁用网关、无效 token。
3. 单测节点自动 upsert 和最新采样更新。
4. 单测命令队列生命周期：pending、delivered、acked、failed、expired。
5. D1/GORM migration 测试覆盖所有硬件表。

前端：

1. 构建/type/lint 相关前端代码。
2. 浏览器验证网关列表、token 创建/轮换流程、节点状态、看板查询和命令列表。
3. 对现有 admin 导航和登录行为跑一条相邻回归路径。

硬件集成：

1. Core upload client 使用配置的设备 token 发送批量 ingest。
2. 重试一个已接受批次，确认重复记录不会创建额外采样。
3. 确认 core 在后端 ingest 成功前不会清理 SD 队列记录。
4. 确认无命令和存在 pending 命令两种情况下，命令轮询都正常。

## 推出计划

1. 新增后端 hardware 服务注册和 D1 schema。
2. 新增设备侧 ingest 和命令轮询路由。
3. 新增网关、token、节点、采样和命令管理 RPC。
4. 新增 `/hardware` 前端路由和页面。
5. 更新 `mian-hardware` core `upload_client`，配置 endpoint/token 并发送批次。
6. 实现产生稳定契约后，再补充 hardware 相关文档。

## 实现默认决策

1. Hardware D1 配置 key 为：

```text
hardware/db/account_id
hardware/db/api_token
hardware/db/db_id
```

2. 第一版前端入口加入 admin home。第一版不要求加入共享 header。
3. 第一版命令队列支持 generic typed commands 和 JSON payload，但 UI 只暴露网关诊断命令，直到具体 env-mov 命令类型被定义。

