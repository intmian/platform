// Platform 的 Service Worker。只做两件事：
// 1. 页面（index.html）网络优先：能连上就用最新的，1.5 秒连不上或断网时用缓存，冷启动不白屏；
// 2. /assets/ 下带 hash 的文件缓存优先：文件名变了就是新文件，旧的永远不会变。
// 接口（/api/）和其他请求一律不碰。
const SHELL = "pf-shell-v1";
const ASSETS = "pf-assets-v1";
const ASSET_LIMIT = 150;

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
    event.waitUntil((async () => {
        const keep = new Set([SHELL, ASSETS]);
        for (const key of await caches.keys()) {
            if (!keep.has(key)) await caches.delete(key);
        }
        await self.clients.claim();
    })());
});

self.addEventListener("fetch", (event) => {
    const req = event.request;
    if (req.method !== "GET") return;
    const url = new URL(req.url);
    if (url.origin !== self.location.origin) return;
    if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/share-link/")) return;

    if (req.mode === "navigate") {
        event.respondWith(networkFirstPage(req));
    } else if (url.pathname.startsWith("/assets/")) {
        event.respondWith(cacheFirstAsset(req));
    }
});

async function networkFirstPage(req) {
    const cache = await caches.open(SHELL);
    const network = fetch(req).then((res) => {
        if (res.ok) cache.put("/index.html", res.clone());
        return res;
    });
    const timeout = new Promise((resolve) => setTimeout(resolve, 1500));
    try {
        const first = await Promise.race([network, timeout]);
        if (first) return first;
        const cached = await cache.match("/index.html");
        return cached || await network;
    } catch {
        const cached = await cache.match("/index.html");
        if (cached) return cached;
        throw new Error("offline");
    }
}

async function cacheFirstAsset(req) {
    const cache = await caches.open(ASSETS);
    const hit = await cache.match(req);
    if (hit) return hit;
    const res = await fetch(req);
    if (res.ok) {
        await cache.put(req, res.clone());
        const keys = await cache.keys();
        for (let i = 0; i < keys.length - ASSET_LIMIT; i++) await cache.delete(keys[i]);
    }
    return res;
}
