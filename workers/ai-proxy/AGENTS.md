# ai-proxy Worker

生产服务器在香港，OpenAI 不对香港开放（返回 `unsupported_country_region_territory`）。这个 Worker 固定在新加坡运行，后端的 AI 请求经它出去。

- 用法：在管理后台的 AI 供应商上填"转发地址"（Worker 根地址），后端会把 `https://api.openai.com/v1` 改写成 `<转发地址>/api.openai.com/v1`。语音实时转写（DashScope WebSocket）不走转发。
- 不鉴权：key 由后端随请求带来，Worker 不存密钥；只放行 `worker.js` 里 `ALLOWED_HOSTS` 列出的上游，新增上游要改这里再部署。
- 靠 `placement.region` 固定位置（已实测有效）。社区反馈 Smart Placement 不行；AI Gateway 在离调用方最近的机房执行，从香港调用照样会被拒，不能单独解决这个问题。
- 部署（手动，不在 CI 里）：在本目录执行 `npx wrangler@4.110.0 deploy --config wrangler.toml`。需要先 `wrangler login`。
- 验证：`curl <转发地址>/__where` 应返回 `egressLoc: "SG"`；响应头里有 `cf-placement: remote-SIN`。
