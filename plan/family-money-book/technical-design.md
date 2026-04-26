# Family Money Book Technical Design

## 1. 目标和边界

本文是 `product-plan.md` 和 `issues/` 的前后端技术方案，用于实现前先确认架构边界和分工。

### 1.1 本轮设计目标

1. 第一部分先落地账目管理和对账：
   - 账本配置
   - 项目配置
   - 批次录入
   - 平账建议
   - 投资盈利
   - 资产负债汇总
   - 历史批次
2. 第二部分再落地数据看板：
   - 看板 ACL
   - 只读看板 API
   - 看板 UI 和趋势
3. Excel 历史导入作为后续迁移能力单独实现。

### 1.2 明确非目标

1. 不做图片 OCR。
2. 不做银行、支付宝、微信同步。
3. 不自动写入随手记。
4. 不把 Excel 作为日常记账方式。
5. 第一版不引入新的通用共享库，除非后续多个模块复用同一能力。

## 2. 架构边界

### 2.1 后端归属

家庭账本第一版放在 `backend/platform` 的 platform-owned misc 能力下，不注册为独立 service。

原因：

1. 产品计划已建议第一版放在 platform-owned misc 路由下。
2. 家庭账本需要直接使用现有 cookie 登录态和 `share.Valid`。
3. 第一版是单一业务模块，没有 service 生命周期、启动开关、跨服务 RPC 的收益。
4. 和现有 `subscription` 一样，属于平台内置的轻量业务能力。

建议文件：

1. `backend/platform/money_book.go`
   数据结构、manager、存储读写。
2. `backend/platform/money_book_calc.go`
   平账建议、投资盈利、资产负债计算。
3. `backend/platform/money_book_api.go`
   Gin handler 和权限校验。
4. `backend/platform/money_book_test.go`
   存储、计算、权限相关测试。

如果后续功能增长到需要独立权限命令、后台任务或跨模块调用，再迁移为 `services/money`。

### 2.2 前端归属

家庭账本作为独立业务页面放在 `frontend/src/money`。

建议文件：

1. `frontend/src/money/types.ts`
2. `frontend/src/money/moneyApi.ts`
3. `frontend/src/money/MoneyBookList.tsx`
4. `frontend/src/money/MoneyConfigPage.tsx`
5. `frontend/src/money/MoneyReconcilePage.tsx`
6. `frontend/src/money/MoneyHistoryPage.tsx`
7. `frontend/src/money/MoneyDashboardPage.tsx`
8. `frontend/src/money/MoneyImportPage.tsx`
9. `frontend/src/money/money.css`

路由注册在 `frontend/src/App.jsx`。

## 3. 后端设计

### 3.1 存储策略

继续使用平台现有 `xstorage`，以 JSON 结构保存。第一版不新建独立 SQL 表。

建议存储 key：

1. `misc.money.books`
   保存账本索引，类型为 `[]MoneyBookIndexItem`。
2. `misc.money.book.{bookId}`
   保存单个 `MoneyBook`。
3. `misc.money.book.{bookId}.items`
   保存账本项目，类型为 `[]MoneyItem`。
4. `misc.money.book.{bookId}.batches`
   保存批次索引，类型为 `[]ReconciliationBatchIndexItem`。
5. `misc.money.book.{bookId}.batch.{batchId}`
   保存单个完整批次，类型为 `ReconciliationBatch`。
6. `misc.money.book.{bookId}.imports`
   后续 Excel 导入去重索引，第一阶段不实现。

设计取舍：

1. 不把整个账本塞进一个大 JSON，避免每次保存批次都重写所有历史。
2. 索引和详情分离，方便列表接口轻量返回。
3. 同一 manager 内部用 `sync.Mutex` 包住跨 key 操作，避免索引和详情写入顺序导致短暂不一致。
4. 每个核心结构带 `schemaVersion`，为后续迁移留出口。

### 3.2 金额表示

后端内部金额使用 `int64` 分为单位，字段命名统一使用 `*Cents`。

原因：

