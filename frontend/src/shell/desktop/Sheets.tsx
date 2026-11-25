import {KeyboardEvent, useEffect, useState} from "react";
import {Button, Input, Modal} from "antd";
import {PlusOutlined} from "@ant-design/icons";
import {APPS, appById, canUseApp} from "../apps";
import {AppGlyph, LinkGlyph} from "../AppTile";
import {useRecents} from "../recents";
import {useAuth} from "../../common/loginCtx";
import {WIDGETS} from "./Widgets";
import {
    addLink,
    addWidget,
    DesktopItem,
    DesktopLayout,
    DOCK_MAX,
    isOnDesktop,
    patchLink,
    removeItem,
    restoreApp,
    setWallpaper,
    toggleDock,
    WALLPAPERS,
} from "./store";
import {ItemGlyph, itemTitle} from "./Tile";

// 站内地址只保留路径部分；站外地址补上 https://
export function normalizeUrl(raw: string): string | null {
    const s = raw.trim();
    if (!s) return null;
    if (s.startsWith("/")) return s;
    try {
        const u = new URL(/^[a-z]+:\/\//i.test(s) ? s : `https://${s}`);
        if (u.origin === window.location.origin) return u.pathname + u.search + u.hash;
        return u.toString();
    } catch {
        return null;
    }
}

export function ItemSheet({item, layout, onClose}: {
    item: DesktopItem | null;
    layout: DesktopLayout;
    onClose: () => void;
}) {
    const [title, setTitle] = useState("");
    const [url, setUrl] = useState("");
    const [icon, setIcon] = useState("");
    const [error, setError] = useState("");

    useEffect(() => {
        if (item?.kind === "link") {
            setTitle(item.title);
            setUrl(item.url);
            setIcon(item.icon ?? "");
        }
        setError("");
    }, [item]);

    if (!item) return null;
    const inDock = layout.dock.some((i) => i.id === item.id);
    const dockFull = !inDock && layout.dock.length >= DOCK_MAX;

    const save = () => {
        if (item.kind === "link") {
            const u = normalizeUrl(url);
            if (!title.trim()) return setError("名字不能为空");
            if (!u) return setError("网址格式不对");
            const iconUrl = icon.trim();
            if (iconUrl && !/^https?:\/\//i.test(iconUrl)) return setError("图标地址要以 http:// 或 https:// 开头");
            patchLink(item.id, {title: title.trim(), url: u, icon: u.startsWith("/") ? undefined : iconUrl || undefined});
        }
        onClose();
    };

    return <Modal open onCancel={onClose} title={null} footer={null} width={380} className="pf-sheet" centered>
        <div className="pf-sheet-head">
            <ItemGlyph item={item.kind === "link" ? {...item, title: title || item.title, url: url || item.url, icon: icon.trim() || undefined} : item}
                       size={56}/>
            <div className="pf-sheet-name">{item.kind === "app" ? itemTitle(item) : (title || item.title)}</div>
        </div>
        {item.kind === "link" && <div className="pf-sheet-form">
            <label>名字<Input value={title} onChange={(e) => setTitle(e.target.value)} onPressEnter={plainEnter(save)}/></label>
            <label>地址<Input value={url} onChange={(e) => setUrl(e.target.value)} onPressEnter={plainEnter(save)}/></label>
            {!url.trim().startsWith("/") &&
                <label>图标<Input value={icon} placeholder="不填自动用网站自己的图标" onChange={(e) => setIcon(e.target.value)}
                                  onPressEnter={plainEnter(save)}/></label>}
            {error && <div className="pf-sheet-error">{error}</div>}
        </div>}
        <div className="pf-sheet-actions">
            <Button disabled={dockFull} onClick={() => {
                toggleDock(item.id);
                onClose();
            }}>{inDock ? "移出 Dock" : dockFull ? `Dock 最多放 ${DOCK_MAX} 个` : "放进 Dock"}</Button>
            <Button danger onClick={() => {
                removeItem(item.id);
                onClose();
            }}>{item.kind === "app" ? "从桌面移除" : "删除"}</Button>
            {item.kind === "link" && <Button type="primary" onClick={save}>保存</Button>}
        </div>
    </Modal>;
}

export function AddSheet({open, layout, onClose}: { open: boolean; layout: DesktopLayout; onClose: () => void }) {
    const auth = useAuth();
    const recents = useRecents();
    const [title, setTitle] = useState("");
    const [url, setUrl] = useState("");
    const [error, setError] = useState("");

    useEffect(() => {
        if (open) {
            setTitle("");
            setUrl("");
            setError("");
        }
    }, [open]);

    const recentPages = recents.filter((r) => {
        const app = appById(r.appId);
        return app && r.path !== app.basePath && !isOnDesktop(layout, r.path);
    });
    const hidden = layout.hiddenApps
        .map(appById)
        .filter((a): a is NonNullable<typeof a> => !!a && canUseApp(a, (p) => auth.loginInfo.hasPermission(p)));
    const placedApps = new Set([...layout.grid, ...layout.dock].flatMap((i) => i.kind === "app" ? [i.appId] : []));
    const neverPlaced = APPS.filter((a) => a.hiddenByDefault && !placedApps.has(a.id) && !layout.hiddenApps.includes(a.id)
        && canUseApp(a, (p) => auth.loginInfo.hasPermission(p)));

    const missingWidgets = WIDGETS.filter((w) => {
        const app = appById(w.appId);
        return !layout.widgets.includes(w.id) && !!app && canUseApp(app, (p) => auth.loginInfo.hasPermission(p));
    });

    const addUrl = () => {
        const u = normalizeUrl(url);
        if (!u) return setError("网址格式不对");
        let name = title.trim();
        if (!name) {
            try {
                name = u.startsWith("/") ? u : new URL(u).hostname.replace(/^www\./, "");
            } catch {
                name = u;
            }
        }
        addLink(name, u);
        onClose();
    };

    return <Modal open={open} onCancel={onClose} title="添加到桌面" footer={null} width={440} className="pf-sheet">
        {recentPages.length > 0 && <section className="pf-add-section">
            <div className="pf-add-label">最近打开的页面</div>
            {recentPages.map((r) => <div key={r.path} className="pf-add-row">
                <LinkGlyph title={r.title} url={r.path} size={32}/>
                <span className="pf-add-text">{r.title}<small>{appById(r.appId)?.name}</small></span>
                <Button size="small" icon={<PlusOutlined/>} onClick={() => addLink(r.title, r.path)}>添加</Button>
            </div>)}
        </section>}
        {(hidden.length > 0 || neverPlaced.length > 0) && <section className="pf-add-section">
            <div className="pf-add-label">没放在桌面上的应用</div>
            {[...hidden, ...neverPlaced].map((a) => <div key={a.id} className="pf-add-row">
                <AppGlyph app={a} size={32}/>
                <span className="pf-add-text">{a.name}</span>
                <Button size="small" icon={<PlusOutlined/>} onClick={() => restoreApp(a.id)}>添加</Button>
            </div>)}
        </section>}
        {missingWidgets.length > 0 && <section className="pf-add-section">
            <div className="pf-add-label">小组件</div>
            {missingWidgets.map((w) => {
                const app = appById(w.appId)!;
                return <div key={w.id} className="pf-add-row">
                    <AppGlyph app={app} size={32}/>
                    <span className="pf-add-text">{w.name}<small>{app.name}</small></span>
                    <Button size="small" icon={<PlusOutlined/>} onClick={() => addWidget(w.id)}>添加</Button>
                </div>;
            })}
        </section>}
        <section className="pf-add-section">
            <div className="pf-add-label">网址</div>
            <div className="pf-sheet-form">
                <Input placeholder="名字（可不填）" value={title} onChange={(e) => setTitle(e.target.value)}/>
                <Input placeholder="https://… 或站内地址 /todone/g/12" value={url}
                       onChange={(e) => {
                           setUrl(e.target.value);
                           setError("");
                       }} onPressEnter={plainEnter(addUrl)}/>
                {error && <div className="pf-sheet-error">{error}</div>}
                <Button type="primary" onClick={addUrl} disabled={!url.trim()}>添加</Button>
            </div>
        </section>
    </Modal>;
}

// 选壁纸：点一下立刻换，弹窗不关，方便来回比较
export function WallpaperSheet({open, layout, onClose}: { open: boolean; layout: DesktopLayout; onClose: () => void }) {
    const current = layout.wallpaper ?? "girl";
    return <Modal open={open} onCancel={onClose} title="壁纸" footer={null} width={440} className="pf-sheet">
        <div className="pf-wall-options">
            {WALLPAPERS.map((w) => <button key={w.id} className={`pf-wall-option${w.id === current ? " is-on" : ""}`}
                                           onClick={() => setWallpaper(w.id)}>
                <span className={`pf-wall-preview wall-${w.id}`}><i/></span>
                <span className="pf-wall-name">{w.name}</span>
            </button>)}
        </div>
    </Modal>;
}

// 只认单独的回车：⌘/Ctrl+回车由外壳统一点弹窗的主按钮，这里再处理就会提交两次
function plainEnter(fn: () => void) {
    return (e: KeyboardEvent<HTMLInputElement>) => {
        if (!e.metaKey && !e.ctrlKey) fn();
    };
}
