import {useSyncExternalStore} from "react";
import {message} from "antd";
import {request} from "../../common/api";
import {APPS, AppDef} from "../apps";

// 桌面布局。整份 JSON 存在后端（/misc/home/get|set，后端不解析内容），本地另存一份用来秒开。
// 改动先落本地，800ms 内没有新改动再上传；版本号对不上说明别的设备改过，直接换成服务器上的。

export interface AppItem {
    id: string;          // "app:<appId>"
    kind: "app";
    appId: string;
}

export interface LinkItem {
    id: string;          // "link:<随机>"
    kind: "link";
    title: string;
    url: string;         // 站内页面写路径（/todone/...），站外写完整网址
}

export type DesktopItem = AppItem | LinkItem;

export interface DesktopLayout {
    v: 1;
    grid: DesktopItem[];
    dock: DesktopItem[];
    hiddenApps: string[]; // 被移出桌面的应用；新加的应用不在这里，会自动出现
}

export const DOCK_MAX = 5;

interface State {
    user: string;
    layout: DesktopLayout | null;
    version: number;
}

let state: State = {user: "", layout: null, version: 0};
const listeners = new Set<() => void>();
let saveTimer: number | undefined;
let saving = false;

function cacheKey(user: string) {
    return `shell:desktop:${user}`;
}

function set(next: Partial<State>) {
    state = {...state, ...next};
    listeners.forEach((l) => l());
}

export function appItem(appId: string): AppItem {
    return {id: `app:${appId}`, kind: "app", appId};
}

