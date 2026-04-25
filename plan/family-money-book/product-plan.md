# Family Money Book Product Plan

## 1. 背景

当前家庭账本流程由两部分组成：

1. `MonthMoney` 自动对账脚本用于个人账户平账。
2. `家庭账户.xlsx` 用于记录家庭账户、投资、外汇、资产、债务、债权，并计算净资产、负债率、投资盈利等看板指标。

目标是在 platform 中新增一个家庭账本模块，迁移这套流程。第一阶段先实现手动录入、自动计算和权限控制；图片识别暂不实现。

## 2. 产品目标

1. 管理员可以配置一个或多个账本。
2. 管理员可以发起对账批次，录入账面值和实际值。
3. 系统自动生成平账建议，但不自动写入随手记。
4. 系统自动计算投资盈利、资产负债、净资产变化、负债率等指标。
5. 管理员可以给其他账户分配看板只读权限。
6. 普通授权用户只能查看看板，不能看到配置、对账过程和平账建议。
7. 管理员可以导入 `家庭账户.xlsx` 作为历史批次数据，用于迁移既有记录和初始化趋势。

## 3. 用户与权限

### 3.1 管理员

管理员可以：

1. 创建、编辑、删除账本。
2. 配置账户、投资、外汇、资产、债务、债权项目。
3. 发起、编辑、确认对账批次。
4. 查看平账建议和计算明细。
5. 给其他 platform 账户授权看板只读权限。

### 3.2 看板用户

看板用户可以：

1. 查看被授权账本的只读看板。
2. 查看管理员允许公开的汇总指标和趋势。

看板用户不能：

1. 查看账本配置。
2. 查看对账录入过程。
3. 查看平账建议明细。
4. 修改任何数据。

### 3.3 权限设计建议

1. platform 继续使用现有 cookie 登录态和 `valid.User`。
2. admin 自动拥有全部家庭账本权限。
3. 家庭账本模块内部维护看板 ACL：`bookId -> viewerUsers[]`。
4. 普通用户访问看板时，后端按 `valid.User` 校验是否在账本 ACL 中。

## 4. 概念模型

### 4.1 账本 `MoneyBook`

字段建议：

1. `id`
2. `name`
3. `primaryBalanceAccountId`
4. `enabled`
5. `viewerUsers`
6. `createdAt`
7. `updatedAt`

### 4.2 账本项目 `MoneyItem`

字段建议：

1. `id`
2. `bookId`
3. `name`
4. `type`
5. `enabled`
6. `sort`
7. `includeInReconcile`
8. `includeInCash`
9. `includeInInvestmentProfit`
10. `includeInNetAsset`
11. `includeInLiability`
12. `note`

项目类型建议：

1. `cash_account`：现金或支付账户，例如支付宝、微信、银行卡。
2. `debt_account`：参与个人对账的负债账户，例如信用卡。
3. `investment`：理财、基金等。
4. `foreign_cash`：外币现钞。
5. `foreign_exchange`：外币现汇。
6. `crypto`：虚拟币。
7. `fixed_asset`：房产、汽车、公积金等。
8. `liability`：车贷、商贷、公积金贷款等。
9. `receivable`：押金、债权等。

### 4.3 对账批次 `ReconciliationBatch`

字段建议：

1. `id`
2. `bookId`
3. `date`
4. `status`：`draft` / `confirmed`
5. `intervalDays`
6. `entries`
7. `balanceSuggestions`
8. `summary`
9. `events`
10. `createdBy`
11. `confirmedBy`
12. `createdAt`
13. `confirmedAt`

## 5. 功能需求

### 5.1 账本配置

管理员可以配置：

1. 账本名称。
2. 主平账账户。
3. 账户项目。
4. 投资项目。
5. 外汇项目。
6. 固定资产项目。
7. 债务项目。
8. 债权项目。
9. 看板授权用户。

配置时必须显式表达统计口径，不能依赖 Excel 固定行号。

### 5.2 对账录入