1. 避免 `float64` 金额累加误差。
2. 当前需求录入的是资产价值，不是外币或虚拟币数量；第一版可统一换算为人民币价值。
3. 年化变化率、负债率这类比例用 `float64`，不参与金额持久化。

前端输入允许元为单位的小数，提交前转成分，或由后端统一解析。推荐 API 直接传 `amountCents`，前端显示时格式化。

### 3.3 核心类型

```go
type MoneyBook struct {
    SchemaVersion           int       `json:"schemaVersion"`
    ID                      string    `json:"id"`
    Name                    string    `json:"name"`
    PrimaryBalanceAccountID string    `json:"primaryBalanceAccountId"`
    Enabled                 bool      `json:"enabled"`
    ViewerUsers             []string  `json:"viewerUsers"`
    CreatedAt               time.Time `json:"createdAt"`
    UpdatedAt               time.Time `json:"updatedAt"`
}
```

```go
type MoneyItem struct {
    ID                         string `json:"id"`
    BookID                     string `json:"bookId"`
    Name                       string `json:"name"`
    Type                       string `json:"type"`
    Enabled                    bool   `json:"enabled"`
    Sort                       int    `json:"sort"`
    IncludeInReconcile         bool   `json:"includeInReconcile"`
    IncludeInCash              bool   `json:"includeInCash"`
    IncludeInInvestmentProfit  bool   `json:"includeInInvestmentProfit"`
    IncludeInNetAsset          bool   `json:"includeInNetAsset"`
    IncludeInLiability         bool   `json:"includeInLiability"`
    Note                       string `json:"note"`
}
```

```go
type ReconciliationBatch struct {
    SchemaVersion     int                   `json:"schemaVersion"`
    ID                string                `json:"id"`
    BookID            string                `json:"bookId"`
    Date              string                `json:"date"`
    Status            string                `json:"status"`
    IntervalDays      int                   `json:"intervalDays"`
    Entries           []ReconciliationEntry `json:"entries"`
    BalanceSuggestions []BalanceSuggestion  `json:"balanceSuggestions"`
    Summary           MoneySummary          `json:"summary"`
    Events            []MoneyEvent          `json:"events"`
    Source            string                `json:"source"`
    SourceRef         string                `json:"sourceRef"`
    CreatedBy         string                `json:"createdBy"`
    ConfirmedBy       string                `json:"confirmedBy"`
    CreatedAt         time.Time             `json:"createdAt"`
    UpdatedAt         time.Time             `json:"updatedAt"`
    ConfirmedAt       time.Time             `json:"confirmedAt"`
}
```

```go
type ReconciliationEntry struct {
    ItemID             string `json:"itemId"`
    ItemNameSnapshot   string `json:"itemNameSnapshot"`
    ItemTypeSnapshot   string `json:"itemTypeSnapshot"`
    PreviousValueCents int64  `json:"previousValueCents"`
    CurrentValueCents  int64  `json:"currentValueCents"`
    BookValueCents     int64  `json:"bookValueCents"`
    ActualValueCents   int64  `json:"actualValueCents"`
    Note               string `json:"note"`
}
```

快照字段用于历史批次展示，避免项目改名后历史批次失去当时语义。

### 3.4 状态机

批次状态第一版只有：

1. `draft`
   可编辑、可计算、可删除或覆盖。
2. `confirmed`
   默认锁定，不允许普通保存接口修改。

状态转换：

1. create -> `draft`
2. update -> `draft`
3. compute -> 不改变状态，只返回或写入草稿计算结果。
4. confirm -> `confirmed`

已确认批次后续如需修改，应新增审计型 issue，不在第一版实现。

### 3.5 计算设计

计算函数保持纯函数风格：

```go
func ComputeMoneyBatch(book MoneyBook, items []MoneyItem, prev *ReconciliationBatch, batch ReconciliationBatch) (MoneyComputeResult, error)
```

输入：

1. 当前账本。
2. 当前项目配置。
3. 上一个已确认批次，可为空。
4. 当前草稿或待确认批次。

输出：

1. `[]BalanceSuggestion`
2. `MoneySummary`
3. 每项变化明细。
4. 校验错误或警告。

