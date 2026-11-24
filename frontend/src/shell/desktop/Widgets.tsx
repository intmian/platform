import {ReactNode, useEffect, useState} from "react";
import {useNavigate} from "react-router-dom";
import {MinusOutlined, RightOutlined} from "@ant-design/icons";
import {closestCenter, DndContext, DragEndEvent, PointerSensor, TouchSensor, useSensor, useSensors} from "@dnd-kit/core";
import {rectSortingStrategy, SortableContext, useSortable} from "@dnd-kit/sortable";
import {CSS} from "@dnd-kit/utilities";
import type {TodayDigest} from "../../todone/shellApi";
import type {BookDigest} from "../../money/shellApi";
import {removeWidget, reorderWidgets} from "./store";

// 桌面小组件。每个组件属于一个应用，没有那个应用的权限就不显示。
export interface WidgetDef {
    id: string;
    name: string;
    appId: string;
}

export const WIDGETS: WidgetDef[] = [
    {id: "today", name: "今天", appId: "todone"},
    {id: "books", name: "账本", appId: "money"},
];

// undefined 表示还在加载；null 表示加载失败或没有权限
export interface DesktopData {
    today: TodayDigest | null | undefined;
    books: BookDigest[] | null | undefined;
}

// 小组件和图标角标共用的数据：桌面出现后再取，切回桌面时刷新
export function useDesktopData(user: string, refreshKey: number, can: { todone: boolean; money: boolean; isAdmin: boolean }): DesktopData {
    const [today, setToday] = useState<TodayDigest | null | undefined>(undefined);
    const [books, setBooks] = useState<BookDigest[] | null | undefined>(undefined);

    useEffect(() => {
        if (!user || !can.todone) {
            setToday(null);
            return;
        }
        let alive = true;
        import("../../todone/shellApi")
            .then((m) => m.loadTodayDigest(user))
            .then((d) => alive && setToday(d))
            .catch(() => alive && setToday(null));
        return () => {
            alive = false;
        };
    }, [user, can.todone, refreshKey]);

    useEffect(() => {
        if (!user || !can.money) {
            setBooks(null);
            return;
        }
        let alive = true;
        import("../../money/shellApi")
            .then((m) => m.loadBookDigest(can.isAdmin))
            .then((d) => alive && setBooks(d))
            .catch(() => alive && setBooks(null));
        return () => {
            alive = false;
        };
    }, [user, can.money, can.isAdmin, refreshKey]);

    return {today, books};
}

export function Widgets({ids, data, editing}: { ids: string[]; data: DesktopData; editing: boolean }) {
    const sensors = useSensors(
        useSensor(PointerSensor, {activationConstraint: {distance: 6}}),
        useSensor(TouchSensor, {activationConstraint: {delay: 120, tolerance: 6}}),
    );
    const onDragEnd = (e: DragEndEvent) => {
        if (e.over && e.active.id !== e.over.id) reorderWidgets(String(e.active.id), String(e.over.id));
    };
    if (ids.length === 0) return null;
    return <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={ids} strategy={rectSortingStrategy}>
            <div className={`pf-widgets${editing ? " is-editing" : ""}`}>
                {ids.map((id, i) => <WidgetSlot key={id} id={id} index={i} data={data} editing={editing}/>)}
            </div>
        </SortableContext>
    </DndContext>;
}

function WidgetSlot({id, index, data, editing}: { id: string; index: number; data: DesktopData; editing: boolean }) {
    const {attributes, listeners, setNodeRef, transform, transition, isDragging} = useSortable({id, disabled: !editing});
    const def = WIDGETS.find((w) => w.id === id);
    if (!def) return null;
    const body = id === "today" ? <TodayWidget data={data.today} editing={editing}/>
        : id === "books" ? <BooksWidget data={data.books} editing={editing}/> : null;
    // 平时没内容的组件不占位置；编辑时留一个框，方便拖动和移除
    if (!body && !editing) return null;
    return <div ref={setNodeRef}
                className={`pf-widget-slot${isDragging ? " is-dragging" : ""}`}
                style={{transform: CSS.Translate.toString(transform), transition, animationDelay: `${index * 50}ms`}}
                {...(editing ? attributes : {})}
                {...(editing ? listeners : {})}>
        {body ?? <WidgetFrame title={def.name} quiet>暂时没有内容</WidgetFrame>}
        {editing && <button className="pf-widget-remove" aria-label={`移除${def.name}`}
                            onPointerDown={(e) => e.stopPropagation()}
                            onClick={(e) => {
                                e.stopPropagation();
                                removeWidget(id);
                            }}><MinusOutlined/></button>}
    </div>;
}

