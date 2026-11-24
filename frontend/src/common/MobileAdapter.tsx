import React, {useState} from "react";
import {Button} from "antd";
import {CalendarOutlined, CloseOutlined, MenuOutlined} from "@ant-design/icons";
import {useIsMobile} from "./breakpoints";

function MobileAdapter({children, position, width}: {
    children: React.ReactNode,
    position: "left" | "right",
    width: string
}) {
    /*
    * 如果是移动端就使用悬浮框，有一个按钮可以收起来，同时默认关闭
    * 如果是电脑端就原样放置
    * 无论是手机端还是电脑端都要浮动
    * */
    // 手机上按钮放在屏幕下方的角落（底部胶囊上面）：放顶上会被 iPhone 状态栏下的模糊区盖住，也不好按
    const isMobile = useIsMobile();
    const bottom = 'calc(var(--homebar-h, 64px) + var(--safe-bottom, 0px) + 12px)';
    const [isOpen, setIsOpen] = useState(false);
    let css;
    let css2;
    if (position === "left") {
        css = {left: "10px"};
        css2 = {left: "5px"};
    } else {
        css = {right: "10px"};
        css2 = {right: "5px"};
    }

    let c;
    if (isMobile) {
        if (!isOpen) {
            c = <Button
                type="primary"
                shape="circle"
                icon={position === "left" ? <CalendarOutlined/> : <MenuOutlined/>}
                onClick={() => setIsOpen(true)}
                style={{
                    position: 'fixed',
                    bottom,
                    ...css,
                    backgroundColor: 'rgba(0, 0, 0, 0.5)',
                    color: 'white',
                }}
            />
        } else {
            c = <div
                style={{
                    position: 'fixed',
                    bottom,
                    ...css,
                    backgroundColor: 'var(--pf-bg-elevated)',
                    boxShadow: 'var(--pf-shadow)',
                    zIndex: 1000,
                    padding: '36px 10px 10px',
                    borderRadius: 12,
                    width: '170px',
                }}
            >
                {children}
                <Button
                    type="text"
                    onClick={() => setIsOpen(!isOpen)}
                    size={'small'}
                    style={{
                        position: 'absolute',
                        top: '6px',
                        ...css2,
                        color: 'var(--pf-text-2)',
                    }}
                    aria-label="收起"
                    icon={<CloseOutlined/>}
                />
            </div>
        }
    } else {
        c = children;
    }

    return (
        <div style={{position: 'fixed', [position]: 0, top: 0, width: width, zIndex: 1000}}>
            {c}
        </div>
    );
}

export default MobileAdapter;