import {useSyncExternalStore} from "react";

// 最近打开的页面：每个应用只记最后停留的那一页。底部横条的切换面板、⌘K、“添加到桌面”都用它。
export interface RecentPage {
    appId: string;
    path: string;
    title: string;
    at: number;
}

const MAX = 10;
let user = "";
let list: RecentPage[] = [];
const listeners = new Set<() => void>();

function key() {
    return `shell:recents:${user}`;
}

function emit() {
    try {
        localStorage.setItem(key(), JSON.stringify(list));
    } catch {
        // 存不下就算了，只是少了跨刷新的记录
    }
    listeners.forEach((l) => l());
}

export function bindRecentsUser(name: string) {
    if (name === user) return;
    user = name;
    try {
        list = JSON.parse(localStorage.getItem(key()) || "[]");
    } catch {
        list = [];
    }
    listeners.forEach((l) => l());
}

export function recordRecent(page: Omit<RecentPage, "at">) {
    if (!user) return;
    const prev = list.find((p) => p.appId === page.appId);
    if (prev && prev.path === page.path && prev.title === page.title && list[0] === prev) return;
    list = [{...page, at: Date.now()}, ...list.filter((p) => p.appId !== page.appId)].slice(0, MAX);
    emit();
}

export function useRecents(): RecentPage[] {
    return useSyncExternalStore(
        (cb) => {
            listeners.add(cb);
            return () => listeners.delete(cb);
        },
        () => list,
    );
}
