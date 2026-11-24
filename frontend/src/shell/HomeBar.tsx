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
// 页面往下滚时收起，往上滚、滚到底、或鼠标移到屏幕底部时出现，避免一直挡住内容。
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

// 往下滚收起，往上滚出现；靠近顶部、滚到底、鼠标移到屏幕底部、换页面时都出现
function useHideOnScroll(resetKey: string) {
    const [hidden, setHidden] = useState(false);
    useEffect(() => {
        setHidden(false);
    }, [resetKey]);
    useEffect(() => {
        let last = window.scrollY;
        let queued = false;
        const onScroll = () => {
            if (queued) return;
            queued = true;
            requestAnimationFrame(() => {
                queued = false;
                const y = window.scrollY;
                const atBottom = window.innerHeight + y >= document.documentElement.scrollHeight - 4;
                if (y < 40 || atBottom) setHidden(false);
                else if (y > last + 6) setHidden(true);
                else if (y < last - 6) setHidden(false);
                last = y;
            });
        };
        const onMove = (e: MouseEvent) => {
            if (e.clientY > window.innerHeight - 90) setHidden(false);
        };
        window.addEventListener("scroll", onScroll, {passive: true});
        window.addEventListener("mousemove", onMove, {passive: true});
        return () => {
            window.removeEventListener("scroll", onScroll);
            window.removeEventListener("mousemove", onMove);
        };
    }, []);
    return hidden;
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
            }}>{pinned ? <><CheckOutlined/>已在桌面</> : <><PlusOutlined/>添加到桌面</>}</button>
        </div>
    </div>;
}
