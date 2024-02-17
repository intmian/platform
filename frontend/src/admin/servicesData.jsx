import {Button, Card, Flex, List, Progress, Space, Spin, Tooltip} from "antd";
import {TimeFromStart} from "../common/misc.jsx";

const {Meta} = Card;

function ServiceInfo({name, startTime, status}) {
    let open = false;
    if (status === 'start') {
        open = true;
    }
    let statusJsx = null
    switch (status) {
        case 'stop':
            statusJsx = <Progress type="circle" percent={0} size={25} status="exception"/>;
            break;
        case 'start':
            statusJsx = <Progress type="circle" percent={100} size={25}/>;
            break;
        default:
    }
    switch (status) {
        case 'stop':
            status = '已停止';
            break;
        case 'start':
            status = '已运行';
            break;
        default:
    }
    switch (name) {
        case 'auto' :
            name = '自动任务平台';
            break;
        default:

    }
    let buttonStr = open ? '关闭' : '开启';
    return <Card
        style={{
            width: '30%',
            minWidth: 330,
            height: 100,
        }}
    >
        <Space>
            <Tooltip title={"状态"}>
                {statusJsx}
            </Tooltip>
            <Meta title={name}/>
        </Space>
        <Space>
            <Tooltip title={"启动时间"}>
                <Space>
                    <div style={{width: 50}}>{status}</div>
                    <TimeFromStart
                        startTime={startTime}
                        width={150}
                    />
                </Space>
            </Tooltip>
            <Button type="primary">{buttonStr}</Button>
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
            servicesList.push(ServiceInfo({name, startTime, status}));
        }
        servicesList.push(ServiceInfo({name: '测试1', startTime: Date.now() - 10000, status: 'start'}));
        servicesList.push(ServiceInfo({name: '测试2', startTime: Date.now() - 20000, status: 'start'}));
        servicesList.push(ServiceInfo({name: '测试3', startTime: Date.now() - 30000, status: 'stop'}));
        servicesList.push(ServiceInfo({name: '测试14', startTime: Date.now() - 40000, status: 'start'}));
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