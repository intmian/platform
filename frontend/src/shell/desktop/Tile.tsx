import {useRef} from "react";
import {useSortable} from "@dnd-kit/sortable";
import {CSS} from "@dnd-kit/utilities";
import {MinusOutlined} from "@ant-design/icons";
import {appById} from "../apps";
import {AppGlyph, LinkGlyph} from "../AppTile";
import {DesktopItem} from "./store";

const LONG_PRESS_MS = 500;

export function itemTitle(item: DesktopItem): string {
    return item.kind === "app" ? appById(item.appId)?.name ?? "" : item.title;
}

export function ItemGlyph({item, size}: { item: DesktopItem; size: number }) {
    if (item.kind === "app") {
        const app = appById(item.appId);
        return app ? <AppGlyph app={app} size={size}/> : null;
    }
    return <LinkGlyph title={item.title} url={item.url} size={size}/>;
}

// 桌面上的一个图标。平时：点击打开，长按（或右键）进入编辑。编辑时：拖动排序，点击打开设置，左上角减号移除。
export function Tile({item, size, editing, showLabel = true, onOpen, onEdit, onStartEditing, onRemove}: {
    item: DesktopItem;
    size: number;
    editing: boolean;
    showLabel?: boolean;
    onOpen: () => void;
    onEdit: () => void;
    onStartEditing: () => void;
    onRemove: () => void;
}) {
    const {attributes, listeners, setNodeRef, transform, transition, isDragging} = useSortable({
        id: item.id,
        disabled: !editing,
    });
    const timer = useRef<number>();
    const longPressed = useRef(false);
    const title = itemTitle(item);

    return <div
        ref={setNodeRef}
        className={`pf-icon${editing ? " is-editing" : ""}${isDragging ? " is-dragging" : ""}`}
        style={{transform: CSS.Translate.toString(transform), transition}}
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
            <ItemGlyph item={item} size={size}/>
            {showLabel && <span className="pf-icon-label">{title}</span>}
        </button>
        {editing && <button className="pf-icon-remove" aria-label={`移除 ${title}`}
                            onPointerDown={(e) => e.stopPropagation()}
                            onClick={(e) => {
                                e.stopPropagation();
                                onRemove();
                            }}><MinusOutlined/></button>}
    </div>;
}
