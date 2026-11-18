# ai-proxy Worker（已下线）

原本用来让香港服务器经 Cloudflare 访问 OpenAI 官方接口。2026-11 已关闭公网入口（`workers_dev = false`），Worker 和代码保留。

- 下线原因：Worker 向 OpenAI 发请求时，OpenAI 看到的地区跟随最初的调用方。香港服务器实测 `egressColo` 是 LAX，但 `egressLoc` 仍是 HK，请求返回 403 `unsupported_country_region_territory`。`placement.region`、Durable Object 的 `locationHint`、AI Gateway 都解决不了。
- 香港不在 OpenAI 支持的地区内，用别的出口绕过限制可能导致账号被封，不要这样做。
- 恢复入口：把 `wrangler.toml` 的 `workers_dev` 改回 `true`，在本目录执行 `npx wrangler@4.110.0 deploy --config wrangler.toml`。
