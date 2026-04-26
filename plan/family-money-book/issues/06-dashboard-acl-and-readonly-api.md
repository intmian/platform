# Issue 06: 看板 ACL 和只读接口

## 阶段

第二部分：数据看板

## 目标

管理员可以给其他 platform 账户授权账本看板只读权限；普通授权用户只能访问看板数据，不能访问配置、对账过程和平账建议。

## 范围

1. 后端接口：
   - `POST /misc/money/book/grant-dashboard`
   - `POST /misc/money/dashboard/get`
2. 看板 ACL 保存到 `MoneyBook.viewerUsers` 或等价存储。
3. `dashboard/get` 按当前登录用户校验：
   - `admin` 可访问全部账本看板。
   - `viewerUsers` 中的用户可访问对应账本看板。
   - 其他用户返回 `no permission`。
4. 看板接口只返回允许公开的汇总和趋势数据。

## 非目标

1. 不做看板 UI 图表。
2. 不暴露账本配置页面给普通用户。
3. 不暴露对账录入过程。
4. 不暴露平账建议明细。

## 权限边界

普通看板用户不能访问：

1. `book/*`
2. `item/*`
3. `batch/*`
4. `import/*`

普通看板用户只能访问：

1. `dashboard/get`

## 验收标准

1. 管理员可以新增、移除看板用户。
2. 授权用户可以调用 `dashboard/get`。
3. 未授权用户调用 `dashboard/get` 返回 `no permission`。
4. 授权用户调用配置、批次、导入接口返回 `no permission`。
5. `dashboard/get` 返回数据中不包含平账建议明细。
6. 后端测试覆盖 admin、viewer、unauthorized 三类用户。

## 依赖

1. `05-history-batches-and-locking.md`

## 后续 issue

1. `07-dashboard-ui-and-trends.md`

