import {useEffect, useState} from "react";
import {useNavigate} from "react-router-dom";
import {message} from "antd";
import {CheckOutlined, HomeOutlined, PlusOutlined, SearchOutlined, UpOutlined} from "@ant-design/icons";
import {appById, AppDef} from "./apps";
import {AppGlyph} from "./AppTile";
import {useRecents} from "./recents";
import {addLink, isOnDesktop, useDesktopLayout} from "./desktop/store";

const RECENT_IN_BAR = 3;

// 应用底部正中的悬浮胶囊：回桌面按钮 + 最近用过的几个应用（点一下直接切过去）+ “更多”打开切换面板。
// 不给它留空：页面或抽屉往下滚时收起，往上滚、回到顶部、鼠标移到屏幕底部时出现。
// 层级低于 antd 弹窗的遮罩，所以弹窗开着时切不走，不会出现“上一个应用的抽屉盖在桌面上”。
export function HomeBar({current, currentPath, currentTitle, onSearch}: {
    current: AppDef | undefined;
    currentPath: string;
    currentTitle: string;
    onSearch: () => void;
}) {
    const navigate = useNavigate();
    const recents = useRecents();
    const [open, setOpen] = useState(false);
    const hidden = useHideOnScroll(currentPath);
    const others = recents.filter((r) => r.appId !== current?.id && appById(r.appId)).slice(0, RECENT_IN_BAR);

    useEffect(() => {
        setOpen(false);
    }, [currentPath]);

    useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [open]);

    return <>
        {open && <div className="pf-switch-mask" onClick={() => setOpen(false)}/>}
        {open && <SwitchPanel current={current} currentPath={currentPath} currentTitle={currentTitle}
                              onClose={() => setOpen(false)}
                              onSearch={() => {
                                  setOpen(false);
                                  onSearch();
                              }}/>}
        <nav className={`pf-homebar${hidden && !open ? " is-hidden" : ""}`} aria-label="切换应用">
            <button className="pf-homebar-home" title="回到桌面" aria-label="回到桌面" onClick={() => navigate("/")}>
                <HomeOutlined/>
            </button>
            {others.length > 0 && <span className="pf-homebar-sep"/>}
            {others.map((r) => {
                const app = appById(r.appId)!;
                return <button key={r.appId} className="pf-homebar-app" title={r.title || app.name}
                               aria-label={`切换到${app.name}`} onClick={() => navigate(r.path)}>
                    <AppGlyph app={app} size={30}/>
                </button>;
            })}
            <button className={`pf-homebar-more${open ? " is-open" : ""}`} title="更多" aria-label="更多"
                    onClick={() => setOpen((o) => !o)}>
                <UpOutlined/>
            </button>
        </nav>
    </>;
}