管理员创建新批次时，系统默认从上一确认批次带入上期值。

录入内容：

1. 平账账户的账面值。
2. 平账账户的实际值。
3. 投资、外汇、资产、债务、债权的当期值。
4. 记账间隔天数。
5. 大事记。

图片 OCR 暂不实现；所有值由管理员手动录入。

### 5.3 平账建议

平账建议来自原 `MonthMoney/main.py`，只解决账户实际余额和账面余额不一致的问题。

计算规则：

1. 非主账户差额 = 实际值 - 账面值。
2. 债务账户在参与计算时按负数处理。
3. 非主账户差额大于 0：主平账账户转入该账户。
4. 非主账户差额小于 0：该账户转入主平账账户。
5. 根据所有非主账户差额推导主平账账户理论余额。
6. 主账户实际值 - 主账户理论余额小于 0：未知去向支出。
7. 主账户实际值 - 主账户理论余额大于 0：未知来源收入。

页面要求：

1. 平账建议必须独立展示，不能和投资盈利混在一起。
2. 每条建议需要说明来源账户、账面值、实际值和差额。
3. 第一版只展示建议，不自动提交到随手记。

### 5.4 投资盈利计算

投资盈利来自 `家庭账户.xlsx` 的 `资产-投资` 区域，不属于平账建议。

计算规则：

1. 当期变化 = 当期值 - 上期值。
2. 年化变化率 = 当期变化 / 当期值 * 365 / 记账间隔天数。
3. 投资盈利汇总 = 所有 `includeInInvestmentProfit=true` 项目的当期变化之和。

注意：

1. 房产、汽车等固定资产可能有估值变化，但不一定计入投资盈利。
2. 外币、虚拟币可能既是资产又有涨跌，需要通过项目统计标签决定是否计入投资盈利。
3. Excel 历史 sheet 中投资盈利范围并不完全一致，迁移时必须改成配置驱动。

### 5.5 资产负债汇总

核心指标：

1. 现金。
2. 净资产。
3. 负债。
4. 总资产。
5. 净资产变化。
6. 投资盈利。
7. 净资产负债率。
8. 资产负债率。

计算规则建议：

1. 现金 = 所有 `includeInCash=true` 项目的当期值之和。
2. 负债 = 所有 `includeInLiability=true` 项目的当期值之和。
3. 净资产 = 参与净资产统计的正资产之和 - 负债。
4. 总资产 = 净资产 + 负债。
5. 净资产变化 = 本期净资产 - 上一期净资产。
6. 净资产负债率 = 负债 / 净资产。
7. 资产负债率 = 负债 / 总资产。

### 5.6 历史批次

每个确认批次相当于 Excel 中一个日期 sheet。

支持：

1. 查看历史批次列表。
2. 查看历史批次详情。
3. 从上一确认批次复制创建新草稿。
4. 草稿可以继续编辑。
5. 已确认批次默认锁定。

### 5.7 看板

看板展示：

1. 当前净资产。
2. 当前现金。
3. 当前负债。
4. 总资产。
5. 净资产变化。
6. 投资盈利。
7. 净资产负债率。
8. 资产负债率。
9. 资产结构。
10. 负债结构。
11. 历史趋势。
12. 大事记。

看板可见粒度待确认：

1. 汇总看板：只显示总数和趋势。
2. 明细看板：显示项目名称和金额。

### 5.8 Excel 历史导入

管理员可以导入历史 `家庭账户.xlsx`，将已有日期 sheet 转换为系统内的历史确认批次。

导入目标：

1. 保留既有历史净资产、现金、负债、负债率、投资盈利等看板数据。
2. 保留每个历史 sheet 中的资产、投资、外汇、债务、债权明细。
3. 保留大事记。
4. 尽量还原每期的上期值、当期值和当期变化。
5. 导入后系统看板可以直接展示历史趋势，不需要用户从零开始累计。

导入流程建议：

