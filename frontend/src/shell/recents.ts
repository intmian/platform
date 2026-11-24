import {useSyncExternalStore} from "react";

// 最近打开的页面：每个应用只记最后停留的那一页。底部横条的切换面板、⌘K、“添加到桌面”都用它。
// 只在内存里，刷新网页就清空。最多记当前应用 + 另外 3 个，和后台保活的个数（slots.ts 的 MAX_BACKGROUND）对齐，
// 列表里的保活应用基本都还挂在后台，点了是秒开。
export interface RecentPage {
    appId: string;
    path: string;
    title: string;
    at: number;
}

const MAX = 4;
let user = "";
let list: RecentPage[] = [];
const listeners = new Set<() => void>();

// 以前最近记录存在 localStorage（shell:recents:<用户>），现在不存了，顺手清掉旧数据
try {
    Object.keys(localStorage).filter((k) => k.startsWith("shell:recents:")).forEach((k) => localStorage.removeItem(k));
} catch {
    // 拿不到 localStorage 就不管了
}

function emit() {
    listeners.forEach((l) => l());
}

// 换了账号就清空，别把上一个人的最近带过来
export function bindRecentsUser(name: string) {
    if (name === user) return;
    user = name;
    if (list.length === 0) return;
    list = [];
    emit();
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
