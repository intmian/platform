import {createContext, useContext, useEffect, useRef} from "react";

// 每个应用实例拿到的运行环境。应用切到后台（保活）时 active=false，DOM 还在，只是藏起来。
// 应用里需要注意的事：
// - 原来靠 visibilitychange“回到前台就刷新”的逻辑，要同时挂 useAppActive，因为应用之间切换时页面一直在前台；
// - 网页标题用 useAppTitle，不要直接改 document.title，否则切回来时不会恢复。
export interface AppRuntime {
    appId: string;
    active: boolean;
    setTitle: (title: string | null) => void;
}

export const AppRuntimeCtx = createContext<AppRuntime>({
    appId: "",
    active: true,
    setTitle: () => undefined,
});

export function useAppRuntime() {
    return useContext(AppRuntimeCtx);
}

export function useIsAppActive(): boolean {
    return useContext(AppRuntimeCtx).active;
}

// 应用从后台切回前台时调用（首次挂载不调用）
export function useAppActive(callback: () => void) {
    const {active} = useContext(AppRuntimeCtx);
    const cbRef = useRef(callback);
    cbRef.current = callback;
    const wasActive = useRef(active);
    useEffect(() => {
        if (active && !wasActive.current) cbRef.current();
        wasActive.current = active;
    }, [active]);
}

// 应用的网页标题；不传或传空就用应用名
export function useAppTitle(title: string | null | undefined) {
    const {setTitle} = useContext(AppRuntimeCtx);
    useEffect(() => {
        setTitle(title || null);
    }, [title, setTitle]);
    useEffect(() => () => setTitle(null), [setTitle]);
}