#### 3.5.1 平账建议

只处理 `includeInReconcile=true` 的项目。

1. 主平账账户来自 `MoneyBook.PrimaryBalanceAccountID`。
2. 债务账户使用负数口径：
   - 普通账户：`effective = value`
   - `debt_account`：`effective = -value`
3. 非主账户差额：
   - `diff = effectiveActual - effectiveBook`
4. `diff > 0`：
   - 主平账账户转入该账户。
5. `diff < 0`：
   - 该账户转入主平账账户。
6. 主账户理论余额：
   - `primaryTheoretical = primaryEffectiveBook - sum(nonPrimaryDiff)`
7. 未知差额：
   - `unknown = primaryEffectiveActual - primaryTheoretical`
   - `unknown < 0` 为未知去向支出。
   - `unknown > 0` 为未知来源收入。

每条建议保存：

1. 来源项目。
2. 目标项目。
3. 账面值。
4. 实际值。
5. 差额。
6. 建议类型。
7. 文案。

#### 3.5.2 投资盈利

只处理 `includeInInvestmentProfit=true` 的项目。

1. `change = currentValueCents - previousValueCents`
2. `annualizedRate = change / currentValue * 365 / intervalDays`
3. `investmentProfit = sum(change)`

边界：

1. `intervalDays <= 0` 时返回校验错误。
2. `currentValueCents == 0` 时年化变化率返回 0，并记录 warning。

#### 3.5.3 资产负债汇总

1. 现金 = 所有 `includeInCash=true` 项目的 `currentValueCents` 之和。
2. 负债 = 所有 `includeInLiability=true` 项目的 `currentValueCents` 之和。
3. 正资产 = 所有 `includeInNetAsset=true && includeInLiability=false` 项目的 `currentValueCents` 之和。
4. 净资产 = 正资产 - 负债。
5. 总资产 = 净资产 + 负债。
6. 净资产变化 = 本期净资产 - 上一期净资产。
7. 净资产负债率 = 负债 / 净资产。
8. 资产负债率 = 负债 / 总资产。

负债项目在存储中使用正数金额，只有计算净资产时扣减。

### 3.6 API 设计

所有接口沿用现有 platform envelope：

1. 成功：`{ "code": 0, "data": ... }`
2. 失败：`{ "code": 1, "msg": "..." }`

#### 3.6.1 账本和项目

1. `POST /misc/money/book/list`
   - 权限：登录用户；admin 返回全部，viewer 后续只返回可看板账本。
2. `POST /misc/money/book/create`
   - 权限：admin。
3. `POST /misc/money/book/update`
   - 权限：admin。
4. `POST /misc/money/book/delete`
   - 权限：admin。
   - 第一版建议软删除：`enabled=false`。
5. `POST /misc/money/book/grant-dashboard`
   - 权限：admin。
6. `POST /misc/money/item/list`
   - 权限：admin。
7. `POST /misc/money/item/update`
   - 权限：admin。
   - 建议批量提交一个账本的项目列表，减少排序和统计标签的多次写入。

#### 3.6.2 批次

1. `POST /misc/money/batch/create`
   - 权限：admin。
   - 支持从上一确认批次或指定批次复制。
2. `POST /misc/money/batch/get`
   - 权限：admin。
3. `POST /misc/money/batch/update`
   - 权限：admin。
   - 只允许 `draft`。
4. `POST /misc/money/batch/compute`
   - 权限：admin。
   - 可传入未保存草稿，也可按 `batchId` 计算已保存草稿。第一版推荐按 `batchId` 计算，降低前后端状态分叉。
5. `POST /misc/money/batch/confirm`
   - 权限：admin。
   - 确认前强制重新计算并保存结果。
6. `POST /misc/money/batch/list`
   - 权限：admin。

#### 3.6.3 看板

1. `POST /misc/money/dashboard/get`
   - 权限：admin 或 `MoneyBook.viewerUsers`。
   - 只读取 `confirmed` 批次。
   - 不返回平账建议明细。

#### 3.6.4 Excel 导入

