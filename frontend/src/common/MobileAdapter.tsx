import React, {useState} from "react";
import {Button} from "antd";
import {CalendarOutlined, MenuOutlined} from "@ant-design/icons";
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
    const isMobile = useIsMobile();
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
                    top: '10px',
                    ...css,
                    backgroundColor: 'rgba(0, 0, 0, 0.5)',
                    color: 'white',
                }}
            />
        } else {
            c = <div
                style={{
                    position: 'fixed',
                    top: '10px',
                    ...css,
                    backgroundColor: 'var(--pf-bg-elevated)',
                    boxShadow: 'var(--pf-shadow)',
                    zIndex: 1000,
                    padding: '10px',
                    width: '150px',
                }}
            >
                {children}
                <Button
                    type="text"
                    onClick={() => setIsOpen(!isOpen)}
                    size={'small'}
                    style={{
                        position: 'absolute',
                        top: '5px',
                        ...css2,
                        color: 'var(--pf-text)',
                        fontSize: '16px',
                    }}
                >
                    X
                </Button>
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