# Issue 01: 后端数据模型和存储

## 阶段

第一部分：账目管理和对账

## 目标

在 platform 后端建立家庭账本的基础数据模型、持久化结构和内部管理器，为后续配置、批次、计算、看板提供统一数据来源。

## 范围

1. 新增家庭账本后端模块，建议仍放在 platform-owned `misc` 能力内。
2. 定义并持久化：
   - `MoneyBook`
   - `MoneyItem`
   - `ReconciliationBatch`
   - `ReconciliationEntry`
   - `BalanceSuggestion`
   - `MoneySummary`
3. 使用配置驱动的统计口径，不依赖 Excel 固定行号。
4. 所有金额按安全数字解析和结构化字段保存。
5. 为后续 API 提供内部 CRUD 和 compute 调用能力。

## 非目标

1. 不做前端页面。
2. 不做 Excel 导入。
3. 不做图片 OCR。
4. 不做随手记自动写入。

## 关键字段

`MoneyBook` 至少包含：

1. `id`
2. `name`
3. `primaryBalanceAccountId`
4. `enabled`
5. `viewerUsers`
6. `createdAt`
7. `updatedAt`

`MoneyItem` 至少包含：

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

`ReconciliationBatch` 至少包含：

1. `id`
2. `bookId`
3. `date`
4. `status`
5. `intervalDays`
6. `entries`
7. `balanceSuggestions`
8. `summary`
9. `events`
10. `createdBy`
11. `confirmedBy`
12. `createdAt`
13. `confirmedAt`

## 验收标准

1. 后端可以保存和读取账本、项目、批次。
2. 空数据时接口或内部方法返回空列表，而不是报错。
3. 数据结构能表达现金账户、负债账户、投资、外汇、虚拟币、固定资产、债务、债权。
4. 单元测试覆盖基础保存、读取、更新、删除和空数据场景。
5. `go test` 覆盖新增后端模块。

## 依赖

无。

## 后续 issue

1. `02-admin-book-and-item-config.md`
2. `03-reconciliation-batch-entry.md`
3. `04-reconciliation-compute-and-confirm.md`

