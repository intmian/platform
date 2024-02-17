import {Button, Card, Flex, List, Space, Spin, Tooltip} from "antd";
import {TimeFromStart} from "../common/misc.jsx";

const {Meta} = Card;

function ServiceInfo({name, startTime, status}) {
    let open = false;
    if (status === 'start') {
        open = true;
    }
    switch (status) {
        case 'stop':
            status = '停止';
            break;
        case 'start':
            status = '运行中';
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
            width: 330,
        }}
    >
        <Meta title={name}/>
        <Space>
            <Tooltip title={"状态"}>
                <div>{status}</div>
            </Tooltip>
            <Tooltip title={"启动时间"}>
                <TimeFromStart
                    startTime={startTime}
                    width={150}
                />
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
        servicesList.push(ServiceInfo({name: '测试3', startTime: Date.now() - 30000, status: 'start'}));
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
    return <Flex wrap={"wrap"} gap="large">{servicesList}</Flex>;
}