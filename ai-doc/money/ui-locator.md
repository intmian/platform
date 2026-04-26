# Family Money Book UI Locator

Last verified: 2026-04-26

## Routes

1. `/money`: book list and JSON import/export/delete entry.
2. `/money/:bookId/config`: book metadata, item definitions, primary balance account, viewer list.
3. `/money/:bookId/reconcile/:recordId`: record entry, compute/confirm, balance suggestions, summary, events.
4. `/money/:bookId/history`: record history and copy-draft flow.
5. `/money/:bookId/dashboard`: viewer-safe dashboard.
6. `/money/:bookId/import`: Excel preview/confirm flow.

## Stable Text Anchors

1. Book list:
   - `家庭账本`
   - `导入JSON`
   - `导出JSON`
   - `删除账本`
2. Config:
   - `账本配置`
   - `主平账账户`
   - `项目配置`
   - `看板授权用户`
   - `配置尚未保存`
3. Reconcile:
   - `对账记录`
   - `录入明细`
   - `同实际值`
   - `不参与平账`
   - `平账建议`
   - `大事记`
4. History:
   - `历史记录`
   - `新建草稿`
   - `复制草稿`
5. Dashboard:
   - `当前净资产`
   - `历史趋势`
   - `资产结构`
   - `负债结构`
6. Excel import:
   - `Excel 历史导入`
   - `先预览识别结果`

## Interaction Notes

1. Ant Design may insert spacing in two-character Chinese button labels; prefer anchors with longer labels such as `上移一位` and `下移一位`.
2. Hidden desktop tables can still exist on mobile; for mobile assertions prefer visible body text or scoped visible locators instead of the first text match.
3. JSON file import uses a hidden file input triggered by the `导入JSON` button.
