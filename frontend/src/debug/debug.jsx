import {AccountPanel} from "../admin/AccountAdmin.jsx";
import {useState} from "react";
import {Col, InputNumber, Row, Slider, Space} from "antd";
import {CustomDeviceSimulator, DeviceSimulator} from "./DeviceSim.jsx";
import {MenuPlus} from "../common/MenuPlus.jsx";

function SmallDebug() {
    // 需要测试的组件添加到这里
    let debug = <AccountPanel
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
    return <Space direction={"vertical"}>
        {debug.type.name}
        {debug}
    </Space>;
}

export function Debug() {
    const [showWidth, setShowWidth] = useState(300)
    const [showHeight, setShowHeight] = useState(300)

    let debugMap = new Map()
    debugMap.set('默认', <SmallDebug/>)
    debugMap.set('设备模拟', <DeviceSimulator>
        <SmallDebug/>
    </DeviceSimulator>)
    debugMap.set('自定义',
        <div>
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
                    <SmallDebug/>
                </CustomDeviceSimulator>
                {/*<Watermark content={["测试div", showWidth, showHeight]}*/}
                {/*           style={{*/}
                {/*               width: showWidth,*/}
                {/*               height: showHeight,*/}
                {/*               backgroundColor: '#f0f0f0',*/}
                {/*           }}*/}
                {/*>*/}
                {/*    <SmallDebug/>*/}
                {/*</Watermark>*/}
            </Row>
        </div>
    )
    return <MenuPlus label2node={debugMap}/>
}