1. 管理员上传或选择 `家庭账户.xlsx`。
2. 后端解析 workbook 和所有日期 sheet。
3. 系统识别每个 sheet 的日期、表格区域、汇总区、资产投资区、债务区、债权区、大事记区。
4. 系统生成导入预览，展示将创建的历史批次、项目映射和无法识别的单元格。
5. 管理员确认后，系统批量创建历史批次并标记为 `confirmed`。
6. 导入完成后，管理员可以进入历史批次逐条校正。

导入映射原则：

1. sheet 名形如 `26-04-06`、`25-12-31`、`25-11-2` 时解析为对账日期。
2. `A:D` 附近的 `现金-汇总` 区域解析为家庭账户账面、实际、平账差额。
3. `A6:E*` 的 `资产-投资` 区域解析为项目上期值、当期值、当期变化、年化变化率。
4. `债务` 区域解析为负债项目和账面值。
5. `债权` 区域解析为债权项目和账面值。
6. `F:J` 汇总区解析为本期现金、净资产、负债、净资产负债率、资产负债率、总资产和净资产变化。
7. `L:P` 的上一期值粘贴区只作为校验辅助，不作为新系统的数据来源。
8. 大事记按文本块导入到批次事件。

导入质量要求：

1. 导入不能静默丢弃无法识别的数据。
2. 导入预览必须列出异常 sheet、异常项目、文本备注和公式解析风险。
3. 导入后的历史批次应保留 `source=excel_import` 和原 sheet 名。
4. 同一个 Excel 文件重复导入时，必须能检测已导入 sheet，避免重复创建历史批次。
5. Excel 导入只负责历史迁移，不作为后续常规记账方式。

## 6. 前端设计草案

路由建议：

1. `/money`：账本列表。
2. `/money/:bookId/config`：账本配置。
3. `/money/:bookId/reconcile/:batchId`：对账批次编辑。
4. `/money/:bookId/history`：历史批次。
5. `/money/:bookId/dashboard`：只读看板。
6. `/money/:bookId/import`：Excel 历史导入。

页面原则：

1. 管理员入口显示配置、对账、历史、看板。
2. 普通授权用户只显示看板。
3. 对账页分区显示“平账建议”和“资产/投资/负债计算”。
4. 关键指标需要展示计算口径或可展开的计算明细。
5. Excel 导入页必须先预览再确认，不能上传后直接写入历史批次。

## 7. 后端设计草案

第一版后端可以放在 platform-owned misc 路由下。

接口建议：

1. `POST /misc/money/book/list`
2. `POST /misc/money/book/create`
3. `POST /misc/money/book/update`
4. `POST /misc/money/book/delete`
5. `POST /misc/money/book/grant-dashboard`
6. `POST /misc/money/item/list`
7. `POST /misc/money/item/update`
8. `POST /misc/money/batch/create`
9. `POST /misc/money/batch/get`
10. `POST /misc/money/batch/update`
11. `POST /misc/money/batch/compute`
12. `POST /misc/money/batch/confirm`
13. `POST /misc/money/batch/list`
14. `POST /misc/money/dashboard/get`
15. `POST /misc/money/import/excel/preview`
16. `POST /misc/money/import/excel/confirm`

权限要求：

1. `book/*`：admin only。
2. `item/*`：admin only。
3. `batch/*`：admin only。
4. `dashboard/get`：admin 或账本 ACL viewer。
5. `import/*`：admin only。

## 8. 已经实现

截至 2026-04-25：

1. 旧流程理解已完成。
2. 已检查 `MonthMoney/main.py` 的平账逻辑。
3. 已确认 `MonthMoney/setting.json` 实际使用 GB18030/GBK 编码，账户为支付宝、微信、招行卡、招行信用卡，主平账账户为支付宝。
4. 已检查 `家庭账户.xlsx` 多个历史 sheet 的表格结构和公式。
5. 已形成本产品需求和设计草案。

尚未实现：

