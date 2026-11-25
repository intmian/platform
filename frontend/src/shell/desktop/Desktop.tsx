import React, {ReactNode, useEffect, useMemo, useRef, useState} from "react";
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
import {
    DesktopItem,
    DOCK_MAX,
    loadDesktop,
    pinToDock,
    primeDesktop,
    removeItem,
    reorder,
    unpinFromDock,
    useDesktopLayout,
    visibleItems,
    Wallpaper,
} from "./store";
import {Tile} from "./Tile";
import {useDesktopData, Widgets} from "./Widgets";
import {AddSheet, ItemSheet, WallpaperSheet} from "./Sheets";

const WEEK = ["日", "一", "二", "三", "四", "五", "六"];

// 优先看手指正下方是哪个图标或哪一栏；不在任何东西上面时退回到“离得最近的”
const pointerFirst: CollisionDetection = (args) => {
    const hits = pointerWithin(args);
    return hits.length > 0 ? hits : closestCenter(args);
};
type Area = "grid" | "dock";

// 搜索快捷键的提示：苹果设备是 ⌘K，其他（Windows 等）是 Ctrl K
const IS_APPLE = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
const SEARCH_KEY = IS_APPLE ? "⌘K" : "Ctrl K";

// 同一个图标可以同时在桌面和 Dock 里，拖动时要区分是哪一个，所以 Dock 里的加个前缀
const DOCK_PREFIX = "dock:";
const dockSortId = (id: string) => DOCK_PREFIX + id;
const itemIdOf = (sortId: string) => sortId.startsWith(DOCK_PREFIX) ? sortId.slice(DOCK_PREFIX.length) : sortId;

// 按时段换壁纸的光线和问候语
type DayPart = "morning" | "day" | "dusk" | "night";
const GREETING: Record<DayPart, string> = {morning: "早上好", day: "下午好", dusk: "傍晚好", night: "晚上好"};

function dayPart(d: Date): DayPart {
    const h = d.getHours();
    if (h >= 5 && h < 11) return "morning";
    if (h >= 11 && h < 17) return "day";
    if (h >= 17 && h < 20) return "dusk";
    return "night";
}

// 壁纸插画是 CSS 里的遮罩图（见 shell.css 的 .pf-desk-art），图片比页面晚到时会在动画放完后突然冒出来，
// 所以入场前先把它下载好。地址要和 CSS 里的保持一致
const WALL_ART: Record<Wallpaper, string | null> = {girl: "/desk/girl.png", cat: "/desk/cat.png", none: null};

