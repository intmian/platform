# Issue 02: 管理员账本和项目配置

## 阶段

第一部分：账目管理和对账

## 目标

管理员可以在前端创建和维护家庭账本、账本项目、主平账账户和项目统计口径。

## 范围

1. 后端接口：
   - `POST /misc/money/book/list`
   - `POST /misc/money/book/create`
   - `POST /misc/money/book/update`
   - `POST /misc/money/book/delete`
   - `POST /misc/money/item/list`
   - `POST /misc/money/item/update`
2. 前端路由：
   - `/money`
   - `/money/:bookId/config`
3. 支持配置项目类型：
   - `cash_account`
   - `debt_account`
   - `investment`
   - `foreign_cash`
   - `foreign_exchange`
   - `crypto`
   - `fixed_asset`
   - `liability`
   - `receivable`
4. 支持配置统计标签：
   - 是否参与平账
   - 是否计入现金
   - 是否计入投资盈利
   - 是否计入净资产
   - 是否计入负债
5. 支持设置主平账账户。

## 非目标

1. 不做对账批次录入。
2. 不做看板展示。
3. 不做普通用户授权入口。

## 权限

1. 仅 `admin` 可以访问配置接口。
2. 非 `admin` 访问时返回 `no permission`。

## 验收标准

1. 管理员可以创建账本。
2. 管理员可以新增、编辑、禁用、排序项目。
3. 管理员可以设置主平账账户。
4. 统计标签保存后刷新页面仍然保留。
5. 非管理员不能调用配置接口。
6. 前端完成正常配置流程交互验证。

## 依赖

1. `01-backend-data-model-and-storage.md`

## 后续 issue

1. `03-reconciliation-batch-entry.md`

