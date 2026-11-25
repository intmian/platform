// AI 请求转发函数，部署在 Vercel 新加坡（sin1）。普通 HTTP 和 WebSocket 都由这一个函数处理。
//
// 用途：生产服务器在香港，OpenAI 等服务不对香港开放。Cloudflare Worker 会把调用方地区带给上游，
// 所以改用 Vercel：函数固定在 AWS 新加坡执行，上游看到的是新加坡的出口 IP。
//
// 地址格式：https://<部署域名>/<RELAY_TOKEN>/<上游域名>/<原路径>（WebSocket 把 https 换成 wss）
//   例：https://<域名>/<口令>/api.openai.com/v1/responses → https://api.openai.com/v1/responses
// 后端供应商的"转发地址"填 https://<域名>/<口令>，后端会自动拼成上面的格式（RewriteURLForAIProxy）。
//
// 上游的 key 由调用方随请求带来，函数不存上游密钥。
// 路径第一段必须等于 Vercel 环境变量 RELAY_TOKEN（没配就全部拒绝），上游还要在白名单里，规则见 _relay.js。
//
// 为什么用 Node 的 http.Server 而不是 fetch 处理函数：Vercel 只有这种写法能接 WebSocket；
// vercel.json 按 Upgrade 头把请求分到两个函数的规则实测不生效，所以合成一个。
// Vercel 免费套餐单次函数最长 300 秒，到点连接会被断开（流式输出、WebSocket 都算），调用方要自己处理。

import http from "node:http";
import { Readable } from "node:stream";
import WebSocket, { WebSocketServer } from "ws";
import { forwardHeaders, isAllowedHost, parseRelayPath, tokenMatches, where } from "./_relay.js";

const UPSTREAM_HANDSHAKE_TIMEOUT_MS = 15000;

// WebSocket 握手相关的头由 ws 库自己生成，不能照抄调用方的。子协议单独传给 ws 库。
const HANDSHAKE_HEADERS = ["upgrade", "sec-websocket-key", "sec-websocket-version", "sec-websocket-extensions", "sec-websocket-protocol"];

// Node 的 fetch 会自动解压响应，但保留 content-encoding 头；原样返回会让调用方再解压一次而报错。
// 请求时已经要求上游不压缩，这里再兜底删掉。
const DROP_RESPONSE_HEADERS = new Set(["content-encoding", "content-length", "transfer-encoding", "connection", "keep-alive"]);

function jsonBody(message) {
  return JSON.stringify({ error: { message } });
}

// 校验口令和白名单。不通过时返回 [状态码, 响应体]，通过时返回拆好的地址。
function checkRequest(req) {
  const parsed = parseRelayPath(new URL(req.url, "http://relay"));
  // 口令不对时假装不存在，不透露这里是转发服务。
  if (!tokenMatches(parsed.token)) return { reject: [404, jsonBody("not found")] };
  if (parsed.host === "__where") return { parsed };
  if (!isAllowedHost(parsed.host)) return { reject: [403, jsonBody(`upstream host not allowed: ${parsed.host || "(empty)"}`)] };
  return { parsed };
}

// ---------- 普通 HTTP ----------

async function handleHttp(req, res) {
  const { reject, parsed } = checkRequest(req);
  if (reject) {
    res.writeHead(reject[0], { "content-type": "application/json" });
    return res.end(reject[1]);
  }
  if (parsed.host === "__where") {
    res.writeHead(200, { "content-type": "application/json" });
    return res.end(JSON.stringify(await where()));
  }

  const headers = forwardHeaders(Object.entries(req.headers));
  headers["accept-encoding"] = "identity";
  const hasBody = req.method !== "GET" && req.method !== "HEAD";

  // 调用方断开时取消上游请求，免得上游继续生成、白白计费。
  const abort = new AbortController();
  res.on("close", () => {
    if (!res.writableFinished) abort.abort();
  });

  const upstream = await fetch(`https://${parsed.host}/${parsed.path}${parsed.search}`, {
    method: req.method,
    headers,
    // 请求体以流的形式转发；Node 的 fetch 要求流式请求体声明 duplex。
    body: hasBody ? Readable.toWeb(req) : undefined,
    duplex: hasBody ? "half" : undefined,
    redirect: "manual",
    signal: abort.signal,
  });

  const responseHeaders = {};
  upstream.headers.forEach((value, name) => {
    if (!DROP_RESPONSE_HEADERS.has(name)) responseHeaders[name] = value;
  });
  res.writeHead(upstream.status, upstream.statusText, responseHeaders);
  if (!upstream.body) return res.end();
  // 响应体边收边写，流式输出（SSE）不受影响。
  Readable.fromWeb(upstream.body).on("error", () => res.destroy()).pipe(res);
}