function WidgetFrame({title, onOpen, quiet, children}: {
    title: string;
    onOpen?: () => void;
    quiet?: boolean;
    children: ReactNode;
}) {
    return <div className="pf-widget" role={onOpen ? "button" : undefined} onClick={onOpen}>
        <div className="pf-widget-head">
            <span>{title}</span>
            {onOpen && <RightOutlined/>}
        </div>
        {quiet ? <div className="pf-widget-quiet">{children}</div> : children}
    </div>;
}

function TodayWidget({data, editing}: { data: TodayDigest | null | undefined; editing: boolean }) {
    const navigate = useNavigate();
    if (data === undefined) return <WidgetSkeleton title="今天"/>;
    if (!data) return null;
    const open = editing ? undefined : () => navigate("/todone");
    if (data.overdue === 0 && data.today === 0) {
        return <WidgetFrame title="今天" onOpen={open} quiet>今天没有到期的事</WidgetFrame>;
    }
    return <WidgetFrame title="今天" onOpen={open}>
        <div className="pf-widget-stats">
            {data.overdue > 0 && <span className="is-bad"><b>{data.overdue}</b>逾期</span>}
            <span><b>{data.today}</b>今天</span>
        </div>
        <ul className="pf-widget-list">
            {data.items.slice(0, 4).map((it, i) => <li key={i} className={it.kind === "overdue" ? "is-bad" : ""}
                                                       onClick={(e) => {
                                                           if (editing) return;
                                                           e.stopPropagation();
                                                           navigate(it.path);
                                                       }}>{it.title}</li>)}
        </ul>
    </WidgetFrame>;
}

function formatYuan(cents: number) {
    const yuan = cents / 100;
    if (Math.abs(yuan) >= 100000) return `${(yuan / 10000).toFixed(2)}万`;
    return yuan.toLocaleString("zh-CN", {minimumFractionDigits: 2, maximumFractionDigits: 2});
}

function BooksWidget({data, editing}: { data: BookDigest[] | null | undefined; editing: boolean }) {
    const navigate = useNavigate();
    if (data === undefined) return <WidgetSkeleton title="账本"/>;
    if (!data || data.length === 0) return null;
    return <WidgetFrame title="账本" onOpen={editing ? undefined : () => navigate("/money")}>
        <div className="pf-books">
            {data.slice(0, 3).map((b) => <div key={b.id} className="pf-book" onClick={(e) => {
                if (editing) return;
                e.stopPropagation();
                navigate(`/money/${b.id}/dashboard`);
            }}>
                <span className="pf-book-name">{b.name}</span>
                <span className="pf-book-value">{formatYuan(b.netAssetCents)}</span>
                {!!b.changeCents && <span className={`pf-book-change ${b.changeCents > 0 ? "is-up" : "is-down"}`}>
                    {b.changeCents > 0 ? "+" : "−"}{formatYuan(Math.abs(b.changeCents))}
                </span>}
            </div>)}
        </div>
    </WidgetFrame>;
}

function WidgetSkeleton({title}: { title: string }) {
    return <WidgetFrame title={title}>
        <div className="pf-skeleton" style={{width: "40%", height: 26, marginTop: 8}}/>
        <div className="pf-skeleton" style={{width: "85%"}}/>
        <div className="pf-skeleton" style={{width: "70%"}}/>
    </WidgetFrame>;
}
