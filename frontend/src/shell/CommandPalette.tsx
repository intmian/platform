import {ReactNode, useEffect, useMemo, useRef, useState} from "react";
import {useNavigate} from "react-router-dom";
import {Modal} from "antd";
import {SearchOutlined} from "@ant-design/icons";
import {APPS, appById, canUseApp, findApp} from "./apps";
import {AppGlyph, LinkGlyph} from "./AppTile";
import {useRecents} from "./recents";
import {useDesktopLayout} from "./desktop/store";
import {useAuth} from "../common/loginCtx";
import type {TodoneGroupEntry} from "../todone/shellApi";

interface Entry {
    key: string;
    title: string;
    sub: string;
    icon: ReactNode;
    url: string;
}

function openUrl(url: string, navigate: (to: string) => void) {
    if (url.startsWith("/")) navigate(url);
    else window.open(url, "_blank", "noopener");
}

// ⌘K / Ctrl+K：搜应用、桌面上的快捷方式、最近的页面、Todone 的清单
export function CommandPalette({open, onClose}: { open: boolean; onClose: () => void }) {
    const navigate = useNavigate();
    const auth = useAuth();
    const recents = useRecents();
    const layout = useDesktopLayout();
    const [query, setQuery] = useState("");
    const [cursor, setCursor] = useState(0);
    const [groups, setGroups] = useState<TodoneGroupEntry[]>([]);
    const inputRef = useRef<HTMLInputElement>(null);
    const listRef = useRef<HTMLDivElement>(null);

    const todoneApp = appById("todone");
    const canTodone = !!todoneApp && canUseApp(todoneApp, (p) => auth.loginInfo.hasPermission(p));

    useEffect(() => {
        if (!open) return;
        setQuery("");
        setCursor(0);
        window.setTimeout(() => inputRef.current?.focus(), 30);
        if (canTodone) {
            import("../todone/shellApi")
                .then((m) => m.listTodoneGroups(auth.loginInfo.usr))
                .then(setGroups)
                .catch(() => setGroups([]));
        }
    }, [open, canTodone, auth.loginInfo.usr]);

    const all = useMemo<Entry[]>(() => {
        const list: Entry[] = [];
        const seen = new Set<string>();
        const push = (e: Entry) => {
            if (seen.has(e.url)) return;
            seen.add(e.url);
            list.push(e);
        };
        recents.forEach((r) => {
            const app = appById(r.appId);
            if (!app) return;
            push({key: "r" + r.path, title: r.title || app.name, sub: `最近 · ${app.name}`,
                icon: <AppGlyph app={app} size={28}/>, url: r.path});
        });
        APPS.filter((a) => canUseApp(a, (p) => auth.loginInfo.hasPermission(p))).forEach((a) =>
            push({key: "a" + a.id, title: a.name, sub: "应用", icon: <AppGlyph app={a} size={28}/>, url: a.basePath}));
        [...(layout?.dock ?? []), ...(layout?.grid ?? [])].forEach((i) => {
            if (i.kind !== "link") return;
            push({key: i.id, title: i.title, sub: i.url.startsWith("/") ? `桌面 · ${findApp(i.url)?.name ?? ""}` : "桌面 · 网页",
                icon: <LinkGlyph title={i.title} url={i.url} size={28}/>, url: i.url});
        });
        if (todoneApp) {
            groups.forEach((g) => push({key: "g" + g.path, title: g.title, sub: `Todone · ${g.dirPath}`,
                icon: <LinkGlyph title={g.title} url={g.path} size={28}/>, url: g.path}));
        }
        return list;
    }, [recents, layout, groups, auth.loginInfo, todoneApp]);

    const results = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return all.slice(0, 12);
        return all.filter((e) => e.title.toLowerCase().includes(q) || e.sub.toLowerCase().includes(q)).slice(0, 30);
    }, [all, query]);

    useEffect(() => {
        setCursor(0);
    }, [query]);

    useEffect(() => {
        listRef.current?.querySelector<HTMLElement>(`[data-idx="${cursor}"]`)?.scrollIntoView({block: "nearest"});
    }, [cursor]);

    const pick = (e: Entry | undefined) => {
        if (!e) return;
        onClose();
        openUrl(e.url, navigate);
    };

    return <Modal open={open} onCancel={onClose} footer={null} closable={false} width={560}
                  className="pf-palette" styles={{content: {padding: 0}}} destroyOnClose>
        <div className="pf-palette-input">
            <SearchOutlined/>
            <input ref={inputRef} value={query} placeholder="搜应用、桌面、Todone 清单"
                   onChange={(e) => setQuery(e.target.value)}
                   onKeyDown={(e) => {
                       if (e.key === "ArrowDown") {
                           e.preventDefault();
                           setCursor((c) => Math.min(c + 1, results.length - 1));
                       } else if (e.key === "ArrowUp") {
                           e.preventDefault();
                           setCursor((c) => Math.max(c - 1, 0));
                       } else if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                           pick(results[cursor]);
                       }
                   }}/>
        </div>
        <div className="pf-palette-list" ref={listRef}>
            {results.length === 0 && <div className="pf-palette-empty">没有匹配的结果</div>}
            {results.map((e, i) => <button key={e.key} data-idx={i}
                                            className={`pf-palette-item${i === cursor ? " is-active" : ""}`}
                                            onMouseMove={() => setCursor(i)} onClick={() => pick(e)}>
                {e.icon}
                <span className="pf-palette-title">{e.title}</span>
                <span className="pf-palette-sub">{e.sub}</span>
            </button>)}
        </div>
    </Modal>;
}
