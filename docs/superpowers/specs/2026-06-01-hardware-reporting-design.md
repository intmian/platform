# 硬件数据上报设计

日期：2026-06-01
Last verified：2026-06-06

## 概要

`platform` 新增一等硬件模块，用于接入 `/Users/mian/Documents/mian-hardware` 的 `mian-home-core` 网关和 `mian-home-env-mov` 传感设备。当前产品模型已经从“前端新建网关 / 新建设备”调整为“接入密钥 + 自动发现设备”：

1. 接入密钥是全局系统级凭据，一个密钥允许多个 core 网关使用。
2. core 网关和 env-mov 传感器都作为自动发现的 `hardware_devices` 记录存在。
3. 前端不提供新建网关或新建设备入口；设备只能由硬件上报或命令轮询自动发现。
4. 前端设备页默认只展示设备卡片和状态；进入管理模式后才允许重命名、隐藏、取消隐藏和删除。
5. 隐藏设备默认不显示，但仍继续接收和保存数据；管理模式可显示和恢复隐藏设备。
6. 删除设备会清除该设备的本地配置和服务端样本数据，dashboard widget 引用保留并显示“设备已删除”。同一硬件 key 再次接入时，后端分配新的 `hardware_devices.id`，产品上视为新设备。

硬件边界保持不变：`env-mov` 是 BLE 传感器/显示节点，`core` 是唯一 Wi-Fi/HTTP 网关。浏览器和 env-mov 不持久化完整接入 token，core 通过串口配置接入 endpoint/token。

## 目标

1. 管理全局接入密钥，支持创建、禁用、轮换和删除。
2. 自动发现并管理 core 网关设备和 env-mov 采样设备。
3. 永久保存原始环境采样数据，不设置保留期限。
4. 提供以设备为核心的页面：每台设备能查看状态、管理配置、查看数据；网关设备支持命令入口，第一版只暴露 OTA。
5. 提供全局唯一数据看板，允许选择一台或多台设备，把实时值或一段时间的折线图展示在同一看板中。
6. 保证上报链路具备持久性和幂等性，让 core 可以安全重试 SD 队列中的上传。

## 非目标

1. 不恢复 env-mov 直连 Wi-Fi 上传。
2. 不给每个 env-mov 分配独立 platform token。
3. 不增加 MQTT、Home Assistant 自动发现或第三方 telemetry 转发。
4. 第一版不实现服务端主动推送命令。
5. 正常运行中不删除、不降采样原始采样数据。
6. 不使用 `xstorage` 存储高频采样行。
7. 不做用户级硬件空间隔离；这是全局系统，拥有 `hardware` 或 `admin` 权限的用户可以访问和管理。

## 后端边界

新增名为 `hardware` 的后端模块。

管理 RPC 使用现有登录态服务网关：

```text
POST /service/hardware/:cmd
```

设备侧路由使用接入密钥，不依赖浏览器 cookie：

```text
POST /device/hardware/ingest
POST /device/hardware/poll-commands
POST /device/hardware/command-result
```

该模块负责：

1. 接入密钥生命周期。
2. 基于 `gatewayKey` 自动发现 core 网关设备。
3. 基于记录中的 `nodeKey` 自动发现 env-mov 采样设备。
4. 将完整原始采样写入硬件数据表。
5. 提供设备状态、样本查询、全局看板和网关命令队列。

platform 服务注册表新增 `NameHardware`、`FlagHardware` 和 `hardware` 权限。拥有 `admin` 或 `hardware` 权限的用户可以管理设备、接入密钥、全局看板和命令。

## 存储边界

正式硬件持久化目标是独立 hardware D1/GORM schema。token、设备元数据、采样数据和命令状态应位于同一个硬件模块数据域中，使运行状态和原始采样有同一个权威来源。不要把原始采样写入 `xstorage`，因为采样数据是追加密集型、按时间范围查询，并且必须永久保留。

