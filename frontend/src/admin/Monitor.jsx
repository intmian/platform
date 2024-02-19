import {Button, Card, Flex, List, message, Popconfirm, Progress, Space, Spin, Tag, Tooltip} from "antd";
import {TimeFromStart} from "../common/misc.jsx";
import {useEffect, useState} from "react";
import {SendStartStopService} from "../common/sendhttp.js";

const {Meta} = Card;

function ServiceInfo({name, startTime, initStatus}) {
    console.log('initStatus', initStatus)
    const [startTime2, setStartTime2] = useState(startTime);
    const [status, setStatus] = useState(initStatus);
    const [buttonLoading, setButtonLoading] = useState(false);
    let open = false;
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
    let disabled = false;
    if (name === 'core') {
        disabled = true;
    }
    let button = <Button
        type="primary"
        disabled={disabled}
        loading={buttonLoading}
    >
        {buttonStr}
    </Button>;
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
                            startTime={startTime2}
                            width={150}
                        />
                    </Space>
                </Tooltip>
                <Popconfirm
                    title="确认"
                    description="确认进行操作?"
                    okText="是"
                    cancelText="否"
                    onConfirm={
                        () => {
                            setButtonLoading(true);
                            if (open) {
                                SendStartStopService((result) => {
                                    if (result !== null) {
                                        setStatus('stop');
                                        setButtonLoading(false);
                                        let timeStr = new Date(Date.now()).toLocaleString();
                                        console.log('timeStr', timeStr);
                                        setStartTime2(timeStr);
                                        message.success(nameShow + '已关闭');
                                    }
                                }, false, name)
                            } else {
                                SendStartStopService((result) => {
                                    if (result !== null) {
                                        setStatus('start');
                                        setButtonLoading(false);
                                        let timeStr = new Date(Date.now()).toLocaleString();
                                        setStartTime2(timeStr);
                                        console.log('start time', startTime2);
                                        message.success(nameShow + '已开启');
                                    }
                                }, true, name)
                            }
                        }
                    }
                >
                    {button}
                </Popconfirm>
            </Space>
        </Space>
    </Card>
}

function ServicesData(services) {
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

export function Monitor() {
    const [data, setData] = useState('loading...');

    useEffect(() => {
        const fetchData = async () => {
            try {
                const response = await fetch('/api/admin/services', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                });

                if (!response.ok) {
                    throw new Error('Network response was not ok');
                }

                const result = await response.json();
                // 等待1秒后加载
                await new Promise((resolve) => {
                    setTimeout(resolve, 100);
                });
                setData(result);
            } catch (error) { /* empty */
            }
        };

        fetchData();
    }, []); // 空的依赖项数组，确保只在组件挂载时执行

    return <ServicesData services={data}/>;
}