1. `POST /misc/money/import/excel/preview`
   - 权限：admin。
   - 后续 issue 实现。
2. `POST /misc/money/import/excel/confirm`
   - 权限：admin。
   - 后续 issue 实现。

### 3.7 权限设计

权限统一在 handler 层校验，manager 层也保留必要的防御性校验。

1. admin：
   - 全部接口。
2. dashboard viewer：
   - 只能访问 `dashboard/get`。
3. 未登录或未授权：
   - 返回 `no permission`。

普通看板用户不能通过前端入口看到配置、对账、历史管理；后端接口仍必须强校验，不能依赖前端隐藏。

## 4. 前端设计

### 4.1 路由

新增路由：

1. `/money`
   账本列表。
2. `/money/:bookId/config`
   管理员配置。
3. `/money/:bookId/reconcile/:batchId`
   对账批次编辑。
4. `/money/:bookId/history`
   历史批次。
5. `/money/:bookId/dashboard`
   只读看板。
6. `/money/:bookId/import`
   Excel 历史导入，后续实现。

### 4.2 页面结构

#### 4.2.1 `MoneyBookList`

职责：

1. 加载当前用户可见账本。
2. admin 显示新建账本、配置、对账、历史、看板入口。
3. viewer 只显示看板入口。

#### 4.2.2 `MoneyConfigPage`

职责：

1. 编辑账本名称。
2. 设置主平账账户。
3. 维护项目列表。
4. 配置统计标签。
5. 后续加入看板授权用户。

建议 UI：

1. 项目用表格编辑。
2. 项目类型用 Select。
3. 统计标签用 Switch 或 Checkbox。
4. 排序用上移/下移按钮或拖拽，第一版优先简单可靠。

#### 4.2.3 `MoneyReconcilePage`

职责：

1. 展示批次基础信息。
2. 编辑账面值、实际值、当期值、间隔天数、大事记。
3. 保存草稿。
4. 计算批次。
5. 确认批次。

页面分区：

1. 批次信息。
2. 账户对账。
3. 资产、投资、债务、债权录入。
4. 平账建议。
5. 投资盈利和资产负债计算。
6. 大事记。

关键要求：

1. 平账建议和投资盈利必须视觉上独立。
2. 已确认批次进入只读状态。
3. 计算前如果本地有未保存修改，先要求保存或自动保存，避免计算数据和页面数据不一致。

#### 4.2.4 `MoneyHistoryPage`

职责：

1. 按日期倒序展示批次列表。
2. 进入历史详情。
3. 从已确认批次复制创建新草稿。
4. 区分 `draft` 和 `confirmed`。

#### 4.2.5 `MoneyDashboardPage`

职责：

1. 调用只读 `dashboard/get`。
2. 展示汇总指标。
3. 展示资产结构、负债结构、历史趋势、大事记。

第一版普通 viewer 默认只展示汇总和趋势，不展示单个项目明细金额，直到产品问题确认。

### 4.3 前端状态和请求

1. `moneyApi.ts` 封装所有 `/misc/money/*` 请求。
2. 页面使用 `useLoginGate` 等待登录态初始化。
3. 后端是唯一数据源，前端不做计算兜底。
4. 草稿页面保留本地 form state，但计算和确认必须以保存到后端的数据为准。
5. API 失败时展示明确错误，不静默回退。

### 4.4 视觉和交互原则

家庭账本是高频操作工具，不做营销式页面。

1. 布局以密集、清晰、可扫描为主。
2. 核心金额使用等宽数字或右对齐。
3. 表格、分区、统计卡保持克制，不做大 hero。
4. 移动端至少能完成查看和轻量录入，但第一版优先桌面可用。
5. 对账页避免嵌套卡片，页面分区用标题和间距表达层级。

## 5. 分阶段落地

### 5.1 Issue 01

后端数据模型、存储、纯计算函数骨架。

交付物：

1. `moneyBookMgr`
2. 存储 key 和读写方法。
3. 基础类型。
4. 计算函数单元测试。

### 5.2 Issue 02

管理员账本和项目配置。