当前落地实现先使用模块私有本地 SQLite：`services/hardware/hardware.db`。原因是 platform 当前只把日志 D1 连接封装在 `xbi` 内部，`ServiceShare` 没有暴露可被业务服务直接复用的 GORM D1 连接；直接混用日志 D1 会破坏职责边界。因此当前版本可用于本地完整链路和硬件试运行，正式长期部署前必须补齐独立 hardware D1 配置和迁移路径。

按 1 分钟采样计算，一个 env-mov 每年产生 525,600 条采样。使用窄数字行和必要索引时，单设备每年预计在数百 MB 级别；多设备、多年部署可能接近 D1 单库大小限制。第一版不需要多个数据库，但数据访问层不能写死会阻碍后续年度数据分库的假设。

预留拆分路径：

```text
hardware_meta
hardware_data_2026
hardware_data_2027
```

## 数据模型

### `hardware_access_credentials`

系统级接入密钥。一个密钥允许多个 core 网关使用。

核心字段：

```text
id
name
token_hash
token_prefix
enabled
last_used_at
created_at
updated_at
```

规则：

1. 只保存 token 哈希和短显示前缀。
2. 完整 token 只在创建或轮换后立即显示一次。
3. 支持创建、启用/禁用、轮换和删除。
4. platform UI 和 core 串口 `UPLOAD STATUS` 都只显示 token prefix。

### `hardware_devices`

自动发现的设备。`gateway` 表示 core 网关；`env_mov` 表示环境采样设备。

核心字段：

```text
id
hardware_key
type
name
hidden
deleted_at
last_seen_at
last_sample_at
last_gateway_device_id
last_session_id
last_seq
last_epoch_sec
latest_sample_id
last_ip
user_agent
meta_json
created_at
updated_at
```

规则：

1. `hardware_devices.id` 是服务端生成的产品身份，也是前端、看板和命令引用的稳定 ID。
2. `hardware_key` 是硬件上报的稳定 key，例如 `gateway-<mac_without_colons>` 或 `envmov-<node_id_hex>`。
3. 删除设备后保留 deleted tombstone；同一 `hardware_key` 再次上报时分配新的 `hardware_devices.id`。
4. 隐藏设备继续接收样本和状态更新。
5. 默认名称为真实类型加短 ID，例如 `gateway-62cc`、`env_mov-98c0`；用户可在管理模式重命名。

### `hardware_samples`

永久保存原始环境采样。

核心字段：

```text
id
device_id
gateway_device_id
hardware_key
session_id
seq
epoch_sec
protocol_version
temp_c10
humi_rh
batt_pct
scd41_co2_ppm
tvoc_ppb
voc_aqi
eco2_ppm
flags
crc16
created_at
```

兼容迁移字段 `gateway_id`、`node_id`、`node_key` 仅用于旧表迁移，不作为新产品模型。

索引和幂等：

```text
unique(device_id, session_id, seq)
index(device_id, epoch_sec)
index(gateway_device_id)
index(hardware_key)
```

`session_id` 表示记录序列世代，不是 HTTP session、BLE connection session 或普通 boot session。只要同一 `hardware_key` 下 `seq` 可能从头开始，就必须切换新的 `session_id`。

硬件侧 session 规则：

1. 正常重启、OTA、core 重连、Wi-Fi 重连不切换 `session_id`，`seq` 继续单调递增。
2. env-mov SD history 被清空、格式化、损坏后重建，或者用户显式 reset history 时，必须生成新的 `session_id` 并从新 `seq` 世代开始。
3. env-mov 无 SD、只能 RAM 临时 pending 时，使用 volatile boot session；重启后必须生成新的 `session_id`。

### `hardware_commands`

保存网页发给 gateway 设备的排队命令。

核心字段：

```text
id
device_id
gateway_device_id
type
payload_json
status
lease_until
delivered_at
acked_at
created_by
last_error
created_at
updated_at
```

