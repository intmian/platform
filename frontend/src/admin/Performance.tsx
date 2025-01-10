import {useEffect, useState} from 'react';
import {Card, Col, List, Progress, Row, Table, Tabs} from 'antd';
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
                        <List
                            dataSource={[
                                {label: '总内存', value: formatBytes(data.memory.total)},
                                {label: '已用内存', value: formatBytes(data.memory.used)},
                                {label: '空闲内存', value: formatBytes(data.memory.free)},
                                {label: '共享内存', value: formatBytes(data.memory.shared)},
                                {label: '缓冲区', value: formatBytes(data.memory.buffers)},
                                {label: '缓存', value: formatBytes(data.memory.cached)},
                                {label: '可用内存', value: formatBytes(data.memory.available)},
                            ]}
                            renderItem={item => (
                                <List.Item>
                                    <List.Item.Meta
                                        title={item.label}
                                        description={item.value}
                                    />
                                </List.Item>
                            )}
                        />
                    </TabPane>
                    <TabPane tab="Swap详情" key="2">
                        <List
                            dataSource={[
                                {label: '总Swap', value: formatBytes(data.swap.total)},
                                {label: '已用Swap', value: formatBytes(data.swap.used)},
                                {label: '空闲Swap', value: formatBytes(data.swap.free)},
                                {label: 'Swap使用率', value: `${data.swap.usedPercent.toFixed(2)}%`},
                            ]}
                            renderItem={item => (
                                <List.Item>
                                    <List.Item.Meta
                                        title={item.label}
                                        description={item.value}
                                    />
                                </List.Item>
                            )}
                        />
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
