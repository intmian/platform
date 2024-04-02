import React, {useMemo, useState} from 'react';
import {Card, InputNumber, Select, Switch} from 'antd';
import ResizeObserver from 'rc-resize-observer';

const {Option} = Select;

const deviceSizes = {
    iPhone12: {
        name: 'iPhone12',
        width: 1080,
        height: 2340,
        screenSize: 5.4 // 假定的iPhone 12屏幕大小（英寸）
    },
    iPadAir2: {
        name: 'iPad air2',
        width: 1640,
        height: 2360,
        screenSize: 10.2 // 假定的iPad屏幕大小（英寸）
    },
    pc1: {
        name: 'PC 1080p',
        width: 1920,
        height: 1080,
        screenSize: 24 // 假定的PC屏幕大小（英寸）
    },
    pc2: {
        name: 'PC 4k',
        width: 3840,
        height: 2160,
        screenSize: 27 // 假定的PC屏幕大小（英寸）
    },
    appleWatch: {
        name: 'Apple Watch 41mm',
        width: 352,
        height: 430,
        screenSize: 1.75 // 假定的Apple Watch屏幕大小（英寸）
    }
    // ... 可以添加更多设备和它们的尺寸
};

const simulatorStyle = {
    marginTop: '20px',
    border: '1px solid #ccc',
    overflow: 'hidden',
    position: 'relative',
    backgroundColor: '#fff',
    boxShadow: '0 0 10px rgba(0, 0, 0, 0.5)',
};

export function DeviceSimulator({children}) {
    const [device, setDevice] = useState('iPhone12');
    const [userScreenSize, setUserScreenSize] = useState(24); // 用户屏幕大小（英寸），默认值
    const [userScreenResolution, setUserScreenResolution] = useState({width: 1920, height: 1080}); // 用户屏幕分辨率，默认值

    const scale = useMemo(() => {
        // const diagonalPixels = Math.sqrt(Math.pow(deviceSizes[device].width, 2) + Math.pow(deviceSizes[device].height, 2));
        // const diagonalInches = Math.sqrt(Math.pow(userScreenSize, 2) * (Math.pow(userScreenResolution.width / userScreenResolution.height, 2) + 1));
        // return diagonalInches / diagonalPixels;
        const devicePPi = Math.sqrt(Math.pow(deviceSizes[device].width, 2) + Math.pow(deviceSizes[device].height, 2)) / deviceSizes[device].screenSize;
        const userPPi = Math.sqrt(Math.pow(userScreenResolution.width, 2) + Math.pow(userScreenResolution.height, 2)) / userScreenSize;
        return userPPi / devicePPi;
    }, [device, userScreenSize, userScreenResolution]);

    const handleDeviceChange = (value) => {
        setDevice(value);
    };

    const handleUserScreenSizeChange = value => {
        setUserScreenSize(value);
    };

    const handleUserScreenWidthChange = value => {
        setUserScreenResolution(res => ({...res, width: value}));
    };

    const handleUserScreenHeightChange = value => {
        setUserScreenResolution(res => ({...res, height: value}));
    };

    const [realSize, setRealSize] = useState(false)
    const handleRealSizeChange = (value) => {
        setRealSize(value)
    }

    return (
        <div>
            <Select defaultValue="iPhone12" style={{width: 200}} onChange={handleDeviceChange}>
                {Object.keys(deviceSizes).map((key) => (
                    <Option key={key}
                            value={key}>{deviceSizes[key].name}({deviceSizes[key].width}x{deviceSizes[key].height} {deviceSizes[key].screenSize}in)</Option>
                ))}
            </Select>
            <span>真实大小？</span>
            <Switch defaultChecked={false} onChange={handleRealSizeChange}/>
            <div>
                <span>显示设备尺寸 (英尺):</span>
                <InputNumber disabled={!realSize} min={1} max={100} defaultValue={24}
                             onChange={handleUserScreenSizeChange}/>
                <span>像素比: </span>
                <InputNumber disabled={!realSize} min={320} max={7680} defaultValue={1920}
                             onChange={handleUserScreenWidthChange}/>
                <InputNumber disabled={!realSize} min={240} max={4320} defaultValue={1080}
                             onChange={handleUserScreenHeightChange}/>
            </div>
            <ResizeObserver onResize={({width, height}) => {
            }}>
                <Card
                    style={{
                        ...simulatorStyle,
                        width: deviceSizes[device].width,
                        height: deviceSizes[device].height,
                        transform: `scale(${!realSize ? 1 : scale})`,
                        transformOrigin: 'top left',
                        transition: 'transform 0.2s ease-in-out',
                    }}
                >
                    {children}
                </Card>
            </ResizeObserver>
        </div>
    );
}

// CustomDeviceSimulator可以保持原样，或者也可以修改以支持缩放功能。
export function CustomDeviceSimulator({width, height, children}) {
    return (
        <Card
            style={{
                ...simulatorStyle,
                width,
                height,
                transform: 'scale(1)',
                transformOrigin: 'top left',
                transition: 'transform 0.2s ease-in-out',
            }}
        >
            {children}
        </Card>
    );
}