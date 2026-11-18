// AI 请求转发 Worker。
//
// 用途：生产服务器在香港，OpenAI 等服务不对香港开放。普通 Worker 在离调用方最近的机房执行，
// 所以真正访问上游的是一个创建在美国西部的 Durable Object：它的位置固定，不随入口机房变化。
//
// 地址格式：https://<worker>/<上游域名>/<原路径>
//   例：https://<worker>/api.openai.com/v1/responses → https://api.openai.com/v1/responses
// 后端在供应商上配置"转发地址"后，会自动把 baseURL 改写成这种格式。
//
// 不做鉴权：上游的 key 由调用方随请求带来，Worker 不存任何密钥。
// 为了不变成谁都能用的公开代理，只放行 ALLOWED_HOSTS 里的上游。

import {DurableObject} from "cloudflare:workers";

const RELAY_LOCATION = "wnam";

const ALLOWED_HOSTS = new Set([
  "api.openai.com",
  "openrouter.ai",
  "api.deepseek.com",
  "dashscope.aliyuncs.com",
  "generativelanguage.googleapis.com",
  "api.anthropic.com",
  "api.x.ai",
]);

// 这些头是 Cloudflare 或客户端附带的来源信息，不转给上游。
const DROP_HEADERS = ["host", "cf-connecting-ip", "cf-ipcountry", "cf-ray", "cf-visitor", "x-forwarded-for", "x-forwarded-proto", "x-real-ip"];

function jsonError(status, message) {
  return Response.json({ error: { message } }, { status });
}

// 实际访问上游的中转对象。body 以流的形式原样转发，响应也原样返回，所以流式输出（SSE）不受影响。
export class UpstreamRelay extends DurableObject {
  async fetch(request) {
    const url = new URL(request.url);

    // 诊断：看实际从哪里出口。
    if (url.pathname === "/__where") {
      const trace = await (await fetch("https://www.cloudflare.com/cdn-cgi/trace")).text();
      const pick = (key) => (trace.match(new RegExp(`^${key}=(.*)$`, "m")) || [])[1];
      return Response.json({ relay: RELAY_LOCATION, egressColo: pick("colo"), egressLoc: pick("loc") });
    }

    // pathname 形如 /api.openai.com/v1/responses：第一段是上游域名，其余是原路径。
    const [, host, ...rest] = url.pathname.split("/");
    const upstream = `https://${host}/${rest.join("/")}${url.search}`;

    const headers = new Headers(request.headers);
    for (const name of DROP_HEADERS) headers.delete(name);

    return fetch(upstream, {
      method: request.method,
      headers,
      body: request.method === "GET" || request.method === "HEAD" ? undefined : request.body,
      redirect: "manual",
    });
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname !== "/__where") {
      const host = url.pathname.split("/")[1];
      if (!host || !ALLOWED_HOSTS.has(host.toLowerCase())) {
        return jsonError(403, `upstream host not allowed: ${host || "(empty)"}`);
      }
    }
    // locationHint 只在对象第一次创建时生效，之后这个名字的对象一直留在那里。
    const id = env.UPSTREAM_RELAY.idFromName(RELAY_LOCATION);
    return env.UPSTREAM_RELAY.get(id, { locationHint: RELAY_LOCATION }).fetch(request);
  },
};
