import {Component, ReactNode, Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState} from "react";
import {Location, Route, Routes, useLocation, useNavigate} from "react-router-dom";
import {Button, Spin} from "antd";
import {useAuth} from "../common/loginCtx";
import {AppDef, appById, canUseApp, findApp} from "./apps";
import {AppRuntime, AppRuntimeCtx} from "./runtime";
import {LockScreen} from "./LockScreen";
import {HomeBar} from "./HomeBar";
import {CommandPalette} from "./CommandPalette";
import {Desktop} from "./desktop/Desktop";
import {bindRecentsUser, recordRecent, useRecents} from "./recents";
import {nextSlots, Slot} from "./slots";
import {ErrorPage} from "../misc/ErrorPage";

const DEFAULT_TITLE = "Platform";
const DEFAULT_FAVICON = "/favicon-32.png";
const DEFAULT_TOUCH_ICON = "/icons/plat-180.png";

// 外壳入口：先确认登录，再交给 AppHost。公开应用不登录也能看，但没有底部横条。
export function Shell() {
    const auth = useAuth();
    const location = useLocation();
    const app = findApp(location.pathname);

    if (!auth.loginInfo.init) return <div className="pf-boot"/>;
    if (!auth.loginInfo.isValid()) {
        if (app?.public) return <PublicApp app={app}/>;
        return <LockScreen/>;
    }
    return <>
        <AppHost/>
        {auth.sessionLost && <LockScreen overlay/>}
    </>;
}

function PublicApp({app}: { app: AppDef }) {
    const location = useLocation();
    useHeadFor(app, null);
    return <AppErrorBoundary appName={app.name}>
        <Suspense fallback={<AppLoading/>}>
            <AppRoutes app={app} location={location}/>
        </Suspense>
    </AppErrorBoundary>;
}

function AppRoutes({app, location}: { app: AppDef; location: Location }) {
    const Comp = app.component;
    return <Routes location={location}>
        <Route path={`${app.basePath}/*`} element={<Comp/>}/>
    </Routes>;
}

// 同时挂着桌面、当前应用和最多 MAX_BACKGROUND 个后台应用。
// 后台应用的 DOM 还在，只是用 hidden 藏起来；它们拿到的 location 冻结在离开时那一页，
// 所以 useParams/useLocation 在后台不会变。切回来时外壳会把地址栏恢复成那一页。
function AppHost() {
    const auth = useAuth();
    const location = useLocation();
    const user = auth.loginInfo.usr;
    const atDesktop = location.pathname === "/";
    const current = atDesktop ? undefined : findApp(location.pathname);
    const [paletteOpen, setPaletteOpen] = useState(false);
    const [desktopMounted, setDesktopMounted] = useState(atDesktop);
    const [titles, setTitles] = useState<Record<string, string | null>>({});
    const slotsRef = useRef<Slot<Location>[]>([]);

    bindRecentsUser(user);
    const recents = useRecents();

    // 根据当前地址算出要挂哪些应用。这里在渲染时改 ref：输入相同结果就相同，重复执行没有副作用。
    // 在切换面板里被关掉（不在最近里了）的后台应用一起卸掉
    const slots = useMemo(() => {
        const list = nextSlots(slotsRef.current, current?.id, location, (id) => !!appById(id)?.keepAlive)
            .filter((s) => s.appId === current?.id || recents.some((r) => r.appId === s.appId));
        slotsRef.current = list;
        return list;
    }, [current, location, recents]);

    useEffect(() => {
        if (atDesktop) setDesktopMounted(true);
    }, [atDesktop]);

    // 每个应用一个稳定的 setTitle，避免应用里的 effect 反复触发
    const titleSetters = useRef<Record<string, (t: string | null) => void>>({});
    const setterFor = useCallback((appId: string) => {
        if (!titleSetters.current[appId]) {
            titleSetters.current[appId] = (t) => setTitles((prev) => prev[appId] === t ? prev : {...prev, [appId]: t});
        }
        return titleSetters.current[appId];
    }, []);

    const currentTitle = current ? titles[current.id] || current.name : DEFAULT_TITLE;
    useHeadFor(current, current ? titles[current.id] ?? null : null);
    useScrollPerApp(atDesktop ? "desktop" : current?.id ?? "none");

    // 手机上把页面拉过头时露出的是整个网页的底色（默认白色），在桌面时换成桌面的颜色。
    // 跟着地址在绘制前切换，不等桌面组件自己的 effect，免得偶尔慢一拍露白
    // 灰底的应用同理
    const grayPage = !!current?.grayPage;
    useLayoutEffect(() => {
        document.documentElement.classList.toggle("pf-on-desktop", atDesktop);
        document.documentElement.classList.toggle("pf-gray-page", grayPage);
    }, [atDesktop, grayPage]);
    useLayoutEffect(() => () => document.documentElement.classList.remove("pf-on-desktop", "pf-gray-page"), []);

    useEffect(() => {
        if (current) recordRecent({appId: current.id, path: location.pathname + location.search, title: currentTitle});
    }, [current, location.pathname, location.search, currentTitle]);

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
                e.preventDefault();
                setPaletteOpen((o) => !o);
            }
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, []);

    const desktopRuntime = useMemo<AppRuntime>(() => ({
        appId: "desktop", active: atDesktop, setTitle: () => undefined,
    }), [atDesktop]);

    return <>
        {desktopMounted && <FadeSlot className="pf-slot" active={atDesktop}>
            <AppRuntimeCtx.Provider value={desktopRuntime}>
                <AppErrorBoundary appName="桌面">
                    <Desktop onSearch={() => setPaletteOpen(true)}/>
                </AppErrorBoundary>
            </AppRuntimeCtx.Provider>
        </FadeSlot>}

        {slots.map((slot) => {
            const app = appById(slot.appId)!;
            const active = slot.appId === current?.id;
            return <AppSlot key={slot.appId} app={app} location={slot.location} active={active}
                            setTitle={setterFor(slot.appId)}
                            allowed={canUseApp(app, (p) => auth.loginInfo.hasPermission(p))}/>;
        })}

        {!atDesktop && !current && <NotFound/>}

        {!atDesktop && <HomeBar current={current} currentPath={location.pathname + location.search}
                                currentTitle={currentTitle} onSearch={() => setPaletteOpen(true)}/>}
        <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)}/>
    </>;
}

