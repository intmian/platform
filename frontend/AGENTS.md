# 前端

- 请求统一走 `/api` 前缀（`src/config.json`），本地由 Vite 代理到 `127.0.0.1:8080` 并去掉 `/api`；`/share-link/*` 也代理到后端。后端接口几乎都是 JSON `POST`，读也一样；返回 `code=0` 表示成功，数据在 `data`。健康检查是 `POST /api/check`，不是 GET。
- 本地访问用 `localhost:5173`，Vite 可能只绑了 `::1`，`127.0.0.1:5173` 不一定能连上。
- 登录是 cookie，前端不碰 token。页面级登录门禁用 `useLoginGate`；页面已经用了它时，局部的 `User` 组件要传 `autoOpenLoginPanel={false}`，否则会重复弹登录框。
- 先复用再造轮子：
  - `common/UniConfig` + `ConfigsCtr`：通用配置表单；
  - `common/aiGateway.ts`（`sendAiAction`、`transcribeAudio`）：AI 调用一律走它，后端按 action 白名单处理；
  - `common/WhisperButton` + `useAudioRecorder`：语音输入；
  - `appendNoCacheParam`（`todone/Library.tsx`）：给远程图片加 `__cf_bust`，绕开 CDN 旧缓存的 CORS 问题。
- 颜色用 antd theme token，不写死色值。新页面在不破坏现有风格的前提下可以有自己的设计。
- `src/debug/debug.jsx` 是开发用的组件试验场，可以在里面挂一个组件单独调交互，不需要登录和真实数据。
- Note Mini 已经迁到独立项目 `memos-mian`，这里不再有入口。`FlagNote = 2` 保留不复用；R2 上传、AI、语音这些共享能力和历史文件链接都要保留。
