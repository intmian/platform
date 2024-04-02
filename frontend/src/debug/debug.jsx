import {AccountPanel} from "../admin/AccountAdmin.jsx";
import {useState} from "react";
import {Col, InputNumber, Row, Slider} from "antd";
import {CustomDeviceSimulator, DeviceSimulator} from "./DeviceSim.jsx";
import {MenuPlus} from "../common/MenuPlus.jsx";

const debug = <AccountPanel
    name="admin"
    initPermissions={[
        {
            token: 'admin',
            permission: ['admin', 'debug']
        },
        {
            token: 'debug',
            permission: ['debug']
        },
        {
            token: 'aaa-111',
            permission: ['aaa-111']
        },
        {
            token: 'aaa-1112323232323',
            permission: ['123456', '123456', '123456']
        },
    ]}
/>

export function Debug() {
    const [showWidth, setShowWidth] = useState(300)
    const [showHeight, setShowHeight] = useState(300)

    let debugMap = new Map()
    debugMap.set('默认', <>
        {debug.type.name}
        {debug}
    </>)
    debugMap.set('设备模拟', <>
        {debug.type.name}
        <DeviceSimulator>
            {debug}
        </DeviceSimulator>
    </>)
    debugMap.set('自定义',
        <div>
            {debug.type.name}
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
                    {debug}
                </CustomDeviceSimulator>
            </Row>
        </div>
    )
    return <MenuPlus label2node={debugMap}/>
}