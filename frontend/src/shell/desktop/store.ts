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
    icon?: string;       // 站外网址自己指定的图标地址；不填自动取对方网站的图标
}

export type DesktopItem = AppItem | LinkItem;

// 壁纸右下角的插画：看板娘剪影、窗台猫线稿，或者不放
export type Wallpaper = "girl" | "cat" | "none";
export const WALLPAPERS: { id: Wallpaper; name: string }[] = [
    {id: "girl", name: "看板娘"},
    {id: "cat", name: "窗台猫"},
    {id: "none", name: "不放插画"},
];

export interface DesktopLayout {
    v: 1;
    grid: DesktopItem[];  // 桌面上的全部图标
    dock: DesktopItem[];  // 额外钉在 Dock 里的，图标在 grid 里也有一份（同一个 id），不是从桌面挪过去
    hiddenApps: string[]; // 被移出桌面的应用；新加的应用不在这里，会自动出现
    widgets: string[];    // 桌面上的小组件，按显示顺序；旧数据没有这个字段时用默认
    wallpaper?: Wallpaper; // 没有这个字段就是看板娘
}

export const DOCK_MAX = 5;
export const DEFAULT_WIDGETS = ["today", "books"];

interface State {
    user: string;
    layout: DesktopLayout | null;
    version: number;
}

let state: State = {user: "", layout: null, version: 0};
const listeners = new Set<() => void>();
let saveTimer: number | undefined;
let saving = false;
// 刚添加的图标：桌面渲染它时播一次“跳出”动画，然后清掉
let justAdded: string | null = null;

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
            ...visible.map((a) => appItem(a.id)),
            {id: "link:blog", kind: "link", title: "博客", url: "https://www.intmian.com"},
        ],
        hiddenApps: [],
        widgets: [...DEFAULT_WIDGETS],
    };
}

function isLayout(x: unknown): x is DesktopLayout {
    const l = x as DesktopLayout;
    return !!l && l.v === 1 && Array.isArray(l.grid) && Array.isArray(l.dock) && Array.isArray(l.hiddenApps);
}

// 清单里新加的应用补到桌面末尾；已经不存在的应用去掉；旧数据补上小组件列表。
// 以前 Dock 里的图标是从桌面挪过去的，桌面上没有；这里把它们补回桌面最前面。
export function reconcile(layout: DesktopLayout): DesktopLayout {
    const widgets = Array.isArray(layout.widgets) ? layout.widgets : [...DEFAULT_WIDGETS];
    const known = new Set(APPS.map((a) => a.id));
    const keep = (i: DesktopItem) => i.kind === "link" || known.has(i.appId);
    const dock = layout.dock.filter(keep).filter((i, n, all) => all.findIndex((x) => x.id === i.id) === n);
    const kept = layout.grid.filter(keep);
    const grid = [...dock.filter((d) => !kept.some((g) => g.id === d.id)), ...kept];
    const placed = new Set([...grid, ...dock].filter((i): i is AppItem => i.kind === "app").map((i) => i.appId));
    const missing = APPS.filter((a) => !a.hiddenByDefault && !placed.has(a.id) && !layout.hiddenApps.includes(a.id));
    return {...layout, grid: [...grid, ...missing.map((a) => appItem(a.id))], dock, widgets};
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
    const id = newLinkId();
    justAdded = id;
    updateDesktop((l) => ({...l, grid: [...l.grid, {id, kind: "link", title, url}]}));
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
    justAdded = `app:${appId}`;
    updateDesktop((l) => ({
        ...l,
        hiddenApps: l.hiddenApps.filter((a) => a !== appId),
        grid: [...l.grid, appItem(appId)],
    }));
}

export function patchLink(id: string, patch: Partial<Pick<LinkItem, "title" | "url" | "icon">>) {
    const fix = (i: DesktopItem) => (i.id === id && i.kind === "link" ? {...i, ...patch} : i);
    updateDesktop((l) => ({...l, grid: l.grid.map(fix), dock: l.dock.map(fix)}));
}

// 放进 / 移出 Dock：只改 Dock，桌面上的图标不动
export function toggleDock(id: string) {
    updateDesktop((l) => {
        if (l.dock.some((i) => i.id === id)) return {...l, dock: l.dock.filter((i) => i.id !== id)};
        const item = l.grid.find((i) => i.id === id);
        if (!item || l.dock.length >= DOCK_MAX) return l;
        return {...l, dock: [...l.dock, item]};
    });
}

export function unpinFromDock(id: string) {
    updateDesktop((l) => ({...l, dock: l.dock.filter((i) => i.id !== id)}));
}

// 把桌面上的图标钉到 Dock 的某个位置（已经在 Dock 里就挪到那个位置）。toIndex 超出范围放到末尾；Dock 满了就不动
export function pinToDock(id: string, toIndex: number) {
    updateDesktop((l) => {
        const item = l.grid.find((i) => i.id === id);
        if (!item) return l;
        const already = l.dock.some((i) => i.id === id);
        if (!already && l.dock.length >= DOCK_MAX) return l;
        const list = l.dock.filter((i) => i.id !== id);
        list.splice(Math.max(0, Math.min(toIndex, list.length)), 0, item);
        return {...l, dock: list};
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

export function removeWidget(id: string) {
    updateDesktop((l) => ({...l, widgets: l.widgets.filter((w) => w !== id)}));
}

export function addWidget(id: string) {
    updateDesktop((l) => (l.widgets.includes(id) ? l : {...l, widgets: [...l.widgets, id]}));
}

export function reorderWidgets(fromId: string, toId: string) {
    updateDesktop((l) => {
        const list = [...l.widgets];
        const from = list.indexOf(fromId);
        const to = list.indexOf(toId);
        if (from < 0 || to < 0) return l;
        const [w] = list.splice(from, 1);
        list.splice(to, 0, w);
        return {...l, widgets: list};
    });
}

export function setWallpaper(w: Wallpaper) {
    updateDesktop((l) => ({...l, wallpaper: w}));
}

export function takeJustAdded(id: string): boolean {
    if (justAdded !== id) return false;
    justAdded = null;
    return true;
}
