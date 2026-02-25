# Shared Reusable Tools And Flows

Last verified: 2026-02-25

## Format

1. 工具类：`名字: 用处或能解决什么问题`
2. 流程/故障类：`常见问题: 简述解决方案`
3. 保持一行，避免展开细节。

## Catalog

1. `useLoginGate`: 页面级登录门禁；未登录时自动弹登录，不依赖某个组件是否被渲染，可避免移动端漏弹窗问题。
2. `常见问题-登录弹窗重复`: 页面已使用 `useLoginGate` 时，局部 `User` 入口应关闭自动弹窗，只保留手动登录按钮。