// 往下滚收起，往上滚出现；靠近顶部、鼠标移到屏幕底部、换页面时出现。
// 页面和抽屉都不给胶囊留空，挡住了就往下滚一下让它收起。
// 滚到底：第一次到底不弹，最后一行能看全；到底以后再往下推一次（新的一下滚轮或上划），胶囊才出来，
// 学 Safari 工具栏。抽屉、弹窗里的滚动区域也算（capture 阶段能收到任何元素的 scroll）。
function useHideOnScroll(resetKey: string) {
    const [hidden, setHidden] = useState(false);
    useEffect(() => {
        setHidden(false);
    }, [resetKey]);
    useEffect(() => {
        const lastTop = new WeakMap<object, number>();
        const onScroll = (e: Event) => {
            const isPage = e.target === document || e.target === document.documentElement;
            const key: object = isPage ? document : e.target as Element;
            const y = isPage ? window.scrollY : (e.target as Element).scrollTop;
            const last = lastTop.get(key) ?? 0;
            if (y < 40) setHidden(false);
            else if (y > last + 6) setHidden(true);
            else if (y < last - 6) setHidden(false);
            else return; // 动得太少：不更新基准，慢慢滚也能累计到阈值
            lastTop.set(key, y);
        };

        // 滚轮：触控板松手后的惯性也会连续发 wheel，所以只认停顿 200ms 以后的新一下
        let lastWheel = 0;
        const onWheel = (e: WheelEvent) => {
            const now = e.timeStamp;
            const freshGesture = now - lastWheel > 200;
            lastWheel = now;
            if (freshGesture && e.deltaY > 0 && atBottom(scrollerOf(e.target))) setHidden(false);
        };
        // 触屏：手指按下时已经在底部，再往上划一段
        let touch: { y: number; scroller: Element } | null = null;
        const onTouchStart = (e: TouchEvent) => {
            const scroller = scrollerOf(e.target);
            touch = atBottom(scroller) ? {y: e.touches[0].clientY, scroller} : null;
        };
        const onTouchMove = (e: TouchEvent) => {
            if (touch && touch.y - e.touches[0].clientY > 30 && atBottom(touch.scroller)) {
                setHidden(false);
                touch = null;
            }
        };
        const onMove = (e: MouseEvent) => {
            if (e.clientY > window.innerHeight - 90) setHidden(false);
        };
        document.addEventListener("scroll", onScroll, {passive: true, capture: true});
        window.addEventListener("wheel", onWheel, {passive: true});
        window.addEventListener("touchstart", onTouchStart, {passive: true});
        window.addEventListener("touchmove", onTouchMove, {passive: true});
        window.addEventListener("mousemove", onMove, {passive: true});
        return () => {
            document.removeEventListener("scroll", onScroll, {capture: true});
            window.removeEventListener("wheel", onWheel);
            window.removeEventListener("touchstart", onTouchStart);
            window.removeEventListener("touchmove", onTouchMove);
            window.removeEventListener("mousemove", onMove);
        };
    }, []);
    return hidden;
}

// 手指或滚轮所在位置实际滚动的是哪个元素：往上找第一个能竖着滚的，找不到就是整个页面
function scrollerOf(target: EventTarget | null): Element {
    let el = target instanceof Element ? target : null;
    while (el && el !== document.body && el !== document.documentElement) {
        const oy = getComputedStyle(el).overflowY;
        if ((oy === "auto" || oy === "scroll") && el.scrollHeight > el.clientHeight + 1) return el;
        el = el.parentElement;
    }
    return document.scrollingElement ?? document.documentElement;
}

// 已经滚到底（内容本来就不够一屏的不算，那种情况胶囊不会被收起）
function atBottom(el: Element): boolean {
    return el.scrollHeight > el.clientHeight + 1 && el.scrollTop + el.clientHeight >= el.scrollHeight - 2;
}

function SwitchPanel({current, currentPath, currentTitle, onClose, onSearch}: {
    current: AppDef | undefined;
    currentPath: string;
    currentTitle: string;
    onClose: () => void;
    onSearch: () => void;
}) {
    const navigate = useNavigate();
    const recents = useRecents();
    const layout = useDesktopLayout();
    const pinned = layout ? isOnDesktop(layout, currentPath) : false;
    const items = recents.filter((r) => appById(r.appId));

    return <div className="pf-switch">
        <div className="pf-switch-list">
            {items.map((r) => {
                const app = appById(r.appId)!;
                const isCurrent = r.appId === current?.id;
                return <button key={r.appId} className={`pf-switch-item${isCurrent ? " is-current" : ""}`}
                               onClick={() => {
                                   onClose();
                                   if (!isCurrent) navigate(r.path);
                               }}>
                    <AppGlyph app={app} size={36}/>
                    <span className="pf-switch-text">
                        <span className="pf-switch-name">{app.name}</span>
                        {r.title && r.title !== app.name && <span className="pf-switch-sub">{r.title}</span>}
                    </span>
                    {isCurrent && <span className="pf-switch-tag">当前</span>}
                </button>;
            })}
        </div>
        <div className="pf-switch-actions">
            <button onClick={() => {
                onClose();
                navigate("/");
            }}><HomeOutlined/>桌面
            </button>
            <button onClick={onSearch}><SearchOutlined/>搜索</button>
            <button disabled={pinned} onClick={() => {
                addLink(currentTitle || current?.name || "页面", currentPath);
                message.success("已添加到桌面");
                onClose();
            }}>{pinned ? <><CheckOutlined/>这页已在桌面</> : <><PlusOutlined/>添加到桌面</>}</button>
        </div>
    </div>;
}