// ---------- WebSocket ----------

const wss = new WebSocketServer({ noServer: true });

// 在还没升级的原始连接上直接回一个 HTTP 错误。
function rejectUpgrade(socket, status, body, contentType = "application/json") {
  if (socket.destroyed) return;
  const payload = Buffer.from(body);
  const header =
    `HTTP/1.1 ${status} ${http.STATUS_CODES[status] || ""}\r\n` +
    `content-type: ${contentType}\r\ncontent-length: ${payload.length}\r\nconnection: close\r\n\r\n`;
  // 等数据写完再断开，立刻 destroy 会把响应体截掉。
  socket.end(Buffer.concat([Buffer.from(header), payload]), () => socket.destroy());
}

// 关闭码只有一部分能主动发送，其余（如 1005、1006）换成 1000 或 1011。
function sendableCloseCode(code) {
  if (code === 1000 || (code >= 1001 && code <= 1003) || (code >= 1007 && code <= 1014) || (code >= 3000 && code <= 4999)) {
    return code;
  }
  return code === 1005 ? 1000 : 1011;
}

// 两边的消息原样互转（文本还是文本，二进制还是二进制），一边关了另一边跟着关。
function pipeSockets(client, upstream) {
  const forward = (from, to) => {
    from.on("message", (data, isBinary) => {
      if (to.readyState === WebSocket.OPEN) to.send(data, { binary: isBinary });
    });
    from.on("close", (code, reason) => {
      if (to.readyState === WebSocket.OPEN || to.readyState === WebSocket.CONNECTING) {
        to.close(sendableCloseCode(code), reason);
      }
    });
    from.on("error", () => to.terminate());
  };
  forward(client, upstream);
  forward(upstream, client);
}

// 先连上游，上游握手成功后才接受调用方的连接。上游握手失败时，把上游的状态码和响应体原样回给调用方，
// 方便后端看到真实原因（比如 401、403）。
function handleUpgrade(req, socket, head) {
  const { reject, parsed } = checkRequest(req);
  if (reject) return rejectUpgrade(socket, reject[0], reject[1]);
  if (parsed.host === "__where") return rejectUpgrade(socket, 400, jsonBody("use plain HTTP for __where"));

  const protocols = (req.headers["sec-websocket-protocol"] || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const upstream = new WebSocket(`wss://${parsed.host}/${parsed.path}${parsed.search}`, protocols, {
    headers: forwardHeaders(Object.entries(req.headers), HANDSHAKE_HEADERS),
    handshakeTimeout: UPSTREAM_HANDSHAKE_TIMEOUT_MS,
  });

  let settled = false;
  upstream.once("open", () => {
    settled = true;
    wss.handleUpgrade(req, socket, head, (client) => pipeSockets(client, upstream));
  });
  upstream.once("unexpected-response", (_request, response) => {
    settled = true;
    const chunks = [];
    response.on("data", (chunk) => chunks.push(chunk));
    response.on("end", () => {
      rejectUpgrade(socket, response.statusCode || 502, Buffer.concat(chunks).toString(), response.headers["content-type"] || "text/plain");
    });
    response.on("error", () => rejectUpgrade(socket, 502, jsonBody("upstream handshake failed")));
  });
  upstream.once("error", (err) => {
    if (settled) return;
    settled = true;
    rejectUpgrade(socket, 502, jsonBody(`upstream connect failed: ${err?.message || err}`));
  });
  // 调用方在上游握手完成前就断了，上游也不用连了。
  socket.once("close", () => {
    if (!settled) upstream.terminate();
  });
}

// ---------- 入口 ----------

const server = http.createServer((req, res) => {
  handleHttp(req, res).catch((err) => {
    if (!res.headersSent) {
      res.writeHead(502, { "content-type": "application/json" });
      res.end(jsonBody(`relay failed: ${err?.message || err}`));
    } else {
      res.destroy();
    }
  });
});
server.on("upgrade", (req, socket, head) => {
  try {
    handleUpgrade(req, socket, head);
  } catch (err) {
    rejectUpgrade(socket, 502, jsonBody(`relay failed: ${err?.message || err}`));
  }
});

export default server;
