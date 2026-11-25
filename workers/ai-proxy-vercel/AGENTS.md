# ai-proxy-vercel（AI 请求转发，Vercel 新加坡）

替代已下线的 `workers/ai-proxy`：香港服务器经它访问 OpenAI 等不对香港开放的服务。地址格式和旧 Worker 一样，只是前面多一段口令：后端供应商的"转发地址"填 `https://platform-ai-proxy.vercel.app/<口令>`，不用改后端。

- 为什么是 Vercel：Cloudflare 会把调用方地区带给上游（见 `workers/ai-proxy/AGENTS.md`）；Vercel 函数固定在 `sin1`（AWS 新加坡）执行，上游看到的是新加坡。2026-11-25 实测：香港服务器经它调 OpenAI 返回 200，流式正常。
- 口令放在路径第一段，对应 Vercel 环境变量 `RELAY_TOKEN`（Secret 类型，存进去就读不回来）。口令本身另存在作者本机 `~/.config/platform/ai-proxy-token`，生产配置的转发地址里也有。口令不对一律返回 404。
- 换口令要先 `vercel env rm`，CLI 要求人工确认（`--yes` 不算），得先问我。
- 部署：本目录执行 `vercel deploy --prod --yes`（Vercel 项目 `platform-ai-proxy`，Hobby 套餐）。新机器先 `vercel link --project platform-ai-proxy`。
- 查出口：`curl https://platform-ai-proxy.vercel.app/<口令>/__where`，应为 `region=sin1`、`egressLoc=SG`。
- 同时支持 WebSocket（OpenAI 实时转写用），地址同样格式、`https` 换成 `wss`。HTTP 和 WebSocket 都在 `api/index.js` 一个函数里：`vercel.json` 用 `has` 按 `Upgrade` 头分到两个函数的写法实测不生效，请求总落到 HTTP 那个。
- Hobby 限制：单次请求最长 300 秒，流式输出和 WebSocket 都算，到点直接断。实时转写断开时前端会按已定稿句子的结束时间把剩余音频续到新连接，所以超过 5 分钟的录音也能接上（没实测过整 5 分钟的断线）。请求体上限 4.5MB，大音频文件转写别走这里。
