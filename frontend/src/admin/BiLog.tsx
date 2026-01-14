import React, { useState } from 'react';
import { Table, Card, Form, Input, Button, message, Select, Space, Divider, Switch, Row, Col } from 'antd';
import { MinusCircleOutlined, PlusOutlined } from '@ant-design/icons';
import { sendSearchBiLog, TodoneDbLog, DbLogData } from '../common/newSendHttp';

// === 配置区域 ===

interface ColumnConfig {
    title: string;
    dataIndex?: string | string[];
    key?: string;
    width?: number;
    ellipsis?: boolean;
    render?: (text: any, record: any) => React.ReactNode;
}

interface TableMetadata {
    label: string;
    columns: ColumnConfig[];
}

const TABLE_CONFIGS: Record<string, TableMetadata> = {
    'todone_db_log': {
        label: 'Todone 数据库日志',
        columns: [
            {
                title: 'record_time',
                dataIndex: 'record_time',
                width: 200,
                render: (time: number) => {
                    if (!time) return '-';
                    let t = time;
                    // 如果是10位时间戳（秒），转换为毫秒
                    if (t < 10000000000) {
                        t *= 1000;
                    }
                    return new Date(t).toLocaleString();
                },
            },
            {
                title: 'SQL',
                dataIndex: ['Data', 'Sql'],
                ellipsis: true,
            },
            {
                title: 'Rows',
                dataIndex: ['Data', 'Rows'],
                width: 100,
            },
            {
                title: 'Duration',
                dataIndex: ['Data', 'Duration'],
                width: 120,
                render: (val: number) => (val ? (val).toFixed(3) : '0')
            },
            {
                title: '错误',
                dataIndex: ['Data', 'Err'],
                render: (text: string) => <span style={{ color: text ? 'red' : 'green' }}>{text || 'Success'}</span>
            },
        ]
    }
};

const DEFAULT_ORDER_BY = 'record_time';

// === 组件区域 ===

