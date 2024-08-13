import {useState} from "react";
import {Col, InputNumber, Row, Slider, Space} from "antd";
import {CustomDeviceSimulator, DeviceSimulator} from "./DeviceSim.jsx";
import {MenuPlus} from "../common/MenuPlus.jsx";
import {AccountPanel} from "../admin/AccountAdmin.jsx";
import {accountHttp2ShowData} from "../admin/acoountdata.js";

// const debug = <AddPermissionPanel/>

const debug = <Space
    direction={"vertical"}
    size={"middle"}
    style={{
        width: "100%",
    }}
>
    <AccountPanel
        name="admin"
        initShowData={accountHttp2ShowData(
            [
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
                    permission: ['123456', '123457', '123457']
                },
            ]
            , 'admin'
        )}
    />
    <AccountPanel
        name="admin"
        initShowData={accountHttp2ShowData(
            [
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
                    permission: ['123456', '123457', '123457']
                },
            ]
            , 'admin'
        )}
    />
</Space>

// const debug = <Index/>


export function Debug() {
    const [showWidth, setShowWidth] = useState(300)
    const [showHeight, setShowHeight] = useState(300)
    const [refresh, setRefresh] = useState(false)
    let refreshButton = <button onClick={() => setRefresh(!refresh)}>刷新</button>
    let debugMap = new Map()
    debugMap.set('默认', <>
        {debug.type.name}
        {refreshButton}
        {debug}
    </>)
    debugMap.set('设备模拟', <>
        {debug.type.name}
        {refreshButton}
        <DeviceSimulator>
            {debug}
        </DeviceSimulator>
    </>)
    debugMap.set('自定义',
        <div>
            {debug.type.name}
            {refreshButton}
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
    return <MenuPlus label2node={debugMap} baseUrl={"/debug/"}/>
}