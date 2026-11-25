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

// 像页面一样的抽屉（详情、目录、设置面板）用这组属性：层级放在底部胶囊（900）下面，
// 开着时也能回桌面、切应用、添加到桌面。抽屉底部不留空：胶囊浮在上面，抽屉里往下滚时收起（HomeBar 的 useHideOnScroll）。
// 抽屉挂在 body 上、不随应用隐藏，所以 open 要同时看 useIsAppActive()，切走时收起、切回来恢复。
// 小表单、确认框不用它，仍按 antd 默认层级盖住胶囊：填到一半不该切走。
export const pageDrawerProps = {zIndex: 880, rootClassName: "pf-page-drawer"} as const;
