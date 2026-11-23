import {useEffect, useMemo, useState} from "react";
import {useNavigate} from "react-router-dom";
import {Dropdown} from "antd";
import {LogoutOutlined, PlusOutlined, SearchOutlined} from "@ant-design/icons";
import {
    closestCenter,
    DndContext,
    DragEndEvent,
    KeyboardSensor,
    PointerSensor,
    TouchSensor,
    useSensor,
    useSensors,
} from "@dnd-kit/core";
import {horizontalListSortingStrategy, rectSortingStrategy, SortableContext} from "@dnd-kit/sortable";
import {useAuth} from "../../common/loginCtx";
import {useIsMobile} from "../../common/breakpoints";
import {useAppActive} from "../runtime";
import {appById, canUseApp} from "../apps";
import {DesktopItem, loadDesktop, removeItem, reorder, useDesktopLayout, visibleItems} from "./store";
import {Tile} from "./Tile";
import {Widgets} from "./Widgets";
import {AddSheet, ItemSheet} from "./Sheets";

const WEEK = ["日", "一", "二", "三", "四", "五", "六"];

function useToday() {
    const [now, setNow] = useState(() => new Date());
    useEffect(() => {
        // 跨过零点时更新日期
        const next = new Date(now);
        next.setHours(24, 0, 1, 0);
        const t = window.setTimeout(() => setNow(new Date()), next.getTime() - now.getTime());
        return () => window.clearTimeout(t);
    }, [now]);
    return now;
}

export function Desktop({onSearch}: { onSearch: () => void }) {
    const auth = useAuth();
    const navigate = useNavigate();
    const isMobile = useIsMobile();
    const layout = useDesktopLayout();
    const today = useToday();
    const [editing, setEditing] = useState(false);
    const [editItem, setEditItem] = useState<DesktopItem | null>(null);
    const [adding, setAdding] = useState(false);
    const [refreshKey, setRefreshKey] = useState(0);
    const user = auth.loginInfo.usr;

    useEffect(() => {
        if (user) void loadDesktop(user);
    }, [user]);

    // 从应用切回桌面、或者整个页面回到前台时，刷新小卡片和布局
    useAppActive(() => {
        setRefreshKey((k) => k + 1);
        if (user) void loadDesktop(user);
    });
    useEffect(() => {
        const onVisible = () => document.visibilityState === "visible" && setRefreshKey((k) => k + 1);
        document.addEventListener("visibilitychange", onVisible);
        return () => document.removeEventListener("visibilitychange", onVisible);
    }, []);

    useEffect(() => {
        if (!editing) return;
        const onKey = (e: KeyboardEvent) => e.key === "Escape" && setEditing(false);
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [editing]);

    const sensors = useSensors(
        useSensor(PointerSensor, {activationConstraint: {distance: 6}}),
        useSensor(TouchSensor, {activationConstraint: {delay: 120, tolerance: 6}}),
        useSensor(KeyboardSensor),
    );

    const canUse = useMemo(() => (app: Parameters<typeof canUseApp>[0]) =>
        canUseApp(app, (p) => auth.loginInfo.hasPermission(p)), [auth.loginInfo]);
    const grid = layout ? visibleItems(layout.grid, canUse) : [];
    const dock = layout ? visibleItems(layout.dock, canUse) : [];

    const open = (item: DesktopItem) => {
        if (item.kind === "app") {
            const app = appById(item.appId);
            if (app) navigate(app.basePath);
            return;
        }
        if (item.url.startsWith("/")) navigate(item.url);
        else window.open(item.url, "_blank", "noopener");
    };

    const onDragEnd = (area: "grid" | "dock") => (e: DragEndEvent) => {
        if (e.over && e.active.id !== e.over.id) reorder(area, String(e.active.id), String(e.over.id));
    };

    const tileSize = isMobile ? 58 : 64;
    const renderTile = (item: DesktopItem, inDock: boolean) => <Tile
        key={item.id}
        item={item}
        size={tileSize}
        editing={editing}
        showLabel={!inDock}
        onOpen={() => open(item)}
        onEdit={() => setEditItem(item)}
        onStartEditing={() => setEditing(true)}
        onRemove={() => removeItem(item.id)}
    />;

    return <div className={`pf-desktop${editing ? " is-editing" : ""}`}
                onClick={(e) => {
                    // 编辑时点空白处结束编辑
                    if (editing && e.target === e.currentTarget) setEditing(false);
                }}>
        <header className="pf-desk-top">
            <div className="pf-desk-date">
                <span className="pf-desk-day">{today.getMonth() + 1}月{today.getDate()}日</span>
                <span className="pf-desk-week">星期{WEEK[today.getDay()]}</span>
            </div>
            <div className="pf-desk-tools">
                {editing ? <>
                    <button className="pf-chip" onClick={() => setAdding(true)}><PlusOutlined/>添加</button>
                    <button className="pf-chip is-primary" onClick={() => setEditing(false)}>完成</button>
                </> : <>
                    <button className="pf-chip pf-search-chip" onClick={onSearch}>
                        <SearchOutlined/>{!isMobile && <>搜索<kbd>⌘K</kbd></>}
                    </button>
                    <Dropdown trigger={["click"]} placement="bottomRight" menu={{
                        items: [
                            {key: "user", label: user, disabled: true},
                            {type: "divider"},
                            {key: "edit", label: "编辑桌面", onClick: () => setEditing(true)},
                            {key: "add", label: "添加到桌面", onClick: () => setAdding(true)},
                            {type: "divider"},
                            {key: "logout", label: "退出登录", icon: <LogoutOutlined/>, danger: true, onClick: () => void auth.onLogout()},
                        ],
                    }}>
                        <button className="pf-avatar" aria-label="账号">{Array.from(user)[0]?.toUpperCase()}</button>
                    </Dropdown>
                </>}
            </div>
        </header>

        {!editing && <Widgets refreshKey={refreshKey}/>}

        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd("grid")}>
            <SortableContext items={grid.map((i) => i.id)} strategy={rectSortingStrategy}>
                <div className="pf-grid" onClick={(e) => {
                    if (editing && e.target === e.currentTarget) setEditing(false);
                }}>
                    {grid.map((i) => renderTile(i, false))}
                    {editing && <div className="pf-icon">
                        <button className="pf-icon-btn" onClick={() => setAdding(true)}>
                            <span className="pf-tile pf-tile-add" style={{width: tileSize, height: tileSize}}><PlusOutlined/></span>
                            <span className="pf-icon-label">添加</span>
                        </button>
                    </div>}
                </div>
            </SortableContext>
        </DndContext>

        {(dock.length > 0 || editing) && <DndContext sensors={sensors} collisionDetection={closestCenter}
                                                     onDragEnd={onDragEnd("dock")}>
            <SortableContext items={dock.map((i) => i.id)} strategy={horizontalListSortingStrategy}>
                <nav className="pf-dock">
                    {dock.map((i) => renderTile(i, true))}
                    {dock.length === 0 && <span className="pf-dock-hint">点图标选“放进 Dock”</span>}
                </nav>
            </SortableContext>
        </DndContext>}

        {layout && <ItemSheet item={editItem} layout={layout} onClose={() => setEditItem(null)}/>}
        {layout && <AddSheet open={adding} layout={layout} onClose={() => setAdding(false)}/>}
    </div>;
}
