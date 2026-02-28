# Shared Reusable Tools And Flows

Last verified: 2026-02-27

## Format

1. 工具类：`名字: 用处或能解决什么问题`
2. 流程/故障类：`常见问题: 简述解决方案`
3. 保持一行，避免展开细节。

## Catalog

1. `useLoginGate`: 页面级登录门禁；未登录时自动弹登录，不依赖某个组件是否被渲染，可避免移动端漏弹窗问题。
2. `常见问题-登录弹窗重复`: 页面已使用 `useLoginGate` 时，局部 `User` 入口应关闭自动弹窗，只保留手动登录按钮。
3. `prepareLibraryCoverFiles` + `prepareLibraryCoverFilesFromCenterCrop`: 可复用的 2:3 裁剪三图产物流程（original/detail/preview）；支持交互裁剪和中心裁剪（兼容补图）。
4. `appendNoCacheParam`: 为远程图片 URL 追加 `__cf_bust` 随机参数，配合 `fetch cache: no-store` 缓解 CDN 旧缓存对象的 CORS 头不一致。
5. `doc-skill-map`: 统一“任务类型 -> 需加载文档集合”的可复用流程，入口见 `shared/doc-skill-map.md`，用于避免 full-stack 任务只读前端文档。
