import {useEffect, useRef, useState} from "react";
import {useNavigate} from "react-router-dom";
import {message} from "antd";
import {CheckOutlined, HomeOutlined, PlusOutlined, SearchOutlined} from "@ant-design/icons";
import {appById, AppDef} from "./apps";
import {AppGlyph} from "./AppTile";
import {useRecents} from "./recents";
import {addLink, isOnDesktop, useDesktopLayout} from "./desktop/store";
import {isTouchDevice} from "../common/breakpoints";

const LONG_PRESS_MS = 420;
const HOVER_MS = 320;

// 应用底部正中的小横条：点一下回桌面；长按（触屏）或鼠标停留（电脑）打开切换面板。
// 层级低于 antd 弹窗的遮罩，所以弹窗开着时切不走，不会出现“上一个应用的抽屉盖在桌面上”。
export function HomeBar({current, currentPath, currentTitle, onSearch}: {
    current: AppDef | undefined;
    currentPath: string;
    currentTitle: string;
    onSearch: () => void;
}) {
    const navigate = useNavigate();
    const [open, setOpen] = useState(false);
    const pressTimer = useRef<number>();
    const hoverTimer = useRef<number>();
    const longPressed = useRef(false);
    const touch = isTouchDevice();

    useEffect(() => {
        setOpen(false);
    }, [currentPath]);

    useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [open]);

    const clearTimers = () => {
        window.clearTimeout(pressTimer.current);
        window.clearTimeout(hoverTimer.current);
    };

    return <>
        {open && <div className="pf-switch-mask" onClick={() => setOpen(false)}/>}
        {open && <SwitchPanel current={current} currentPath={currentPath} currentTitle={currentTitle}
                              onClose={() => setOpen(false)}
                              onSearch={() => {
                                  setOpen(false);
                                  onSearch();
                              }}/>}
        <div
            className={`pf-homebar${open ? " is-open" : ""}`}
            role="button"
            aria-label="回到桌面，长按切换应用"
            title={touch ? undefined : "回到桌面"}
            onContextMenu={(e) => e.preventDefault()}
            onPointerDown={(e) => {
                if (e.pointerType === "mouse") return;
                longPressed.current = false;
                pressTimer.current = window.setTimeout(() => {
                    longPressed.current = true;
                    navigator.vibrate?.(8);
                    setOpen(true);
                }, LONG_PRESS_MS);
            }}
            onPointerUp={clearTimers}
            onPointerCancel={clearTimers}
            onPointerEnter={(e) => {
                if (e.pointerType !== "mouse") return;
                hoverTimer.current = window.setTimeout(() => setOpen(true), HOVER_MS);
            }}
            onPointerLeave={(e) => {
                if (e.pointerType === "mouse") window.clearTimeout(hoverTimer.current);
            }}
            onClick={() => {
                if (longPressed.current) {
                    longPressed.current = false;
                    return;
                }
                clearTimers();
                navigate("/");
            }}
        >
            <span className="pf-homebar-pill"/>
        </div>
    </>;
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

    return <div className="pf-switch" onPointerLeave={(e) => e.pointerType === "mouse" && onClose()}>
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
                message.success("已加到桌面");
                onClose();
            }}>{pinned ? <><CheckOutlined/>已在桌面</> : <><PlusOutlined/>加到桌面</>}</button>
        </div>
    </div>;
}
