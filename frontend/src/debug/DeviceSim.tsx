import {ReactNode, useMemo, useState} from "react";
import {Flex, InputNumber, Select, Switch, Typography} from "antd";

interface DeviceSize {
    name: string;
    width: number;      // 物理像素
    height: number;
    deviceRate: number; // 像素比
    screenSize: number; // 对角线英寸
}

const deviceSizes: Record<string, DeviceSize> = {
    iPhone: {name: "iPhone 16 Pro", width: 1206, height: 2622, deviceRate: 3, screenSize: 6.3},
    iPhone2: {name: "iPhone 12 mini", width: 1080, height: 2340, deviceRate: 3, screenSize: 5.4},
    iPad: {name: "iPad Air 2", width: 1640, height: 2360, deviceRate: 1, screenSize: 10.2},
    pc1: {name: "PC 1080p", width: 1920, height: 1080, deviceRate: 1, screenSize: 24},
    pc2: {name: "PC 4K", width: 3840, height: 2160, deviceRate: 1, screenSize: 27},
    appleWatch: {name: "Apple Watch 41mm", width: 352, height: 430, deviceRate: 0.75, screenSize: 1.75},
};

const frameStyle = {
    overflow: "auto",
    position: "relative" as const,
    background: "var(--pf-bg)",
    border: "1px solid var(--pf-border)",
    boxShadow: "var(--pf-shadow)",
    transformOrigin: "top left",
    transition: "transform 0.2s ease-in-out",
};

// 按设备的逻辑分辨率显示；打开“真实大小”后按显示器 PPI 换算成实物尺寸
export function DeviceSimulator({children}: { children: ReactNode }) {
    const [device, setDevice] = useState("iPhone");
    const [realSize, setRealSize] = useState(false);
    const [userScreenSize, setUserScreenSize] = useState(24);
    const [userRes, setUserRes] = useState({width: 1920, height: 1080});
    const d = deviceSizes[device];

    const scale = useMemo(() => {
        const devicePPI = Math.hypot(d.width / d.deviceRate, d.height / d.deviceRate) / d.screenSize;
        const userPPI = Math.hypot(userRes.width, userRes.height) / userScreenSize;
        return userPPI / devicePPI;
    }, [d, userScreenSize, userRes]);

    return <div>
        <Flex gap={8} wrap="wrap" align="center">
            <Select
                value={device}
                style={{width: 360}}
                onChange={setDevice}
                options={Object.entries(deviceSizes).map(([key, v]) => ({
                    value: key,
                    label: `${v.name}（${v.width}x${v.height}，${v.screenSize} 寸，像素比 ${v.deviceRate}）`,
                }))}
            />
            <Typography.Text>真实大小</Typography.Text>
            <Switch checked={realSize} onChange={setRealSize}/>
        </Flex>
        {realSize && <Flex gap={8} wrap="wrap" align="center" style={{marginTop: 8}}>
            <Typography.Text>显示器尺寸（英寸）</Typography.Text>
            <InputNumber min={1} max={100} value={userScreenSize} onChange={(v) => setUserScreenSize(v ?? 24)}/>
            <Typography.Text>分辨率</Typography.Text>
            <InputNumber min={320} max={7680} value={userRes.width} onChange={(v) => setUserRes((r) => ({...r, width: v ?? 1920}))}/>
            <InputNumber min={240} max={4320} value={userRes.height} onChange={(v) => setUserRes((r) => ({...r, height: v ?? 1080}))}/>
        </Flex>}
        <div style={{
            ...frameStyle,
            marginTop: 16,
            width: d.width / d.deviceRate,
            height: d.height / d.deviceRate,
            transform: `scale(${realSize ? scale : 1})`,
        }}>
            {children}
        </div>
    </div>;
}

export function CustomDeviceSimulator({width, height, children}: { width: number; height: number; children: ReactNode }) {
    return <div style={{...frameStyle, marginTop: 16, width, height}}>{children}</div>;
}
