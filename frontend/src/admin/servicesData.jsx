import {Button, List, Space, Spin} from "antd";

function service({name, startTime, status}) {
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

    return <Space>
        {name}
        {startTime}
        {status}
        <Button type="primary">{buttonStr}</Button>
    </Space>
}

export default function ServicesData(services) {
    let services2 = services.services;
    let servicesList = [];
    if (services2 !== 'loading...') {
        for (let i = 0; i < services2.length; i++) {
            let name = services2[i].Name;
            let startTime = services2[i].StartTime;
            let status = services2[i].Status;
            servicesList.push(service({name, startTime, status}));
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
    return <List
        size="big"
        bordered
        dataSource={servicesList}
        renderItem={(item) =>
            <List.Item
                // 居中
                style={{
                    display: 'flex',
                    justifyContent: 'center',
                }}
            >
                {item}
            </List.Item>}
    />
}