状态：

```text
pending
delivered
acked
failed
cancelled
```

`poll-commands` 下发命令时使用 lease。命令可从 `pending` 进入 `delivered`，但只有 `lease_until` 到期后才允许再次下发；core 上报 `command-result` 后才进入 `acked` 或 `failed`。第一版 UI 只暴露 gateway OTA 命令。

### `hardware_dashboards`

保存全局唯一汇总看板。

核心字段：

```text
key
name
time_range
refresh_sec
layout_json
created_at
updated_at
```

### `hardware_dashboard_widgets`

保存全局看板中的单个实时值卡片或折线图。

核心字段：

```text
id
title
type
device_ids_json
metrics_json
time_range
bucket
agg
options_json
sort_index
created_at
updated_at
```

约束：

1. `device_ids_json` 保存被选中的 `hardware_devices.id` 列表。
2. Dashboard 可引用被删除设备；查询时返回 deleted 设备状态，前端显示“设备已删除”。
3. `metrics_json` 只能使用服务端 allowlist 中的指标字段，例如 `scd41_co2_ppm`、`temp_c10`、`humi_rh`、`batt_pct`、`tvoc_ppb`、`voc_aqi`、`eco2_ppm`。
4. 看板查询必须要求时间范围、bucket 或点数限制；保存看板配置不等于允许无界查询。
5. 第一版只存在一个全局看板，不引入用户级 owner、共享权限或多看板列表。
6. widget 类型支持实时值卡片和折线图；折线图支持时间范围、粒度和聚合。

## 上报契约

Core 从自己的 SD outbox 批量上传。请求必须包含稳定 `gatewayKey`，使一个接入密钥可同时服务多个网关。

链路责任分两段：

1. env-mov 负责把采样历史全量可靠交给 core。
2. core 负责把已进入 core SD outbox 的记录可靠送到 web/platform。

env-mov 到 core 可以批量传输，但 ack 必须按连续前缀推进：env-mov 按 `node_id + session_id + seq` 从 core 提供的 cursor 之后返回一批记录；core 只有在这一批中的连续前缀已经可靠写入 core SD outbox 后，才 ack 到该前缀最后一条。如果批次中第 11 条写入失败，只能 ack 到第 10 条，下次仍从第 11 条继续。`current` 读数只能用于状态展示和时间同步，不能推进 env-mov history ack cursor，也不能导致中间 history 被跳过。

请求：

```json
{
  "gatewayKey": "gateway-2884857562cc",
  "gatewayTime": 1780291200,
  "records": [
    {
      "nodeKey": "envmov-9f3a21bc4d55e012",
      "sessionId": "7a77b88e0e9a4f5c8d5996db93d6d4a1",
      "seq": 123,
      "epochSec": 1780291140,
      "protocolVersion": 4,
      "tempC10": 245,
      "humiRh": 51,
      "battPct": 83,
      "scd41Co2Ppm": 732,
      "tvocPpb": 120,
      "vocAqi": 2,
      "eco2Ppm": 650,
      "flags": 255,
      "crc16": 12345
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
  "serverTime": 1780291205,
  "records": [
    {
      "nodeKey": "envmov-9f3a21bc4d55e012",
      "sessionId": "7a77b88e0e9a4f5c8d5996db93d6d4a1",
      "seq": 123,
      "status": "accepted"
    }
  ]
}
```

单条状态：

```text
accepted
duplicate
failed
```

后端把重复幂等键视为成功。Core 只能在对应记录状态为 `accepted` 或 `duplicate` 后，才从本地 SD outbox 清理记录。状态为 `failed` 的记录不能被清理。

鉴权优先使用：

```text
Authorization: Bearer <device_token>
```

## 前端

新增顶级路由：

```text
/hardware
```

页面位于：

```text
frontend/src/hardware/
```

当前页面结构：

