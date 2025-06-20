import React, {useRef, useState} from "react";
import type {MenuProps} from "antd";
import {Dropdown} from "antd";

export default function ContextMenu({
                                        menu,
                                        children,
                                    }: {
    menu: MenuProps;
    children: React.ReactElement;
}) {
    const [menuVisible, setMenuVisible] = useState(false);
    const [menuPosition, setMenuPosition] = useState<{ x: number; y: number } | null>(null);

    const containerRef = useRef<HTMLDivElement>(null);

    const handleContextMenu = (e: React.MouseEvent) => {
        e.preventDefault();
        setMenuPosition({x: e.clientX, y: e.clientY});
        setMenuVisible(true);
    };

    const handleMouseLeave = (e: React.MouseEvent) => {
        // 用 setTimeout 是为了确保鼠标是否进了 dropdown 区域
        setTimeout(() => {
            const related = e.relatedTarget as HTMLElement | null;
            if (
                related &&
                containerRef.current &&
                !containerRef.current.contains(related)
            ) {
                setMenuVisible(false);
            }
        }, 10);
    };

    return (
        <div
            ref={containerRef}
            onContextMenu={handleContextMenu}
            onMouseLeave={handleMouseLeave}
            style={{display: "inline-block"}} // 防止破坏布局，同时允许定位
        >
            {children}
            {menuVisible && menuPosition && (
                <div
                    style={{
                        position: "fixed",
                        top: menuPosition.y,
                        left: menuPosition.x,
                        zIndex: 1000,
                    }}
                    onMouseLeave={handleMouseLeave}
                    onContextMenu={(e) => e.preventDefault()}
                >
                    <Dropdown
                        menu={menu}
                        open={true}
                        trigger={[]}
                        placement="bottomLeft"
                        onOpenChange={(open) => {
                            // if (!open) {
                            setMenuVisible(false);
                            // }
                        }}
                    >
                        <div/>
                    </Dropdown>
                </div>
            )}
        </div>
    );
}
