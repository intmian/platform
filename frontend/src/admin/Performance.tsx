import React, { useEffect, useState } from 'react';
import { Card, Col, Row, Statistic, Table } from 'antd';
import { ArrowUpOutlined, ArrowDownOutlined } from '@ant-design/icons';

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
            const response = await fetch('/admin/system/usage');
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
            title: 'Name',
            dataIndex: 'name',
            key: 'name',
        },
        {
            title: 'Memory Usage (%)',
            dataIndex: 'memory',
            key: 'memory',
            render: (text) => text.toFixed(2),
        },
    ];

    return (
        <div className="site-statistic-demo-card">
            <Row gutter={16}>
                <Col span={12}>
                    <Card>
                        <Statistic
                            title="Memory Usage"
                            value={data.memory.usedPercent}
                            precision={2}
                            valueStyle={{ color: '#3f8600' }}
                            prefix={<ArrowUpOutlined />}
                            suffix="%"
                        />
                    </Card>
                </Col>
                <Col span={12}>
                    <Card>
                        <Statistic
                            title="CPU Usage"
                            value={data.cpu.percent}
                            precision={2}
                            valueStyle={{ color: '#cf1322' }}
                            prefix={<ArrowDownOutlined />}
                            suffix="%"
                        />
                    </Card>
                </Col>
            </Row>
            <Row gutter={16} style={{ marginTop: 24 }}>
                <Col span={24}>
                    <Card title="Top 10 Memory Consuming Processes">
                        <Table
                            dataSource={data.top10}
                            columns={columns}
                            rowKey="pid"
                            pagination={false}
                        />
                    </Card>
                </Col>
            </Row>
            <Row gutter={16} style={{ marginTop: 24 }}>
                <Col span={12}>
                    <Card title="Memory Details">
                        <ul>
                            <li>Total: {data.memory.total} bytes</li>
                            <li>Used: {data.memory.used} bytes</li>
                            <li>Free: {data.memory.free} bytes</li>
                            <li>Shared: {data.memory.shared} bytes</li>
                            <li>Buffers: {data.memory.buffers} bytes</li>
                            <li>Cached: {data.memory.cached} bytes</li>
                            <li>Available: {data.memory.available} bytes</li>
                        </ul>
                    </Card>
                </Col>
                <Col span={12}>
                    <Card title="Swap Details">
                        <ul>
                            <li>Total: {data.swap.total} bytes</li>
                            <li>Used: {data.swap.used} bytes</li>
                            <li>Free: {data.swap.free} bytes</li>
                            <li>Used Percent: {data.swap.usedPercent.toFixed(2)}%</li>
                        </ul>
                    </Card>
                </Col>
            </Row>
            <Row gutter={16} style={{ marginTop: 24 }}>
                <Col span={24}>
                    <Card title="CPU Details">
                        <ul>
                            {data.cpu.info.map((info, index) => (
                                <li key={index}>
                                    {info.modelName} - {info.cores} cores
                                </li>
                            ))}
                        </ul>
                    </Card>
                </Col>
            </Row>
        </div>
    );
};

export default Performance;
