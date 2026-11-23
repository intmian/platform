import {ComponentType, lazy} from "react";

const RELOAD_KEY = "shell:chunk-reload-at";

// 按需加载的页面。部署后旧的 JS 文件会被删掉，开着的旧页面再去加载就会失败：
// 这时自动刷新一次拿到新版本；30 秒内已经刷新过就不再刷，直接把错误交给错误边界。
export function lazyWithReload<T extends ComponentType<any>>(loader: () => Promise<{ default: T }>) {
    return lazy(async () => {
        try {
            return await loader();
        } catch (err) {
            const last = Number(sessionStorage.getItem(RELOAD_KEY) || 0);
            if (Date.now() - last > 30_000) {
                sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
                window.location.reload();
                // 刷新前先挂起，避免闪一下错误页
                return new Promise<never>(() => undefined);
            }
            throw err;
        }
    });
}
