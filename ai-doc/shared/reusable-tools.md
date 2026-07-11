# Shared Reusable Tools And Flows

Last verified: 2026-07-11

## Format

1. 工具类：`名字: 用处或能解决什么问题`
2. 流程/故障类：`常见问题: 简述解决方案`
3. 保持一行，避免展开细节。

## Catalog

1. `useLoginGate`: 页面级登录门禁；未登录时自动弹登录，不依赖某个组件是否被渲染，可避免移动端漏弹窗问题。
2. `常见问题-登录弹窗重复`: 页面已使用 `useLoginGate` 时，局部 `User` 入口应关闭自动弹窗，只保留手动登录按钮。
3. `prepareLibraryCoverFiles` + `prepareLibraryCoverFilesFromCenterCrop`: 可复用的 2:3 裁剪三图产物流程（original/detail/preview）；支持交互裁剪和中心裁剪（兼容补图）。
4. `appendNoCacheParam`: 为远程图片 URL 追加 `__cf_bust` 随机参数，配合 `fetch cache: no-store` 缓解 CDN 旧缓存对象的 CORS 头不一致。
5. `.agents/skills/platform-*`: 仓库级开发、测试、调试、知识维护入口；各 skill 只加载对应短规范和任务相关领域文档。
6. `UniConfig` + `ConfigsCtr`: 通用配置表单/缓存容器；支持按 key 分组复用、机密字段 password 显示、slice 值折叠摘要、拖拽排序和右侧删除操作。
7. `#ignoreDeploy`: 推送到 `master` 的提交消息包含该标记时，`.github/workflows/deploy.yml` 的前端构建、后端构建和部署 job 会跳过。
8. `sendAiAction` + `POST /misc/ai/run`: 前后端类型化 AI Gateway；前端只传固定 action enum 和结构化 payload，后端按 action 白名单绑定权限、prompt 和响应结构。
9. `transcribeAudio` + `POST /misc/ai/transcribe`: 通用音频转写入口；前端只上传音频和可选 language/prompt，后端从 `PLAT.openai.audio.model` 选择模型。
10. `useAudioRecorder`: 通用浏览器录音 hook；只负责 MediaRecorder 生命周期、时长、Blob 输出和麦克风释放，不绑定业务回填。
11. `WhisperButton`: 通用语音输入按钮；单击录音/停止转写，长按打开 language/prompt 本地记忆设置，业务侧通过 `onText` 接收文本。
12. `docs/plan/d1-gorm/benchmarks/d1-gorm-adapter-baseline` + wrapper scripts: D1/GORM 重构前 baseline；独立 Go 项目单测原 fork adapter，platform-integration 脚本才读取 backend 测试运行配置并输出 todone SQL 分位数。
13. `C:\GITHUB\gorm-d1-adapter\scripts\benchmark-v2.ps1` + `cmd/d1bench`: 新 adapter 的 REST/Worker 双模式验证与性能报告入口；不读取 platform 业务配置，输出 p50/p95/p99、失败率和 D1 meta。
