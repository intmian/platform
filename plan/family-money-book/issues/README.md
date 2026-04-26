# Family Money Book Issues

这个目录把 `product-plan.md` 拆成可逐个交付的需求 issue。执行时建议一次只拿一个 issue，完成后再进入下一个。

## 执行顺序

### 第一部分：账目管理和对账

1. `01-backend-data-model-and-storage.md`
   建立后端数据模型、存储结构和基础计算入口。
2. `02-admin-book-and-item-config.md`
   管理员账本配置、项目配置、统计口径配置。
3. `03-reconciliation-batch-entry.md`
   对账批次创建、从上一期带入、草稿录入。
4. `04-reconciliation-compute-and-confirm.md`
   平账建议、投资盈利、资产负债汇总计算和确认。
5. `05-history-batches-and-locking.md`
   历史批次列表、详情、复制新草稿和已确认锁定。

### 第二部分：数据看板

6. `06-dashboard-acl-and-readonly-api.md`
   看板 ACL、只读接口和普通用户访问边界。
7. `07-dashboard-ui-and-trends.md`
   看板指标、结构图、历史趋势和大事记展示。

### 后续迁移能力

8. `08-excel-import-preview-and-confirm.md`
   Excel 历史导入预览、确认和去重。

## 暂不进入实现的内容

1. 图片 OCR。
2. 自动写入随手记。
3. 银行、支付宝、微信自动同步。
4. Excel 作为日常记账方式。