function AppSlot({app, location, active, allowed, setTitle}: {
    app: AppDef;
    location: Location;
    active: boolean;
    allowed: boolean;
    setTitle: (t: string | null) => void;
}) {
    const runtime = useMemo<AppRuntime>(() => ({appId: app.id, active, setTitle}), [app.id, active, setTitle]);
    return <FadeSlot className="pf-slot pf-app-slot" active={active}>
        <AppRuntimeCtx.Provider value={runtime}>
            {allowed ? <AppErrorBoundary appName={app.name}>
                <Suspense fallback={<AppLoading/>}>
                    <AppRoutes app={app} location={location}/>
                </Suspense>
            </AppErrorBoundary> : <NoPermission app={app}/>}
        </AppRuntimeCtx.Provider>
    </FadeSlot>;
}

// 应用（或桌面）从隐藏变成显示时淡入一下。只动透明度：容器上加 transform 会让应用里 fixed 定位的元素跟着错位
function FadeSlot({className, active, children}: { className: string; active: boolean; children: ReactNode }) {
    const ref = useRef<HTMLDivElement>(null);
    const wasActive = useRef(active);
    useLayoutEffect(() => {
        if (active && !wasActive.current && ref.current
            && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
            ref.current.animate([{opacity: 0}, {opacity: 1}], {duration: 180, easing: "ease-out"});
        }
        wasActive.current = active;
    }, [active]);
    return <div ref={ref} className={className} hidden={!active}>{children}</div>;
}

// 所有应用共用一个窗口滚动条。切走时记下这个应用滚到哪里，切回来时恢复；第一次打开的应用从顶部开始。
function useScrollPerApp(key: string) {
    const saved = useRef<Record<string, number>>({});
    const activeKey = useRef(key);
    useEffect(() => {
        const onScroll = () => {
            saved.current[activeKey.current] = window.scrollY;
        };
        window.addEventListener("scroll", onScroll, {passive: true});
        return () => window.removeEventListener("scroll", onScroll);
    }, []);
    // 在浏览器绘制前恢复，避免先闪一下错误的位置
    useLayoutEffect(() => {
        if (activeKey.current === key) return;
        activeKey.current = key;
        window.scrollTo(0, saved.current[key] ?? 0);
    }, [key]);
}

// 网页标题、favicon、添加到主屏幕时的图标跟着当前应用走
function useHeadFor(app: AppDef | undefined, title: string | null) {
    useEffect(() => {
        if (!app) document.title = DEFAULT_TITLE;
        else if (!title || title.includes(app.name)) document.title = title || app.name;
        else document.title = `${title} · ${app.name}`;
    }, [app, title]);
    useEffect(() => {
        setLink("icon", app?.favicon ?? DEFAULT_FAVICON);
        setLink("apple-touch-icon", app?.touchIcon ?? DEFAULT_TOUCH_ICON);
    }, [app]);
}

function setLink(rel: string, href: string) {
    let el = document.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
    if (!el) {
        el = document.createElement("link");
        el.rel = rel;
        document.head.appendChild(el);
    }
    if (el.getAttribute("href") !== href) el.href = href;
}

function AppLoading() {
    return <div className="pf-center"><Spin/></div>;
}

function NotFound() {
    return <ErrorPage variant="notfound"/>;
}

function NoPermission({app}: { app: AppDef }) {
    const navigate = useNavigate();
    return <div className="pf-center pf-empty">
        <div className="pf-empty-title">这个账号不能用「{app.name}」</div>
        <Button onClick={() => navigate("/")}>回到桌面</Button>
    </div>;
}

// 一个应用崩了只影响它自己，外壳和其他应用照常
class AppErrorBoundary extends Component<{ appName: string; children: ReactNode }, { error: Error | null }> {
    state = {error: null as Error | null};

    static getDerivedStateFromError(error: Error) {
        return {error};
    }

    componentDidCatch(error: Error) {
        console.error(`[${this.props.appName}]`, error);
    }

    render() {
        if (!this.state.error) return this.props.children;
        return <div className="pf-center pf-empty">
            <div className="pf-empty-title">「{this.props.appName}」出错了</div>
            <div className="pf-empty-sub">{this.state.error.message}</div>
            <Button onClick={() => window.location.reload()}>重新加载</Button>
        </div>;
    }
}
