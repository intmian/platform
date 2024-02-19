import {Button, Card, Flex, List, Progress, Space, Spin, Tag, Tooltip} from "antd";
import {TimeFromStart} from "../common/misc.jsx";
import {useState} from "react";

const {Meta} = Card;

function ServiceInfo({name, startTime, initStatus}) {
    let open = false;
    let initStatus2 = initStatus;
    const [status, setStatus] = useState(initStatus2);
    if (status === 'start') {
        open = true;
    }
    let statusJsx = null
    switch (status) {
        case 'stop':
            statusJsx = <Progress type="circle" percent={100} size={25} status="exception"/>;
            break;
        case 'start':
            statusJsx = <Progress type="circle" percent={100} size={25}/>;
            break;
        default:
    }
    let statusShow = ''
    let nameShow = ''
    switch (status) {
        case 'stop':
            statusShow = '已停止';
            break;
        case 'start':
            statusShow = '已运行';
            break;
        default:
    }
    switch (name) {
        case 'auto' :
            nameShow = '自动任务平台';
            break;
        case 'core' :
            nameShow = '系统';
            break;
        default:

    }
    let buttonStr = open ? '关闭' : '开启';
    let button = null
    if (name === 'core') {
        button = <Button type="primary" disabled={true}>{buttonStr}</Button>;
    } else {
        button = <Button type="primary">{buttonStr}</Button>;
    }
    let tag = null;
    if (name === 'core') {
        tag = <Tag color="red">核心</Tag>;
    } else {
        tag = <Tag color="blue">微服务</Tag>;
    }
    return <Card
        style={{
            width: '30%',
            minWidth: 330,
            height: 100,
        }}
    >
        <Space direction={"vertical"} style={{width: '100%'}} size={0}>
            <Space>
                <Tooltip title={"状态"}>
                    {statusJsx}
                </Tooltip>
                <Meta title={nameShow}/>
                {tag}
            </Space>
            <Space>
                <Tooltip title={"启动时间"}>
                    <Space>
                        <div style={{width: 50}}>{statusShow}</div>
                        <TimeFromStart
                            startTime={startTime}
                            width={150}
                        />
                    </Space>
                </Tooltip>
                {button}
            </Space>
        </Space>
    </Card>
}

export default function ServicesData(services) {
    let services2 = services.services;
    let servicesList = [];
    if (services2 !== 'loading...') {
        for (let i = 0; i < services2.length; i++) {
            let name = services2[i].Name;
            let startTime = services2[i].StartTime;
            // 计算已经过去的时间
            let status = services2[i].Status;
            servicesList.push(ServiceInfo({name, startTime, initStatus: status}));
        }
    } else {
        return <List
            size="big"
            bordered
            dataSource={[<Spin key={0} tip="加载中" size="large"/>]}
            renderItem={(item) =>
                <List.Item
                    // 居中
                    style={{
                        display: 'flex',
                        justifyContent: 'center',
                    }}>
                    {item}
                </List.Item>}
        />
    }
    return <Flex
        wrap={"wrap"}
        gap="small"
        justify="flex-start"
        flex="auto"
    >{servicesList}</Flex>;
}