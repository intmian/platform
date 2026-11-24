import {useRef, useState} from "react";
import {useSortable} from "@dnd-kit/sortable";
import {CSS} from "@dnd-kit/utilities";
import {MinusOutlined} from "@ant-design/icons";
import {appById} from "../apps";
import {AppGlyph, LinkGlyph} from "../AppTile";
import {DesktopItem, takeJustAdded} from "./store";

const LONG_PRESS_MS = 500;

export function itemTitle(item: DesktopItem): string {
    return item.kind === "app" ? appById(item.appId)?.name ?? "" : item.title;
}

export function ItemGlyph({item, size}: { item: DesktopItem; size: number }) {
    if (item.kind === "app") {
        const app = appById(item.appId);
        return app ? <AppGlyph app={app} size={size}/> : null;
    }
    return <LinkGlyph title={item.title} url={item.url} icon={item.icon} size={size}/>;
}

// 桌面上的一个图标。平时：点击打开，长按（或右键）进入编辑。编辑时：拖动排序，点击打开设置，左上角减号移除。
export function Tile({item, sortId, area, rowStart, size, editing, showLabel = true, badge, index = 0, onOpen, onEdit, onStartEditing, onRemove}: {
    item: DesktopItem;
    sortId: string;
    area: "grid" | "dock";
    rowStart?: boolean;
    size: number;
    editing: boolean;
    showLabel?: boolean;
    badge?: number;
    index?: number;
    onOpen: () => void;
    onEdit: () => void;
    onStartEditing: () => void;
    onRemove: () => void;
}) {
    const {attributes, listeners, setNodeRef, transform, transition, isDragging} = useSortable({
        id: sortId,
        disabled: !editing,
        data: {area},
    });
    // 刚加到桌面的图标挂载时“跳”一下
    const [pop] = useState(() => area === "grid" && takeJustAdded(item.id));
    const timer = useRef<number>();
    const longPressed = useRef(false);
    const title = itemTitle(item);

    return <div
        ref={setNodeRef}
        className={`pf-icon${rowStart ? " is-row-start" : ""}${editing ? " is-editing" : ""}${isDragging ? " is-dragging" : ""}${pop ? " is-pop" : ""}`}
        style={{transform: CSS.Translate.toString(transform), transition, ["--i" as string]: index}}
        {...(editing ? attributes : {})}
        {...(editing ? listeners : {})}
    >
        <button
            className="pf-icon-btn"
            aria-label={title}
            title={showLabel ? undefined : title}
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
                }, LONG_PRESS_MS);
            }}
            onPointerUp={() => window.clearTimeout(timer.current)}
            onPointerCancel={() => window.clearTimeout(timer.current)}
            onPointerMove={(e) => {
                // 手指在滑动页面就不算长按
                if (e.pointerType !== "mouse" && (Math.abs(e.movementX) > 3 || Math.abs(e.movementY) > 3)) {
                    window.clearTimeout(timer.current);
                }
            }}
            onClick={() => {
                if (longPressed.current) {
                    longPressed.current = false;
                    return;
                }
                if (editing) onEdit();
                else onOpen();
            }}
        >
            <span className="pf-icon-art">
                <ItemGlyph item={item} size={size}/>
                {!!badge && !editing && <span className="pf-badge">{badge > 99 ? "99+" : badge}</span>}
            </span>
            {showLabel && <span className="pf-icon-label">{title}</span>}
        </button>
        {editing && <button className="pf-icon-remove" aria-label={area === "dock" ? `从 Dock 取下 ${title}` : `移除 ${title}`}
                            onPointerDown={(e) => e.stopPropagation()}
                            onClick={(e) => {
                                e.stopPropagation();
                                onRemove();
                            }}><MinusOutlined/></button>}
    </div>;
}
