import {ReactNode, useEffect, useMemo, useState} from "react";
import {useNavigate} from "react-router-dom";
import {Dropdown, message} from "antd";
import {LogoutOutlined, PlusOutlined, SearchOutlined} from "@ant-design/icons";
import {
    closestCenter,
    DndContext,
    CollisionDetection,
    DragEndEvent,
    DragOverEvent,
    KeyboardSensor,
    pointerWithin,
    PointerSensor,
    TouchSensor,
    useDroppable,
    useSensor,
    useSensors,
} from "@dnd-kit/core";
import {horizontalListSortingStrategy, rectSortingStrategy, SortableContext} from "@dnd-kit/sortable";
import {useAuth} from "../../common/loginCtx";
import {useIsMobile} from "../../common/breakpoints";
import {useAppActive} from "../runtime";
import {AppDef, appById, canUseApp} from "../apps";
import {AppGlyph} from "../AppTile";
import {useRecents} from "../recents";
import {DesktopItem, DOCK_MAX, loadDesktop, moveItem, removeItem, reorder, useDesktopLayout, visibleItems} from "./store";
import {Tile} from "./Tile";
import {useDesktopData, Widgets} from "./Widgets";
import {AddSheet, ItemSheet} from "./Sheets";

const WEEK = ["日", "一", "二", "三", "四", "五", "六"];

// 优先看手指正下方是哪个图标或哪一栏；不在任何东西上面时退回到“离得最近的”
const pointerFirst: CollisionDetection = (args) => {
    const hits = pointerWithin(args);
    return hits.length > 0 ? hits : closestCenter(args);
};
type Area = "grid" | "dock";

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

// 图标区和 Dock 都要能接住拖过来的图标（Dock 空着时也要能放进去）
function DropArea({id, className, highlight, children, onBlankClick}: {
    id: Area;
    className: string;
    highlight: boolean;
    children: ReactNode;
    onBlankClick?: () => void;
}) {
    const {setNodeRef} = useDroppable({id});
    return <div ref={setNodeRef} className={`${className}${highlight ? " is-over" : ""}`}
                onClick={(e) => {
                    if (e.target === e.currentTarget) onBlankClick?.();
                }}>{children}</div>;
}