function useImageReady(src: string | null) {
    const [loaded, setLoaded] = useState<string | null>(null);
    useEffect(() => {
        if (!src) return;
        const img = new Image();
        // 加载失败也算好了，不让一张图卡住整个桌面
        img.onload = img.onerror = () => setLoaded(src);
        img.src = src;
    }, [src]);
    return !src || loaded === src;
}

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
    primeDesktop(auth.loginInfo.usr);
    const layout = useDesktopLayout();
    const recents = useRecents();
    const today = useToday();
    const [editing, setEditing] = useState(false);
    const [editItem, setEditItem] = useState<DesktopItem | null>(null);
    const [adding, setAdding] = useState(false);
    const [pickingWall, setPickingWall] = useState(false);
    const [refreshKey, setRefreshKey] = useState(0);
    // 第一次显示桌面的入场：先只放壁纸（waiting），等布局和小组件数据都到了，
    // 内容再一次性浮现（entering），播完就结束（done）；之后从应用切回来不再播
    const [intro, setIntro] = useState<"waiting" | "entering" | "done">("waiting");
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

    // 数据和壁纸插画都到了就开播；网慢时最多等 1.2 秒，不让人一直对着空壁纸
    const wallpaper = layout?.wallpaper ?? "girl";
    const artReady = useImageReady(WALL_ART[wallpaper]);
    const dataReady = data.today !== undefined && data.books !== undefined;
    const startIntro = () => setIntro((s) => s === "waiting" ? "entering" : s);
    useEffect(() => {
        if (layout && dataReady && artReady) startIntro();
    }, [layout, dataReady, artReady]);
    useEffect(() => {
        const t = window.setTimeout(startIntro, 1200);
        return () => window.clearTimeout(t);
    }, []);
    // 要比最慢的那段入场动画长（最后一个图标约 1 秒），提前去掉 class 会让动画中途跳到终点
    useEffect(() => {
        if (intro !== "entering") return;
        const t = window.setTimeout(() => setIntro("done"), 1200);
        return () => window.clearTimeout(t);
    }, [intro]);

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

    // 应用在前，快捷方式和网址在后面另起一行（两组各自保持用户排的顺序）
    const gridAll = layout ? visibleItems(layout.grid, canUse) : [];
    const grid = [...gridAll.filter((i) => i.kind === "app"), ...gridAll.filter((i) => i.kind === "link")];
    const firstLinkId = grid.find((i) => i.kind === "link")?.id;
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

    // 拖动：拖的过程中图标跟着手指走、目标栏高亮；松手时再决定。
    // 桌面图标拖进 Dock = 钉一份到 Dock（桌面上的还在）；Dock 里的拖回桌面 = 从 Dock 取下。
    // （拖动途中就改布局，碰撞判断会在两栏之间来回跳，造成死循环）
    const areaOf = (sortId: string): Area | undefined => {
        if (sortId === "grid" || sortId === "dock") return sortId;
        return sortId.startsWith(DOCK_PREFIX) ? "dock" : "grid";
    };
    const onDragOver = ({active, over}: DragOverEvent) => {
        const from = areaOf(String(active.id));
        const to = over ? areaOf(String(over.id)) : undefined;
        setDropTarget(to && to !== from ? to : null);
    };
    const onDragEnd = ({active, over}: DragEndEvent) => {
        setDropTarget(null);
        if (!over || !layout) return;
        const from = areaOf(String(active.id));
        const to = areaOf(String(over.id));
        const id = itemIdOf(String(active.id));
        const overId = itemIdOf(String(over.id));
        if (!from || !to) return;
        if (from === to) {
            if (over.id === to || active.id === over.id) return;
            // 桌面上应用和链接分两组显示，只在组内排序
            const kind = (x: string) => layout.grid.find((i) => i.id === x)?.kind;
            if (to === "grid" && kind(id) !== kind(overId)) return;
            reorder(to, id, overId);
            return;
        }
        if (to === "grid") {
            unpinFromDock(id);
            return;
        }
        const already = layout.dock.some((i) => i.id === id);
        if (!already && layout.dock.length >= DOCK_MAX) {
            message.info(`Dock 最多放 ${DOCK_MAX} 个`);
            return;
        }
        const index = over.id === "dock" ? layout.dock.length : layout.dock.findIndex((i) => i.id === overId);
        pinToDock(id, index < 0 ? layout.dock.length : index);
    };

    const tileSize = isMobile ? 58 : 64;
    // 手机上 Dock 要放下 5 个图标加一条分隔线，图标小一号
    const dockTileSize = isMobile ? 50 : 64;
    const renderTile = (item: DesktopItem, area: Area, index: number) => <Tile
        key={item.id}
        sortId={area === "dock" ? dockSortId(item.id) : item.id}
        rowStart={area === "grid" && item.id === firstLinkId && grid[0]?.id !== firstLinkId}
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
        onRemove={() => area === "dock" ? unpinFromDock(item.id) : removeItem(item.id)}
    />;

    const stopEditing = () => setEditing(false);
    const blankPress = useBlankLongPress(editing, () => setEditing(true));

    const part = dayPart(new Date());

    return <div className={`pf-desktop is-${part} wall-${wallpaper}${editing ? " is-editing" : ""}${intro !== "done" ? ` is-${intro}` : ""}`}
                {...blankPress}
                onClick={(e) => {
                    // 编辑时点空白处结束编辑
                    if (editing && e.target === e.currentTarget) stopEditing();
                }}>
        <div className="pf-desk-art" aria-hidden/>
        <header className="pf-desk-top">
            <div className="pf-desk-date">
                <span className="pf-desk-greet">{GREETING[part]}</span>
                <span className="pf-desk-day">{today.getMonth() + 1}月{today.getDate()}日<span className="pf-desk-week">星期{WEEK[today.getDay()]}</span></span>
            </div>
            <div className="pf-desk-tools">
                {editing ? <>
                    <button className="pf-chip" onClick={() => setAdding(true)}><PlusOutlined/>添加</button>
                    <button className="pf-chip is-primary" onClick={stopEditing}>完成</button>
                </> : <>
                    <button className="pf-chip pf-search-chip" onClick={onSearch}>
                        <SearchOutlined/>{!isMobile && <>搜索<kbd>{SEARCH_KEY}</kbd></>}
                    </button>
                    <Dropdown trigger={["click"]} placement="bottomRight" menu={{
                        items: [
                            {key: "user", label: user, disabled: true},
                            {type: "divider"},
                            {key: "edit", label: "编辑桌面", onClick: () => setEditing(true)},
                            {key: "add", label: "添加到桌面", onClick: () => setAdding(true)},
                            {key: "wall", label: "壁纸", onClick: () => setPickingWall(true)},
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
                <SortableContext items={dock.map((i) => dockSortId(i.id))} strategy={horizontalListSortingStrategy}>
                    <DropArea id="dock" className={`pf-dock${dock.length === 0 ? " is-empty" : ""}`} highlight={dropTarget === "dock"}>
                        {dock.map((i, n) => renderTile(i, "dock", n))}
                        {dockRecents.length > 0 && <>
                            {dock.length > 0 && <span className="pf-dock-sep"/>}
                            {dockRecents.map((r) => <RecentTile key={r.appId} appId={r.appId} title={r.title}
                                                                size={dockTileSize} editing={editing}
                                                                onOpen={() => navigate(r.path)}
                                                                onStartEditing={() => setEditing(true)}/>)}
                        </>}
                    </DropArea>
                </SortableContext>}
        </DndContext>

        {layout && <ItemSheet item={editItem} layout={layout} onClose={() => setEditItem(null)}/>}
        {layout && <AddSheet open={adding} layout={layout} onClose={() => setAdding(false)}/>}
        {layout && <WallpaperSheet open={pickingWall} layout={layout} onClose={() => setPickingWall(false)}/>}
    </div>;
}

// Dock 右边的最近应用。点一下回到上次那一页；长按或右键和别的图标一样进入编辑（编辑时它不能拖、也不能删，会自己滚动）
function RecentTile({appId, title, size, editing, onOpen, onStartEditing}: {
    appId: string;
    title: string;
    size: number;
    editing: boolean;
    onOpen: () => void;
    onStartEditing: () => void;
}) {
    const app = appById(appId)!;
    const timer = useRef<number>();
    const longPressed = useRef(false);
    return <div className={`pf-icon pf-dock-recent${editing ? " is-editing" : ""}`}>
        <button className="pf-icon-btn" title={title || app.name} aria-label={`打开${app.name}`}
                onContextMenu={(e) => {
                    e.preventDefault();
                    if (!editing) onStartEditing();
                }}
                onPointerDown={(e) => {
                    if (editing || e.pointerType === "mouse") return;
                    longPressed.current = false;
                    timer.current = window.setTimeout(() => {
                        longPressed.current = true;
                        navigator.vibrate?.(8);
                        onStartEditing();
                    }, 500);
                }}
                onPointerUp={() => window.clearTimeout(timer.current)}
                onPointerCancel={() => window.clearTimeout(timer.current)}
                onClick={() => {
                    if (longPressed.current) {
                        longPressed.current = false;
                        return;
                    }
                    if (!editing) onOpen();
                }}>
            <AppGlyph app={app} size={size}/>
        </button>
    </div>;
}

// 在桌面空白处、Dock 空白处、小组件上长按（电脑上右键）进入编辑。图标自己处理长按，这里跳过按钮和输入框。
function useBlankLongPress(editing: boolean, onStart: () => void) {
    const timer = useRef<number>();
    const start = useRef<{ x: number; y: number } | null>(null);
    const fired = useRef(false);
    // 弹窗、下拉菜单挂在 body 上，但 React 事件照样会冒泡到这里，用 DOM 位置排除掉
    const skip = (e: React.SyntheticEvent) => {
        const t = e.target;
        return !(t instanceof Element) || !e.currentTarget.contains(t) || !!t.closest("button, a, input, textarea");
    };
    const cancel = () => {
        window.clearTimeout(timer.current);
        start.current = null;
    };
    return {
        onContextMenu: (e: React.MouseEvent) => {
            if (editing || skip(e)) return;
            e.preventDefault();
            onStart();
        },
        onPointerDown: (e: React.PointerEvent) => {
            fired.current = false;
            if (editing || e.pointerType === "mouse" || skip(e)) return;
            start.current = {x: e.clientX, y: e.clientY};
            timer.current = window.setTimeout(() => {
                fired.current = true;
                navigator.vibrate?.(8);
                onStart();
            }, 500);
        },
        onPointerMove: (e: React.PointerEvent) => {
            // 手指在滑动页面就不算长按
            if (start.current && Math.hypot(e.clientX - start.current.x, e.clientY - start.current.y) > 8) cancel();
        },
        onPointerUp: cancel,
        onPointerCancel: cancel,
        // 长按小组件进入编辑后，松手的那一下不要再当成点击打开应用
        onClickCapture: (e: React.MouseEvent) => {
            if (fired.current) {
                fired.current = false;
                e.stopPropagation();
            }
        },
    };
}
