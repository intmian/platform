import {ComponentType, createElement, MouseEvent as ReactMouseEvent, ReactNode, useCallback, useState} from "react";
import {Button, Card, Col, InputNumber, Row, Slider, Space, Typography} from "antd";
import {DesktopOutlined, ExpandOutlined, MobileOutlined} from "@ant-design/icons";
import {Outlet, Route, Routes, Navigate} from "react-router-dom";
import {MenuPlus, useSectionKey} from "../common/MenuPlus";
import {useAppTitle} from "../shell/runtime";
import {CustomDeviceSimulator, DeviceSimulator} from "./DeviceSim";
import {EditableProps, Props} from "./EditableProps";

// 组件试验场：把要调的组件挂在下面，单独调交互和样式。只在本地开发时出现。
// 换组件就改 TARGET 和 TARGET_PROPS，props 可以在浮动面板里实时改。

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const TARGET: ComponentType<any> = function Sample({text, count, danger}: { text: string; count: number; danger: boolean }) {
    return <Space direction="vertical" style={{padding: 16}}>
        <Typography.Title level={4} style={{margin: 0}}>{text}</Typography.Title>
        <Button danger={danger}>点了 {count} 次</Button>
    </Space>;
};
const TARGET_PROPS: Props = {text: "示例组件", count: 0, danger: false};

function componentName(c: ComponentType): string {
    return c.displayName || c.name || "匿名组件";
}

function DebugTool({onChange, onRemount}: { onChange: (props: Props) => void; onRemount: () => void }) {
    const [minimized, setMinimized] = useState(true);
    const [position, setPosition] = useState({x: window.innerWidth - 360, y: 16});

    // 只有拖标题栏时移动，避免和面板里的输入框冲突
    const onDragStart = (e: ReactMouseEvent) => {
        const offsetX = e.clientX - position.x;
        const offsetY = e.clientY - position.y;
        const move = (ev: MouseEvent) => setPosition({x: ev.clientX - offsetX, y: ev.clientY - offsetY});
        const up = () => {
            window.removeEventListener("mousemove", move);
            window.removeEventListener("mouseup", up);
        };
        window.addEventListener("mousemove", move);
        window.addEventListener("mouseup", up);
    };

    return <div style={{position: "fixed", left: position.x, top: position.y, zIndex: 1000, width: minimized ? undefined : 340}}>
        <Card
            size="small"
            title={<span onMouseDown={onDragStart} style={{cursor: "move", userSelect: "none"}}>{componentName(TARGET)}</span>}
            extra={<Space size={4}>
                {!minimized && <Button size="small" onClick={onRemount}>重新挂载</Button>}
                <Button size="small" onClick={() => setMinimized(!minimized)}>{minimized ? "展开" : "收起"}</Button>
            </Space>}
            styles={{body: {display: minimized ? "none" : undefined, maxHeight: "60vh", overflow: "auto"}}}
            style={{boxShadow: "var(--pf-shadow)"}}
        >
            <EditableProps initialProps={TARGET_PROPS} onChange={onChange}/>
        </Card>
    </div>;
}

function CustomSize({children}: { children: ReactNode }) {
    const [width, setWidth] = useState(375);
    const [height, setHeight] = useState(667);
    return <div>
        <Row gutter={12} align="middle">
            <Col span={2}>宽</Col>
            <Col span={10}><Slider min={100} max={3000} value={width} onChange={setWidth}/></Col>
            <Col><InputNumber min={100} max={3000} value={width} onChange={(v) => setWidth(v ?? 375)}/></Col>
        </Row>
        <Row gutter={12} align="middle">
            <Col span={2}>高</Col>
            <Col span={10}><Slider min={100} max={3000} value={height} onChange={setHeight}/></Col>
            <Col><InputNumber min={100} max={3000} value={height} onChange={(v) => setHeight(v ?? 667)}/></Col>
        </Row>
        <CustomDeviceSimulator width={width} height={height}>{children}</CustomDeviceSimulator>
    </div>;
}

const SECTIONS = [
    {key: "plain", label: "直接显示", icon: <DesktopOutlined/>},
    {key: "device", label: "设备模拟", icon: <MobileOutlined/>},
    {key: "custom", label: "自定义尺寸", icon: <ExpandOutlined/>},
];

function DebugLayout({tool}: { tool: ReactNode }) {
    const key = useSectionKey();
    useAppTitle(SECTIONS.find((s) => s.key === key)?.label);
    return <MenuPlus items={SECTIONS} activeKey={key}>
        {tool}
        <Outlet/>
    </MenuPlus>;
}

export function Debug() {
    const [props, setProps] = useState<Props>(TARGET_PROPS);
    const [mountKey, setMountKey] = useState(0);
    const onChange = useCallback((p: Props) => setProps(p), []);
    const target = createElement(TARGET, {key: mountKey, ...props});
    const tool = <DebugTool onChange={onChange} onRemount={() => setMountKey((k) => k + 1)}/>;

    return <Routes>
        <Route element={<DebugLayout tool={tool}/>}>
            <Route index element={<Navigate to="plain" replace/>}/>
            <Route path="plain" element={target}/>
            <Route path="device" element={<DeviceSimulator>{target}</DeviceSimulator>}/>
            <Route path="custom" element={<CustomSize>{target}</CustomSize>}/>
            <Route path="*" element={<Navigate to="plain" replace/>}/>
        </Route>
    </Routes>;
}
