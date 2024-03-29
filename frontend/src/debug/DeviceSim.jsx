import {useState} from 'react';
import {Card, Select} from 'antd';
import ResizeObserver from 'rc-resize-observer';

const {Option} = Select;

const deviceSizes = {
    iPhoneX: {
        name: 'iPhone X',
        width: 375,
        height: 812,
    },
    Pixel2: {
        name: 'Pixel 2',
        width: 411,
        height: 731,
    },
    iPad: {
        name: 'iPad',
        width: 768,
        height: 1024,
    },
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
    const [device, setDevice] = useState('iPhoneX');
    const [dimensions, setDimensions] = useState({
        width: deviceSizes[device].width,
        height: deviceSizes[device].height,
    });

    const handleDeviceChange = (value) => {
        setDevice(value);
        setDimensions({
            width: deviceSizes[value].width,
            height: deviceSizes[value].height,
        });
    };

    return (
        <div>
            <Select defaultValue="iPhoneX" style={{width: 200}} onChange={handleDeviceChange}>
                {Object.keys(deviceSizes).map((key) => (
                    <Option key={key} value={key}>
                        {deviceSizes[key].name}
                    </Option>
                ))}
            </Select>
            <ResizeObserver
                onResize={({width, height}) => {
                    setDimensions({width, height});
                }}
            >
                <Card
                    style={{
                        ...simulatorStyle,
                        width: dimensions.width,
                        height: dimensions.height,
                        transform: 'scale(1)',
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