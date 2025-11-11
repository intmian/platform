import {useState} from "react";
import {Button, Card, Col, InputNumber, Row, Slider, Space, Typography} from "antd";
import {CustomDeviceSimulator, DeviceSimulator} from "./DeviceSim.jsx";
import {MenuPlus} from "../common/MenuPlus.jsx";
import {EditableProps} from "./EditableProps.jsx";
import {ConfigsType, ConfigType} from "../common/UniConfigDef.js";
import {ConfigsCtr} from "../common/UniConfig.jsx";
import {JianXing} from "../library/JianXingTemp.tsx";

const {Text} = Typography;

const config = new ConfigsCtr(ConfigsType.Plat)

config.addBaseConfig('test', '测试', ConfigType.SliceString, 'test')
config.addBaseConfig('realKey', '真实2', ConfigType.String, 'realKey')

const debug = <JianXing
/>

// const settings = {
//     init: false,
//     outUrl: 'www.intmian.com',
//     baseUrl: 'www.baidu.com',
//     realUrl: '',
// }
// const debug = <Ping
//     setting={settings}
// />

// const debug = <Timeline style={{margin: 0, padding: 0, minHeight: 0}}
//                         items={[
//                             {
//                                 children: <Typography.Text>{'创建于  ' + 1}</Typography.Text>
//                             },
//                             {
//                                 children: <Typography.Text>{'修改于  ' + 1}</Typography.Text>
//                             }
//                         ]}
// />

// const debug = <ToolPanel>
//
// </ToolPanel>

// const debug = <ToolShow
//     id={"123"}
//     name={"标题五个字"}
//     typ={ToolType.Python}
//     createdAt={"1998-56-45 00:01:02"}
//     updatedAt={"1998-56-45 00:01:02"}
//     loading={false}
// />

// const debug = <AddPermissionPanel/>

// const debug = <Space
//     direction={"vertical"}
//     size={"middle"}
//     style={{
//         width: "100%",
//     }}
// >
//     <AccountPanel
//         name="admin"
//         initShowData={accountHttp2ShowData(
//             [
//                 {
//                     token: 'admin',
//                     permission: ['admin', 'debug']
//                 },
//                 {
//                     token: 'debug',
//                     permission: ['debug']
//                 },
//                 {
//                     token: 'aaa-111',
//                     permission: ['aaa-111']
//                 },
//                 {
//                     token: 'aaa-1112323232323',
//                     permission: ['123456', '123457', '123457']
//                 },
//             ]
//             , 'admin'
//         )}
//     />
//     <AccountPanel
//         name="admin"
//         initShowData={accountHttp2ShowData(
//             [
//                 {
//                     token: 'admin',
//                     permission: ['admin', 'debug']
//                 },
//                 {
//                     token: 'debug',
//                     permission: ['debug']
//                 },
//                 {
//                     token: 'aaa-111',
//                     permission: ['aaa-111']
//                 },
//                 {
//                     token: 'aaa-1112323232323',
//                     permission: ['123456', '123457', '123457']
//                 },
//             ]
//             , 'admin'
//         )}
//     />
// </Space>

// const debug = <Index/>

function DebugTool({debug, onChange, onRefresh}) {
    const [isMinimized, setIsMinimized] = useState(true);
    const [position, setPosition] = useState({x: 800, y: 0});

    const handleMouseDown = (e) => {
        const offsetX = e.clientX - position.x;
        const offsetY = e.clientY - position.y;

        const handleMouseMove = (moveEvent) => {
            setPosition({
                x: moveEvent.clientX - offsetX,
                y: moveEvent.clientY - offsetY,
            });
        };

        const handleMouseUp = () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };

        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
    };

    let refreshButton = (
        <Button onClick={onRefresh} danger>
            强制刷新
        </Button>
    );

    let edit = <EditableProps reactNode={debug} onChange={onChange}/>;

    return (
        <div
            className={`floating-window ${isMinimized ? 'minimized' : ''}`}
            style={{left: position.x, top: position.y, position: 'absolute', zIndex: 9999}} // 添加 position: 'absolute'
            onMouseDown={handleMouseDown}
        >
            <div
                hidden={!isMinimized}
                style={{
                    backgroundColor: 'white',
                    padding: '5px',
                    boxShadow: '2px 2px 4px rgba(0, 0, 0, 0.5)',
                    borderRadius: '10px',
                }}
            >
                <Text style={{userSelect: 'none'}}>debug工具</Text>
                <Button onClick={() => setIsMinimized(false)}>展开</Button>
            </div>
            <Card
                hidden={isMinimized}
                title={"组件名:" + debug.type.name}
                extra={
                    <Space>
                        {refreshButton}
                        <Button onClick={() => setIsMinimized(true)}>最小化</Button>
                    </Space>

                }
            >
                {edit}
            </Card>
        </div>
    );
}

export function Debug() {
    const [showWidth, setShowWidth] = useState(300)
    const [showHeight, setShowHeight] = useState(300)
    const [refresh, setRefresh] = useState(false)
    const [nowDebug, setNowDebug] = useState(debug)
    if (refresh) {
        // 0.05秒后刷新
        setTimeout(() => setRefresh(false), 50)
        return <></>
    }

    const debugTool = <DebugTool
        debug={debug}
        onChange={
            (props) => {
                setNowDebug({...nowDebug, props: props})
            }}
        onRefresh={
            () => {
                setRefresh(true)
            }
        }
    />

    let debugMap = new Map()
    debugMap.set('默认', <>
        {debugTool}
        {nowDebug}
    </>)
    debugMap.set('设备模拟', <>
        {debugTool}
        <DeviceSimulator>
            {nowDebug}
        </DeviceSimulator>
    </>)
    debugMap.set('自定义',
        <div>
            {debugTool}
            <Row>
                <Col span={10}>
                    <Slider min={100} max={3000} defaultValue={showWidth} onChange={setShowWidth} value={showWidth}/>
                </Col>
                <Col>
                    <InputNumber min={100} max={3000} defaultValue={showHeight} onChange={setShowWidth}
                                 value={showWidth}/>
                </Col>
            </Row>
            <Row>
                <Col span={10}>
                    <Slider min={100} max={3000} defaultValue={300} onChange={setShowHeight} value={showHeight}/>
                </Col>
                <Col>
                    <InputNumber min={100} max={3000} defaultValue={300} onChange={setShowHeight} value={showHeight}/>
                </Col>
            </Row>
            <Row>
                <CustomDeviceSimulator width={showWidth} height={showHeight}>
                    {nowDebug}
                </CustomDeviceSimulator>
            </Row>
        </div>
    )
    return <MenuPlus label2node={debugMap} baseUrl={"/debug/"}/>
}