// 保活的应用槽位：当前应用排第一，后面是还留在后台的保活应用（按最近使用排）。
// 超出上限时最早用过的那个被卸载；刷新网页全部销毁。

// 最多保留几个后台应用（不含当前应用和桌面）
export const MAX_BACKGROUND = 3;

export interface Slot<L = unknown> {
    appId: string;
    location: L;
}

export function nextSlots<L>(prev: Slot<L>[], currentId: string | undefined, location: L,
                             keepAlive: (appId: string) => boolean, max = MAX_BACKGROUND): Slot<L>[] {
    const background = prev.filter((s) => s.appId !== currentId && keepAlive(s.appId)).slice(0, max);
    return currentId ? [{appId: currentId, location}, ...background] : background;
}

