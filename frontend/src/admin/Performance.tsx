import {useEffect, useState} from 'react';
import {Card, Col, Flex, List, Progress, Row, Table, Tabs, Tooltip} from 'antd';
import TabPane from "antd/es/tabs/TabPane";

function formatBytes(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

const Performance = () => {
    const [data, setData] = useState({
        memory: {
            total: 0,
            used: 0,
            free: 0,
            shared: 0,
            buffers: 0,
            cached: 0,
            available: 0,
            usedPercent: 0,
        },
        swap: {
            total: 0,
            used: 0,
            free: 0,
            usedPercent: 0,
        },
        cpu: {
            percent: 0,
            info: [],
            times: [],
        },
        top10Mem: [],
        top10Cpu: []
    });

    useEffect(() => {
        const eventSource = new EventSource('/api/admin/system/usage/sse');
        eventSource.onmessage = (event) => {
            const result = JSON.parse(event.data);
            setData(result);
        };

        return () => {
            eventSource.close();
        };
    }, []);

    const columns = [
        {
            title: 'PID',
            dataIndex: 'pid',
            key: 'pid',
        },
        {
            title: '进程名',
            dataIndex: 'name',
            key: 'name',
        },
        {
            title: '内存占用 (%)',
            dataIndex: 'memory',
            key: 'memory',
            render: (text: number) => text.toFixed(2),
        },
        {
            title: 'CPU占用 (%)',
            dataIndex: 'cpu',
            key: 'cpu',
            render: (text: number) => text.toFixed(2),
        },
    ];
    console.log(data);
    return (
        <div className="site-statistic-demo-card">
            <Card>
                <Row gutter={16}>
                    <Col span={12}>
                        <p>内存使用率</p>
                        <Progress
                            type="dashboard"
                            percent={data.memory.usedPercent}
                            format={percent => `${percent?.toFixed(2)}%`}
                            strokeColor="#3f8600"
                        />
                    </Col>
                    <Col span={12}>
                        <p>CPU 使用率</p>
                        <Progress
                            type="dashboard"
                            percent={data.cpu.percent}
                            format={percent => `${percent?.toFixed(2)}%`}
                            strokeColor="#cf1322"
                        />
                    </Col>
                </Row>
            </Card>
            <Card
                style={{marginTop: 24}}
            >
                <Tabs defaultActiveKey="1">
                    <TabPane tab="内存 top10" key="1">
                        <Table
                            dataSource={data.top10Mem}
                            columns={columns}
                            rowKey="pid"
                            pagination={false}
                        />
                    </TabPane>
                    <TabPane tab="CPU top10" key="2">
                        <Table
                            dataSource={data.top10Cpu}
                            columns={columns}
                            rowKey="pid"
                            pagination={false}
                        />
                    </TabPane>
                </Tabs>
            </Card>


            <Card style={{marginTop: 24}}>
                <Tabs defaultActiveKey="1">
                    <TabPane tab="内存详情" key="1">
                        <Flex wrap gap={"small"}>
                            {[
                                {
                                    label: '总内存',
                                    value: formatBytes(data.memory.total),
                                    meaning: "总内存是指系统中所有内存的总和"
                                },
                                {
                                    label: '已用内存',
                                    value: formatBytes(data.memory.used),
                                    meaning: "已用内存是指系统中已经被使用的内存"
                                },
                                {
                                    label: '空闲内存',
                                    value: formatBytes(data.memory.free),
                                    meaning: "空闲内存是指系统中未被使用的内存"
                                },
                                {
                                    label: '共享内存',
                                    value: formatBytes(data.memory.shared),
                                    meaning: "共享内存是指系统中被多个进程共享的内存"
                                },
                                {
                                    label: '缓冲区',
                                    value: formatBytes(data.memory.buffers),
                                    meaning: "缓冲区是指系统中用于缓冲的内存"
                                },
                                {
                                    label: '缓存',
                                    value: formatBytes(data.memory.cached),
                                    meaning: "缓存是指系统中用于文件缓存的内存"
                                },
                                {
                                    label: '可用内存',
                                    value: formatBytes(data.memory.available),
                                    meaning: "可用内存是指系统中可以被使用的内存"
                                },
                            ].map((item, index) => (
                                <Card key={index} style={{
                                    width: 130,
                                    marginBottom: 16,
                                }}>
                                    <Card.Meta
                                        title={<Tooltip title={item.meaning}>{item.label}</Tooltip>}
                                        description={item.value}
                                    />
                                </Card>
                            ))}
                        </Flex>
                    </TabPane>
                    <TabPane tab="Swap详情" key="2">
                        <Flex wrap gap={"small"}>
                            {[
                                {
                                    label: '总Swap',
                                    value: formatBytes(data.swap.total),
                                    meaning: "总Swap是指系统中所有Swap的总和"
                                },
                                {
                                    label: '已用Swap',
                                    value: formatBytes(data.swap.used),
                                    meaning: "已用Swap是指系统中已经被使用的Swap"
                                },
                                {
                                    label: '空闲Swap',
                                    value: formatBytes(data.swap.free),
                                    meaning: "空闲Swap是指系统中未被使用的Swap"
                                },
                                {
                                    label: 'Swap使用率',
                                    value: `${data.swap.usedPercent.toFixed(2)}%`,
                                    meaning: "Swap使用率是指系统中Swap的使用率"
                                },
                            ].map((item, index) => (
                                <Card key={index} style={{
                                    width: 150,
                                    marginBottom: 16,
                                }}>
                                    <Card.Meta
                                        title={<Tooltip title={item.meaning}>{item.label}</Tooltip>}
                                        description={item.value}
                                    />
                                </Card>
                            ))}
                        </Flex>
                    </TabPane>
                    <TabPane tab="CPU详情" key="3">
                        <List
                            dataSource={data.cpu.info}
                            renderItem={(info, index) => (
                                <List.Item key={index}>
                                    {info.modelName} - {info.cores} 核心
                                </List.Item>
                            )}
                        />
                    </TabPane>
                </Tabs>
            </Card>
        </div>
    );
};

export default Performance;
