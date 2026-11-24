import {createContext, useContext} from "react";

// 重新加载当前打开的清单（整个清单页重新挂载、重新拉数据）。
// 以前移动任务后直接刷新整个浏览器页面，在外壳里会把后台保活的其他应用也一起清掉。
export const GroupReloadCtx = createContext<() => void>(() => window.location.reload());

export function useReloadGroup() {
    return useContext(GroupReloadCtx);
}