export function newLinkId() {
    return `link:${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export function defaultLayout(): DesktopLayout {
    const dockIds = ["todone", "money", "report"];
    const visible = APPS.filter((a) => !a.hiddenByDefault);
    return {
        v: 1,
        dock: dockIds.filter((id) => visible.some((a) => a.id === id)).map(appItem),
        grid: [
            ...visible.filter((a) => !dockIds.includes(a.id)).map((a) => appItem(a.id)),
            {id: "link:blog", kind: "link", title: "博客", url: "https://www.intmian.com"},
        ],
        hiddenApps: [],
    };
}

function isLayout(x: unknown): x is DesktopLayout {
    const l = x as DesktopLayout;
    return !!l && l.v === 1 && Array.isArray(l.grid) && Array.isArray(l.dock) && Array.isArray(l.hiddenApps);
}

// 清单里新加的应用补到桌面末尾；已经不存在的应用去掉
export function reconcile(layout: DesktopLayout): DesktopLayout {
    const known = new Set(APPS.map((a) => a.id));
    const keep = (i: DesktopItem) => i.kind === "link" || known.has(i.appId);
    const grid = layout.grid.filter(keep);
    const dock = layout.dock.filter(keep);
    const placed = new Set([...grid, ...dock].filter((i): i is AppItem => i.kind === "app").map((i) => i.appId));
    const missing = APPS.filter((a) => !a.hiddenByDefault && !placed.has(a.id) && !layout.hiddenApps.includes(a.id));
    return {...layout, grid: [...grid, ...missing.map((a) => appItem(a.id))], dock};
}

export async function loadDesktop(user: string) {
    if (state.user !== user) {
        let cached: DesktopLayout | null = null;
        try {
            const raw = JSON.parse(localStorage.getItem(cacheKey(user)) || "null");
            if (raw && isLayout(raw.layout)) {
                cached = raw.layout;
                state.version = raw.version ?? 0;
            }
        } catch {
            cached = null;
        }
        set({user, layout: reconcile(cached ?? defaultLayout()), version: cached ? state.version : 0});
    }
    const ret = await request<{ Version: number; Layout: unknown }>("/misc/home/get");
    if (!ret.ok || state.user !== user) return;
    if (isLayout(ret.data.Layout)) {
        // 本地有没上传的改动时，以本地为准，等它上传
        if (saveTimer !== undefined || saving) return;
        set({layout: reconcile(ret.data.Layout), version: ret.data.Version});
        writeCache();
    } else if (ret.data.Version === 0) {
        // 服务器上还没有，把当前的（默认或本地缓存）存上去
        set({version: 0});
        scheduleSave(0);
    }
}

function writeCache() {
    try {
        localStorage.setItem(cacheKey(state.user), JSON.stringify({layout: state.layout, version: state.version}));
    } catch {
        // 忽略
    }
}

function scheduleSave(delay = 800) {
    window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(() => {
        saveTimer = undefined;
        void save();
    }, delay);
}

async function save() {
    if (!state.layout || saving) return;
    saving = true;
    const user = state.user;
    const ret = await request<{ Version: number; Layout: unknown }>("/misc/home/set", {
        Version: state.version,
        Layout: state.layout,
    });
    saving = false;
    if (state.user !== user) return;
    if (ret.ok) {
        set({version: ret.data.Version});
        writeCache();
    } else if (ret.code === 2 && ret.data && isLayout(ret.data.Layout)) {
        set({layout: reconcile(ret.data.Layout), version: ret.data.Version});
        writeCache();
        message.info("桌面在别的设备上改过，已同步");
    }
    // 其他失败（断网等）：本地缓存还在，下次改动或下次打开时再传
}

export function updateDesktop(fn: (layout: DesktopLayout) => DesktopLayout) {
    if (!state.layout) return;
    set({layout: fn(state.layout)});
    writeCache();
    scheduleSave();
}

export function useDesktopLayout(): DesktopLayout | null {
    return useSyncExternalStore(
        (cb) => {
            listeners.add(cb);
            return () => listeners.delete(cb);
        },
        () => state.layout,
    );
}

// ---- 常用操作 ----

export function isOnDesktop(layout: DesktopLayout, url: string) {
    return [...layout.grid, ...layout.dock].some((i) => i.kind === "link" && i.url === url);
}

export function addLink(title: string, url: string) {
    updateDesktop((l) => ({...l, grid: [...l.grid, {id: newLinkId(), kind: "link", title, url}]}));
}

export function removeItem(id: string) {
    updateDesktop((l) => {
        const item = [...l.grid, ...l.dock].find((i) => i.id === id);
        return {
            ...l,
            grid: l.grid.filter((i) => i.id !== id),
            dock: l.dock.filter((i) => i.id !== id),
            hiddenApps: item?.kind === "app" ? [...l.hiddenApps, item.appId] : l.hiddenApps,
        };
    });
}

export function restoreApp(appId: string) {
    updateDesktop((l) => ({
        ...l,
        hiddenApps: l.hiddenApps.filter((a) => a !== appId),
        grid: [...l.grid, appItem(appId)],
    }));
}

export function patchLink(id: string, patch: Partial<Pick<LinkItem, "title" | "url">>) {
    const fix = (i: DesktopItem) => (i.id === id && i.kind === "link" ? {...i, ...patch} : i);
    updateDesktop((l) => ({...l, grid: l.grid.map(fix), dock: l.dock.map(fix)}));
}

export function toggleDock(id: string) {
    updateDesktop((l) => {
        const inDock = l.dock.find((i) => i.id === id);
        if (inDock) return {...l, dock: l.dock.filter((i) => i.id !== id), grid: [...l.grid, inDock]};
        const inGrid = l.grid.find((i) => i.id === id);
        if (!inGrid || l.dock.length >= DOCK_MAX) return l;
        return {...l, grid: l.grid.filter((i) => i.id !== id), dock: [...l.dock, inGrid]};
    });
}

export function reorder(area: "grid" | "dock", fromId: string, toId: string) {
    updateDesktop((l) => {
        const list = [...l[area]];
        const from = list.findIndex((i) => i.id === fromId);
        const to = list.findIndex((i) => i.id === toId);
        if (from < 0 || to < 0) return l;
        const [moved] = list.splice(from, 1);
        list.splice(to, 0, moved);
        return {...l, [area]: list};
    });
}

export function visibleItems(items: DesktopItem[], canUse: (app: AppDef) => boolean): DesktopItem[] {
    return items.filter((i) => {
        if (i.kind === "link") return true;
        const app = APPS.find((a) => a.id === i.appId);
        return !!app && canUse(app);
    });
}
