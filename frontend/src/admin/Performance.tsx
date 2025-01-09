import {useEffect, useState} from 'react';
import {Card, Col, List, Progress, Row, Table} from 'antd';

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
        top10: []
    });

    useEffect(() => {
        const fetchData = async () => {
            const response = await fetch('/api/admin/system/usage'
                , {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                }
            );
            const result = await response.json();
            setData(result);
        };

        fetchData();
        const interval = setInterval(fetchData, 5000);

        return () => clearInterval(interval);
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
    ];

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
            <Row gutter={16} style={{marginTop: 24}}>
                <Col span={24}>
                    <Card title="Top 10 内存占用进程">
                        <Table
                            dataSource={data.top10}
                            columns={columns}
                            rowKey="pid"
                            pagination={false}
                        />
                    </Card>
                </Col>
            </Row>
            <Row gutter={16} style={{marginTop: 24}}>
                <Col span={12}>
                    <Card title="内存 详情">
                        <List
                            dataSource={[
                                {label: 'Total', value: formatBytes(data.memory.total)},
                                {label: 'Used', value: formatBytes(data.memory.used)},
                                {label: 'Free', value: formatBytes(data.memory.free)},
                                {label: 'Shared', value: formatBytes(data.memory.shared)},
                                {label: 'Buffers', value: formatBytes(data.memory.buffers)},
                                {label: 'Cached', value: formatBytes(data.memory.cached)},
                                {label: 'Available', value: formatBytes(data.memory.available)},
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
                    </Card>
                </Col>
                <Col span={12}>
                    <Card title="Swap 详情">
                        <List
                            dataSource={[
                                {label: 'Total', value: formatBytes(data.swap.total)},
                                {label: 'Used', value: formatBytes(data.swap.used)},
                                {label: 'Free', value: formatBytes(data.swap.free)},
                                {label: 'Used Percent', value: `${data.swap.usedPercent.toFixed(2)}%`},
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
                    </Card>
                </Col>
            </Row>
            <Row gutter={16} style={{marginTop: 24}}>
                <Col span={24}>
                    <Card title="CPU 详情">
                        <List
                            dataSource={data.cpu.info}
                            renderItem={(info, index) => (
                                <List.Item key={index}>
                                    {info.modelName} - {info.cores} cores
                                </List.Item>
                            )}
                        />
                    </Card>
                </Col>
            </Row>
        </div>
    );
};

export default Performance;