export function Desktop({onSearch}: { onSearch: () => void }) {
    const auth = useAuth();
    const navigate = useNavigate();
    const isMobile = useIsMobile();
    const layout = useDesktopLayout();
    const recents = useRecents();
    const today = useToday();
    const [editing, setEditing] = useState(false);
    const [editItem, setEditItem] = useState<DesktopItem | null>(null);
    const [adding, setAdding] = useState(false);
    const [refreshKey, setRefreshKey] = useState(0);
    // 第一次显示桌面时图标依次浮现，之后从应用切回来不再播
    const [entering, setEntering] = useState(true);
    // 拖到另一栏上方时高亮那一栏（只记状态，不挪图标）
    const [dropTarget, setDropTarget] = useState<Area | null>(null);
    const user = auth.loginInfo.usr;

    const canUse = useMemo(() => (app: AppDef) =>
        canUseApp(app, (p) => auth.loginInfo.hasPermission(p)), [auth.loginInfo]);
    const can = useMemo(() => ({
        todone: !!appById("todone") && canUse(appById("todone")!),
        money: !!appById("money") && canUse(appById("money")!),
        isAdmin: auth.loginInfo.hasPermission("admin"),
    }), [canUse, auth.loginInfo]);
    const data = useDesktopData(user, refreshKey, can);

    useEffect(() => {
        if (user) void loadDesktop(user);
    }, [user]);

    useEffect(() => {
        const t = window.setTimeout(() => setEntering(false), 900);
        return () => window.clearTimeout(t);
    }, []);

    // 从应用切回桌面、或者整个页面回到前台时，刷新小卡片、角标和布局
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

    const grid = layout ? visibleItems(layout.grid, canUse) : [];
    const dock = layout ? visibleItems(layout.dock, canUse) : [];
    const widgetIds = (layout?.widgets ?? []).filter((id) => {
        const app = id === "today" ? appById("todone") : id === "books" ? appById("money") : undefined;
        return !!app && canUse(app);
    });

    // Dock 右侧：最近用过、但没放进 Dock 的应用。手机上整条 Dock 最多 5 个
    const dockAppIds = new Set(dock.flatMap((i) => i.kind === "app" ? [i.appId] : []));
    const recentLimit = isMobile ? Math.max(0, Math.min(3, 5 - dock.length)) : 3;
    const dockRecents = recents
        .filter((r) => !dockAppIds.has(r.appId) && appById(r.appId) && canUse(appById(r.appId)!))
        .slice(0, recentLimit);

    const badgeFor = (item: DesktopItem): number | undefined => {
        if (!data.today) return undefined;
        if (item.kind === "app") return item.appId === "todone" ? data.today.overdue || undefined : undefined;
        return data.today.overdueByPath[item.url];
    };

    const open = (item: DesktopItem) => {
        if (item.kind === "app") {
            const app = appById(item.appId);
            if (app) navigate(app.basePath);
            return;
        }
        if (item.url.startsWith("/")) navigate(item.url);
        else window.open(item.url, "_blank", "noopener");
    };

    // 拖动：拖的过程中图标跟着手指走、目标栏高亮；松手时再决定放到哪一栏的哪个位置。
    // （拖动途中就把图标挪到另一栏，碰撞判断会在两栏之间来回跳，造成死循环）
    const areaOf = (id: string): Area | undefined => {
        if (id === "grid" || id === "dock") return id;
        if (layout?.dock.some((i) => i.id === id)) return "dock";
        if (layout?.grid.some((i) => i.id === id)) return "grid";
        return undefined;
    };
    const onDragOver = ({active, over}: DragOverEvent) => {
        const from = areaOf(String(active.id));
        const to = over ? areaOf(String(over.id)) : undefined;
        setDropTarget(to && to !== from ? to : null);
    };
    const onDragEnd = ({active, over}: DragEndEvent) => {
        setDropTarget(null);
        if (!over || !layout) return;
        const id = String(active.id);
        const from = areaOf(id);
        const to = areaOf(String(over.id));
        if (!from || !to) return;
        if (from === to) {
            if (over.id !== to && active.id !== over.id) reorder(to, id, String(over.id));
            return;
        }
        if (to === "dock" && layout.dock.length >= DOCK_MAX) {
            message.info(`Dock 最多放 ${DOCK_MAX} 个`);
            return;
        }
        const list = layout[to];
        const index = over.id === to ? list.length : list.findIndex((i) => i.id === over.id);
        moveItem(id, to, index < 0 ? list.length : index);
    };

    const tileSize = isMobile ? 58 : 64;
    // 手机上 Dock 要放下 5 个图标加一条分隔线，图标小一号
    const dockTileSize = isMobile ? 50 : 64;
    const renderTile = (item: DesktopItem, area: Area, index: number) => <Tile
        key={item.id}
        item={item}
        area={area}
        index={index}
        size={area === "dock" ? dockTileSize : tileSize}
        editing={editing}
        showLabel={area === "grid"}
        badge={badgeFor(item)}
        onOpen={() => open(item)}
        onEdit={() => setEditItem(item)}
        onStartEditing={() => setEditing(true)}
        onRemove={() => removeItem(item.id)}
    />;

    const stopEditing = () => setEditing(false);

    return <div className={`pf-desktop${editing ? " is-editing" : ""}${entering ? " is-entering" : ""}`}
                onClick={(e) => {
                    // 编辑时点空白处结束编辑
                    if (editing && e.target === e.currentTarget) stopEditing();
                }}>
        <header className="pf-desk-top">
            <div className="pf-desk-date">
                <span className="pf-desk-day">{today.getMonth() + 1}月{today.getDate()}日</span>
                <span className="pf-desk-week">星期{WEEK[today.getDay()]}</span>
            </div>
            <div className="pf-desk-tools">
                {editing ? <>
                    <button className="pf-chip" onClick={() => setAdding(true)}><PlusOutlined/>添加</button>
                    <button className="pf-chip is-primary" onClick={stopEditing}>完成</button>
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

        <Widgets ids={widgetIds} data={data} editing={editing}/>

        <DndContext sensors={sensors} collisionDetection={pointerFirst} onDragOver={onDragOver} onDragEnd={onDragEnd}
                    onDragCancel={() => setDropTarget(null)}>
            <SortableContext items={grid.map((i) => i.id)} strategy={rectSortingStrategy}>
                <DropArea id="grid" className="pf-grid" highlight={dropTarget === "grid"} onBlankClick={editing ? stopEditing : undefined}>
                    {grid.map((i, n) => renderTile(i, "grid", n))}
                    {editing && <div className="pf-icon">
                        <button className="pf-icon-btn" onClick={() => setAdding(true)}>
                            <span className="pf-tile pf-tile-add" style={{width: tileSize, height: tileSize}}><PlusOutlined/></span>
                            <span className="pf-icon-label">添加</span>
                        </button>
                    </div>}
                </DropArea>
            </SortableContext>

            {(dock.length > 0 || dockRecents.length > 0 || editing) &&
                <SortableContext items={dock.map((i) => i.id)} strategy={horizontalListSortingStrategy}>
                    <DropArea id="dock" className={`pf-dock${dock.length === 0 ? " is-empty" : ""}`} highlight={dropTarget === "dock"}>
                        {dock.map((i, n) => renderTile(i, "dock", n))}
                        {!editing && dockRecents.length > 0 && <>
                            {dock.length > 0 && <span className="pf-dock-sep"/>}
                            {dockRecents.map((r) => {
                                const app = appById(r.appId)!;
                                return <button key={r.appId} className="pf-dock-recent" title={r.title || app.name}
                                               aria-label={`打开${app.name}`} onClick={() => navigate(r.path)}>
                                    <AppGlyph app={app} size={dockTileSize}/>
                                </button>;
                            })}
                        </>}
                    </DropArea>
                </SortableContext>}
        </DndContext>

        {layout && <ItemSheet item={editItem} layout={layout} onClose={() => setEditItem(null)}/>}
        {layout && <AddSheet open={adding} layout={layout} onClose={() => setAdding(false)}/>}
    </div>;
}
