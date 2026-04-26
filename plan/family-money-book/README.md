# Family Money Book Plan

这个目录用于集中管理家庭账本迁移计划。

当前文档：

1. `product-plan.md`
   家庭账本的产品需求、设计草案、实现状态、AI 上下文和迁移注意事项。
2. `technical-design.md`
   家庭账本的前后端技术方案，定义后端存储、接口、权限、计算、前端路由、页面和验证计划。
3. `issues/`
   从产品计划拆出来的可执行需求 issue，按“账目管理和对账”优先、“数据看板”随后、“Excel 历史导入”最后的顺序组织。

说明：

1. 当前阶段先固化需求和口径，不直接进入实现。
2. 后续实现时一次只取一个 `issues/` 下的需求，完成后再进入下一个。
3. 后续前端组件、后端 misc 接口、Excel 历史导入、数据结构、验收清单都继续补充到本目录。
4. 原始流程来自 `C:/GITHUB/MonthMoney/main.py`、`C:/GITHUB/MonthMoney/setting.json` 和 `C:/Users/Admin/Downloads/家庭账户.xlsx`。