1. 设备：默认入口，卡片展示自动发现设备。默认隐藏 hidden/deleted 设备；管理模式显示 hidden/deleted，并允许重命名、隐藏、取消隐藏、删除。gateway 卡片在管理模式显示 IP、客户端和 OTA 命令入口。
2. 看板：全局唯一数据看板。支持实时值卡片和折线图；折线图支持过去 N 小时、固定时间范围、粒度、聚合和刷新间隔。只允许选择可观测采样设备，不把 gateway 作为数据图表源。
3. 接入密钥：单独管理接入密钥，支持创建、编辑、轮换、禁用和删除。完整 token 只在创建或轮换后展示一次。

产品原则：

1. 不在界面展示“新建网关”“新建设备”。
2. 默认页面不暴露 `node`、`session`、`seq`、`payload`、`protocol`、`raw` 等实现概念。
3. 单设备管理动作只在设备页管理模式出现，避免汇总看板混入 token、删除等高风险动作。
4. 看板中无效字段必须显示为空/无数据，不把硬件记录中的 `0` 当作真实读数。

使用 platform 请求 envelope（`code = 0`，数据在 `data` 中）和现有请求 helper。不要在浏览器侧保存设备 token。

## 后端 RPC 面

当前管理命令：

```text
listDevices
updateDevice
deleteDevice
listCredentials
createCredential
rotateCredential
updateCredential
deleteCredential
querySamples
getDashboard
saveDashboard
queryDashboard
listCommands
createCommand
cancelCommand
```

查询 API 必须要求显式时间范围和分页/点数限制。设备页和全局看板渲染都应在服务端降采样，或对较大时间范围返回 bucketed series；原始表保持不变。`getDashboard` 返回全局看板配置，`saveDashboard` 覆盖保存全局看板配置，`queryDashboard` 根据保存的 widget 配置执行受限查询。

## 错误处理

1. token 无效或密钥已禁用时，设备侧返回错误，但不暴露密钥是否存在。
2. 批量中的坏记录不应阻塞有效记录，除非整个 payload 格式非法。
3. 重复记录计入 duplicate，不作为硬失败。
4. ingest 只有在 token 校验通过后，才更新 credential last-used 和 gateway last-seen。
5. 命令轮询只返回当前 `gatewayKey` 对应 gateway 的 pending/delivered-expired 命令。
6. 删除设备会清除该设备样本并取消 pending 命令；dashboard 引用保留。

## 指标和 flags

`flags` 使用硬件 `EnvMovRecordFlags` 的位定义，platform 不得把无效字段按 0 值展示为真实读数：

```text
bit 0: temp_c10 valid
bit 1: humi_rh valid
bit 2: batt_pct valid
bit 3: scd41_co2_ppm valid
bit 4: tvoc_ppb valid
bit 5: voc_aqi valid
bit 6: eco2_ppm valid
bit 7: epoch_sec valid
```

当 `epoch_sec` 无效时，core 当前不会把记录写入上传队列。服务端仍应校验 `flags` 和 `epochSec`，拒绝或标记非法时间记录，避免看板混入 `1970` 或空时间数据。

## 硬件仓库状态

硬件仓库路径：

```text
/Users/mian/Documents/mian-hardware
```

当前已完成的硬件侧第一版改造：

1. BLE/SD 原始记录已带稳定 `node_id`、128-bit `session_id` 和 `seq`，协议版本已升级到 4。
2. env-mov 维护稳定设备身份和记录世代；正常重启、BLE 重连、core 重启和 Wi-Fi 重连不切换 `session_id`。
3. BLE 同步 cursor 已升级为完整 `node_id + session_id + seq`。
4. core SD queue 按完整 cursor 去重、读取 batch，并在服务端逐条 ACK 后 compact。
5. core upload client 已实现 endpoint/token NVS 配置、Bearer 认证、稳定 `gatewayKey`、批量 ingest、逐条 `accepted` / `duplicate` / `failed` 处理和成功后队列清理。
6. core 固件已在 `/dev/cu.usbmodem101` 烧录成功，MAC 为 `28:84:85:75:62:cc`；新固件使用 `gateway-2884857562cc` 上报 gateway identity。