1. platform 前端组件未实现。
2. platform 后端 misc 接口未实现。
3. 数据结构和持久化未实现。
4. 权限 ACL 未实现。
5. 图片识别未实现。
6. Excel 历史导入未实现。

## 9. AI 上下文

本计划来自以下本地文件和运行时检查：

1. `C:/GITHUB/MonthMoney/main.py`
2. `C:/GITHUB/MonthMoney/setting.json`
3. `C:/Users/Admin/Downloads/家庭账户.xlsx`
4. `C:/GITHUB/platform/ai-doc/README.md`
5. `C:/GITHUB/platform/ai-doc/shared/learning-workflow.md`
6. `C:/GITHUB/platform/ai-doc/shared/engineering-workflow.md`
7. `C:/GITHUB/platform/ai-doc/frontend/architecture.md`
8. `C:/GITHUB/platform/ai-doc/backend/architecture.md`
9. `C:/GITHUB/platform/ai-doc/backend/services.md`
10. `C:/GITHUB/platform/ai-doc/backend/gateway-auth.md`
11. `C:/GITHUB/platform/ai-doc/backend/account.md`

已确认的旧流程事实：

1. `main.py` 负责个人账户平账建议。
2. `家庭账户.xlsx` 负责家庭资产、投资盈利、债务、债权、净资产和负债率展示。
3. Excel 最新 sheet 为 `26-04-06`，历史 sheet 包括 `25-12-31`、`25-11-2`、`25-8-2`、`25-6-2`、`25-4-2`。
4. Excel 中右侧 `L:P` 区域是上一期汇总的值粘贴区。
5. Excel 中 `资产-投资` 区域的盈利计算和平账建议不是同一类逻辑。
6. Excel 历史导入是确定需求，导入结果应成为系统内历史批次，而不是让新系统继续依赖 Excel。

## 10. 注意事项

1. 不要把平账建议和投资盈利混为一个功能。
2. 不要照搬 Excel 固定行号；历史 sheet 项目和范围会变化。
3. 不要把 Excel 中手写 `SUM` 的具体单元格范围当成长期数据模型。
4. 每个项目必须通过类型和统计标签表达计算口径。
5. 上一期数据应从上一确认批次读取，不再人工值粘贴。
6. 管理员对账过程和平账建议必须对普通看板用户隐藏。
7. 旧脚本会删除当前目录图片，迁移时不要保留这种隐式破坏性行为。
8. 旧脚本使用 `eval(input)`，迁移时必须使用安全数字解析。
9. `setting.json` 不是 UTF-8，读取旧数据时需要按 GB18030/GBK 处理或先转码。
10. 第一版不做图片 OCR，不做自动写随手记，不做银行/支付宝/微信同步。
11. Excel 导入必须有预览和确认步骤，不能上传后直接落库。
12. Excel 历史 sheet 存在项目名变化、行数变化、公式范围变化，导入逻辑必须以识别结果和人工确认兜底。
13. Excel 中的公式结果可以作为导入值，但系统确认后的批次应使用新系统计算口径重新计算并展示差异。

## 11. 待确认问题

1. 模块中文名使用“家庭账本”“家庭账户”还是其他名称。
2. 普通用户看板是否能看到明细项目和金额。
3. Excel 导入是否需要支持多个文件，还是只支持当前 `家庭账户.xlsx` 的结构。
4. Excel 导入遇到公式结果和系统重算结果不一致时，以 Excel 值为准、系统值为准，还是要求管理员选择。
5. 平账建议是否需要记录“已录入随手记”的状态。
6. 固定资产估值变化是否计入投资盈利，还是只影响净资产。
7. 外币和虚拟币是否默认计入投资盈利。
8. 已确认批次是否允许修改，修改是否需要审计记录。

## 12. 文档状态

状态：初版产品需求与设计草案

更新时间：2026-04-25

适用范围：

1. 家庭账本迁移规划。
2. 后续前端组件拆分。
3. 后续 misc 后端接口设计。
4. 后续验收和测试用例拆分。