交付物：

1. 账本和项目 API。
2. `/money` 和 `/money/:bookId/config`。
3. admin 权限验证。

### 5.3 Issue 03

批次录入。

交付物：

1. 批次 create/get/update API。
2. `/money/:bookId/reconcile/:batchId` 草稿录入。
3. 上一期带入逻辑。

### 5.4 Issue 04

计算和确认。

交付物：

1. `batch/compute`
2. `batch/confirm`
3. 对账页面计算结果展示。
4. 确认锁定。

### 5.5 Issue 05

历史批次。

交付物：

1. `batch/list`
2. `/money/:bookId/history`
3. 详情和复制草稿。

### 5.6 Issue 06

看板 ACL 和只读 API。

交付物：

1. `book/grant-dashboard`
2. `dashboard/get`
3. admin/viewer/unauthorized 权限测试。

### 5.7 Issue 07

看板 UI 和趋势。

交付物：

1. `/money/:bookId/dashboard`
2. 汇总指标。
3. 趋势和结构展示。
4. viewer 只读访问验证。

### 5.8 Issue 08

Excel 导入。

交付物：

1. 预览。
2. 异常提示。
3. 确认导入。
4. sheet 去重。

## 6. 测试和验证计划

### 6.1 后端

每个后端 issue 至少包含：

1. `go test` 覆盖新增模块。
2. 直接 API 验证。
3. 权限负例验证。

核心测试用例：

1. 空账本列表。
2. 创建账本和项目。
3. 草稿批次保存和读取。
4. 从上一确认批次带入上期值。
5. 债务账户按负数参与平账。
6. 主账户未知收入/支出。
7. 投资盈利和年化变化率。
8. 资产负债率。
9. 已确认批次不能被普通更新。
10. viewer 不能访问配置和批次接口。

### 6.2 前端

每个前端 issue 至少包含：

1. `npm run build`。
2. 正常用户流交互验证。
3. 相邻非目标路径回归验证。
4. 截图证据覆盖变更区域和附近非目标区域。

核心交互路径：

1. admin 登录后进入 `/money`。
2. 创建账本并配置项目。
3. 创建草稿批次并保存。
4. 计算并确认批次。
5. 查看历史批次。
6. 授权 viewer 后只读查看看板。

## 7. 数据迁移和兼容

第一阶段没有线上旧数据迁移，属于新存储结构。

兼容策略：

1. 所有核心持久化结构带 `schemaVersion`。
2. 读取时允许缺省字段使用安全默认值。
3. 删除账本第一版使用软删除，避免误删历史。
4. Excel 导入只创建系统内历史批次，导入后看板读取系统批次，不再依赖 Excel。

## 8. 风险和处理

### 8.1 计算口径风险

风险：Excel 原公式和新系统配置口径不一致。

处理：

1. 系统以项目统计标签为准。
2. Excel 导入预览阶段展示公式值和系统重算值差异。
3. 对账页显示计算明细。

### 8.2 权限泄露风险

风险：普通 viewer 看到配置、批次或平账建议。

处理：

1. 后端所有非看板接口强制 admin。
2. `dashboard/get` 不返回平账建议。
3. 前端 viewer 只渲染看板入口。

### 8.3 金额精度风险

风险：金额使用浮点导致汇总误差。

处理：

1. 持久化金额统一使用 `int64` 分。
2. 比例计算才使用 `float64`。

### 8.4 批次历史失真风险

风险：项目改名或禁用后，历史批次展示变化。

处理：

1. 批次 entry 保存项目名称和类型快照。
2. 历史详情优先展示快照。

## 9. 待确认默认决策

如果没有进一步产品确认，第一版按以下默认值执行：

1. 模块名使用“家庭账本”。
2. 普通看板用户只看汇总和趋势，不看项目明细。
3. 固定资产默认不计入投资盈利，只影响净资产。
4. 外币和虚拟币是否计入投资盈利由统计标签决定，默认不强制计入。
5. 已确认批次不允许修改。
6. Excel 导入差异以系统重算值为准，Excel 值作为预览差异提示。