当前硬件现场待验证/待排查：

1. env-mov 还未通过 core 完成 OTA 到最新嵌入固件；若 env-mov 仍是旧固件，需要先通过 USB 或稳定 BLE OTA 更新。
2. 2026-06-06 现场 core 心跳已进入 platform，但 env-mov 新样本没有继续进入服务端。
3. 串口观察到 core 可扫描到 env-mov，但 BLE 连接存在反复失败；需要同时抓 core 和 env-mov 两侧日志区分是低功耗窗口、GATT discovery 还是连接参数问题。
4. 串口观察到 core SD 底层 `sdCommand(): token error [17] 0x4`，需要先做物理卡/接触/格式验证，再决定是否调整 SPI 频率或恢复策略。

## 测试和验证

后端：

1. 单测接入密钥创建、哈希、轮换、禁用和一次性 token 返回。
2. 单测批量 ingest：有效记录、重复记录、坏记录、禁用密钥、无效 token。
3. 单测设备自动发现、删除后同硬件 key 再发现生成新设备 ID、最新采样更新。
4. 单测命令队列生命周期：pending、delivered、acked、failed、cancelled。
5. D1/GORM migration 测试覆盖所有硬件表。

前端：

1. 构建/type/lint 相关前端代码。
2. 浏览器验证设备卡片、管理模式、隐藏/取消隐藏、删除设备和“设备已删除”看板状态。
3. 浏览器验证全局看板编辑：选择设备、选择指标、保存配置、重新打开后仍是同一份全局配置，并按配置查询和渲染。
4. 浏览器验证接入密钥独立页面，完整 token 不在列表中暴露。
5. 对 `hardware` 权限用户和 `admin` 用户各验证一条访问路径。
6. 对桌面和移动端都验证无横向溢出、图表非空、交互状态可用。

硬件集成：

1. core upload client 使用配置的设备 token 发送批量 ingest。
2. 重试一个已接受批次，确认重复记录不会创建额外采样。
3. 确认 core 在后端 ingest 成功前不会清理 SD 队列记录。
4. 确认无命令和存在 pending 命令两种情况下，命令轮询都正常。
5. 确认 core SD queue 支持上传批次读取、逐条 ACK 后推进、失败记录保留、重启后继续上传。
6. 确认 env-mov 正常重启不切换 `session_id`，清空 history 或无 SD volatile 重启会切换 `session_id`。
7. 确认 BLE cursor 和 core SD outbox 都使用 `node_id + session_id + seq`，旧 session ack 不会跳过新 session 记录。
8. 确认 env-mov 到 core 的批量同步不会跳过历史：core 只 ack 已写入 SD outbox 的连续前缀，`current` 不推进 history cursor。

## 推出计划

1. 后端 hardware 服务注册和本地 schema 已完成；正式部署前切换为独立 hardware D1 schema。
2. 设备侧 ingest 和命令轮询路由已完成。
3. 接入密钥、设备、采样、命令和看板 RPC 已完成。
4. `/hardware` 前端路由和页面已完成第一版。
5. `/Users/mian/Documents/mian-hardware` 的 env-mov 记录协议、identity/session state、BLE cursor、core SD queue 和 upload client 已完成第一版。
6. 待完成硬件现场回归：core SD 稳定性、BLE 同步稳定性、env-mov OTA、真实新样本持续进入 platform。

## 实现默认决策

1. 正式 hardware D1 配置 key 预留为：

```text
hardware/db/account_id
hardware/db/api_token
hardware/db/db_id
```

2. 第一版前端入口加入 admin home。
3. 第一版命令队列支持 generic typed commands 和 JSON payload，但 UI 只暴露 gateway OTA。