const BiLog = () => {
    const [selectedTable, setSelectedTable] = useState<string>('todone_db_log');
    const [data, setData] = useState<DbLogData<any>[]>([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(false);
    const [pagination, setPagination] = useState({ current: 1, pageSize: 20 });
    
    // 保存当前的查询参数，用于翻页
    const [lastQueryParams, setLastQueryParams] = useState<{
        conditions: Record<string, any>;
        orderBy: string;
        desc: boolean;
    } | null>(null);

    const [form] = Form.useForm();

    const doQuery = (table: string, page: number, size: number, params: { conditions: Record<string, any>, orderBy: string, desc: boolean }) => {
        setLoading(true);
        sendSearchBiLog<any>(table, {
            pageNum: page,
            pageSize: size,
            conditions: params.conditions,
            orderBy: params.orderBy,
            desc: params.desc
        }, (res) => {
            setLoading(false);
            if (res.ok) {
                setData(res.data.List);
                setTotal(res.data.Total);
                setPagination({ current: page, pageSize: size });
                setLastQueryParams(params);
            } else {
                message.error('获取日志失败');
            }
        });
    };

    const handleTableChange = (pag: any) => {
        if (!lastQueryParams) return; 
        doQuery(selectedTable, pag.current, pag.pageSize, lastQueryParams);
    };

    const onFinish = (values: any) => {
        if (!selectedTable) {
            message.warning("请先选择数据表");
            return;
        }

        // 1. 组装筛选条件
        const conditions: Record<string, any> = {};
        if (values.filters && Array.isArray(values.filters)) {
            values.filters.forEach((item: { key: string, value: string }) => {
                if (item && item.key) {
                    // 尝试转义数字，如果看起来像数字
                    let val: any = item.value;
                    if (!isNaN(Number(val)) && val.trim() !== '') {
                        val = Number(val);
                    }
                    conditions[item.key] = val;
                }
            });
        }

        // 2. 组装排序
        const orderBy = values.orderBy || DEFAULT_ORDER_BY;
        const desc = values.desc !== undefined ? values.desc : true; // 默认倒序

        // 3. 执行查询 (总是重置到第一页)
        doQuery(selectedTable, 1, pagination.pageSize, {
            conditions,
            orderBy,
            desc
        });
    };

    const tableOptions = Object.keys(TABLE_CONFIGS).map(key => ({
        label: TABLE_CONFIGS[key].label,
        value: key
    }));

    const currentColumns = TABLE_CONFIGS[selectedTable]?.columns || [];

    return (
        <div style={{ padding: 24 }}>
            <Card title="通用日志查询 (BiLog)" bordered={false} style={{ width: '100%' }}>
                <Form 
                    form={form} 
                    onFinish={onFinish} 
                    layout="vertical" 
                    disabled={loading}
                    initialValues={{
                        table: 'todone_db_log',
                        orderBy: DEFAULT_ORDER_BY,
                        desc: true,
                        filters: []
                    }}
                >
                    {/* 第一行：表选择 与 基础操作 */}
                    <Row gutter={24}>
                        <Col span={8}>
                            <Form.Item label="选择数据表" name="table" rules={[{ required: true }]}>
                                <Select 
                                    options={tableOptions} 
                                    onChange={(val) => {
                                        setSelectedTable(val);
                                        setData([]); // 切换表清空数据
                                        setLastQueryParams(null);
                                    }} 
                                />
                            </Form.Item>
                        </Col>
                        <Col span={8}>
                             <Form.Item label="排序字段" name="orderBy">
                                <Input placeholder="默认 RecordTime" />
                            </Form.Item>
                        </Col>
                        <Col span={8}>
                            <Form.Item label="排序方式" name="desc" valuePropName="checked">
                                <Switch checkedChildren="倒序 (DESC)" unCheckedChildren="正序 (ASC)" defaultChecked />
                            </Form.Item>
                        </Col>
                    </Row>

                    {/* 第二行：动态筛选条件 */}
                    <Form.List name="filters">
                        {(fields, { add, remove }) => (
                            <>
                                {fields.map(({ key, name, ...restField }) => (
                                    <Space key={key} style={{ display: 'flex', marginBottom: 8 }} align="baseline">
                                        <Form.Item
                                            {...restField}
                                            name={[name, 'key']}
                                            rules={[{ required: true, message: '请输入条件' }]}
                                        >
                                            <Input placeholder="条件 (如 Duration > ?)" />
                                        </Form.Item>
                                        <Form.Item
                                            {...restField}
                                            name={[name, 'value']}
                                            rules={[{ required: true, message: '请输入值' }]}
                                        >
                                            <Input placeholder="比较值 (如 100)" />
                                        </Form.Item>
                                        <MinusCircleOutlined onClick={() => remove(name)} />
                                    </Space>
                                ))}
                                <Form.Item>
                                    <Button type="dashed" onClick={() => add()} block icon={<PlusOutlined />}>
                                        添加筛选条件
                                    </Button>
                                </Form.Item>
                            </>
                        )}
                    </Form.List>

                    <Divider />

                    <Form.Item>
                        <Space>
                            <Button type="primary" htmlType="submit" loading={loading} disabled={!selectedTable}>
                                查询
                            </Button>
                            <Button onClick={() => {
                                form.resetFields();
                                form.setFieldsValue({ table: selectedTable }); // 重置时不清除表选择
                                setLastQueryParams(null);
                                setData([]);
                            }}>
                                重置条件
                            </Button>
                        </Space>
                    </Form.Item>
                </Form>

                <Table
                    columns={currentColumns}
                    dataSource={data}
                    rowKey={(record, index) => `${record.RecordTime}-${index}`}
                    pagination={{
                        ...pagination,
                        total: total,
                        showSizeChanger: true,
                        showQuickJumper: true
                    }}
                    loading={loading}
                    onChange={handleTableChange}
                    scroll={{ x: 1000 }}
                    locale={{ emptyText: lastQueryParams ? '暂无数据' : '请选择数据表并点击查询' }}
                />
            </Card>
        </div>
    );
};

export default BiLog;
