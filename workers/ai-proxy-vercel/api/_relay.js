// HTTP 和 WebSocket 两个入口共用的规则：地址怎么拆、口令怎么校验、哪些上游放行、哪些请求头不转。
// 文件名以下划线开头，Vercel 不会把它当成单独的函数。

import { timingSafeEqual } from "node:crypto";

export const ALLOWED_HOSTS = new Set([
  "api.openai.com",
  "openrouter.ai",
  "api.deepseek.com",
  "dashscope.aliyuncs.com",
  "generativelanguage.googleapis.com",
  "api.anthropic.com",
  "api.x.ai",
]);

// 这些头带有调用方的来源信息或只对这一跳有意义，不转给上游。
const DROP_HEADERS = new Set(["host", "connection", "content-length", "accept-encoding", "forwarded", "x-real-ip"]);
const DROP_PREFIXES = ["x-forwarded-", "x-vercel-", "cf-"];

export function tokenMatches(given) {
  const expected = process.env.RELAY_TOKEN || "";
  if (!expected || !given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function isAllowedHost(host) {
  return Boolean(host) && ALLOWED_HOSTS.has(host.toLowerCase());
}

// 拆出 /<口令>/<上游域名>/<原路径>?<查询>。
// vercel.json 把所有路径改写到函数，原路径放在 __path 参数里；如果平台直接给了原始地址，就用原始地址。
export function parseRelayPath(url) {
  const query = new URLSearchParams(url.search);
  let path = url.pathname;
  if (path.startsWith("/api/")) {
    path = "/" + (query.get("__path") || "");
  }
  query.delete("__path");
  const search = query.toString();
  const [token, host, ...rest] = path.split("/").slice(1);
  return { token, host, path: rest.join("/"), search: search ? `?${search}` : "" };
}

// 按规则过滤请求头。extraDrop 是调用方额外要去掉的头（小写）。
export function forwardHeaders(entries, extraDrop = []) {
  const out = {};
  for (const [name, value] of entries) {
    const lower = name.toLowerCase();
    if (DROP_HEADERS.has(lower) || extraDrop.includes(lower)) continue;
    if (DROP_PREFIXES.some((p) => lower.startsWith(p))) continue;
    out[lower] = Array.isArray(value) ? value.join(", ") : value;
  }
  return out;
}

export async function where() {
  const trace = await (await fetch("https://www.cloudflare.com/cdn-cgi/trace")).text();
  const pick = (key) => (trace.match(new RegExp(`^${key}=(.*)$`, "m")) || [])[1];
  return { region: process.env.VERCEL_REGION, egressColo: pick("colo"), egressLoc: pick("loc") };
}
