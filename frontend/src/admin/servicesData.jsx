import {Button, List, Space} from "antd";

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
    services = services.services;
    let servicesList = [];
    for (let i = 0; i < services.length; i++) {
        let name = services[i].Name;
        let startTime = services[i].StartTime;
        let status = services[i].Status;
        servicesList.push(service({name, startTime, status}));
    }

    return <List
        size="big"
        bordered
        dataSource={servicesList}
        renderItem={(item) => <List.Item>{item}</List.Item>}
    />
}