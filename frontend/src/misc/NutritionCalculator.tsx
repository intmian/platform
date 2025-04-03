import {useEffect, useState} from 'react';
import {Button, Col, Form, InputNumber, message, Row, Space, Table, Tooltip, Typography} from 'antd';
import {useIsMobile} from "../common/hooksv2";
import {ClearOutlined, DeleteOutlined, PlusOutlined, QuestionCircleOutlined} from '@ant-design/icons';

const {Title} = Typography;

// 单位转换常数
const KCAL_TO_KJ = 4.184;
const DAILY_KCAL_MALE = 2500;
const DAILY_KCAL_FEMALE = 2000;

// 优化移动端输入配置
const mobileInputProps = {
    inputMode: 'decimal' as const,
    controls: false,
    style: {
        width: '100%',
    },
    size: 'large'
};

// 桌面端输入配置
const desktopInputProps = {
    style: {width: '100%'}
};

// 获取当前输入框配置
const useInputProps = () => {
    const isMobile = useIsMobile();
    return isMobile ? mobileInputProps : desktopInputProps;
}

// 每日摄入项接口
interface DailyIntakeItem {
    id: string;
    timestamp: number;
    totalKcal: number;
    totalKj: number;
    malePercent: number;
    femalePercent: number;
    fat: number;
}

const NutritionCalculator = () => {
    const isMobile = useIsMobile();
    const [formData, setFormData] = useState({
        unitTotal: 0,
        unitNum: 100,
        unitKcal: 0,
        unitKj: 0,
        totalKcal: 0,
        totalKj: 0,
        fat: 0,
        malePercent: 0,
        femalePercent: 0
    });

    // 每日摄入列表状态
    const [dailyIntake, setDailyIntake] = useState<DailyIntakeItem[]>([]);
    const [selectedRowKeys, setSelectedRowKeys] = useState<string[]>([]);

    // 从本地存储加载数据
    useEffect(() => {
        const loadDailyIntake = () => {
            try {
                const storedData = localStorage.getItem('dailyIntake');
                if (storedData) {
                    const parsedData = JSON.parse(storedData);
                    // 检查是否需要清除数据（凌晨3点后）
                    const now = new Date();
                    const lastSavedDate = new Date(Math.max(...parsedData.map((item: DailyIntakeItem) => item.timestamp)));
                    const lastSavedDay = new Date(lastSavedDate.getFullYear(), lastSavedDate.getMonth(), lastSavedDate.getDate());
                    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

                    // 如果最后保存日期是昨天或更早，且现在时间已经过了凌晨3点，则清除数据
                    if (lastSavedDay < today && now.getHours() >= 3) {
                        clearDailyIntake();
                    } else {
                        setDailyIntake(parsedData);
                    }
                }
            } catch (error) {
                console.error('Failed to load daily intake data:', error);
            }
        };

        loadDailyIntake();
    }, []);

    // 保存数据到本地存储
    const saveDailyIntake = (data: DailyIntakeItem[]) => {
        try {
            localStorage.setItem('dailyIntake', JSON.stringify(data));
        } catch (error) {
            console.error('Failed to save daily intake data:', error);
        }
    };

    // 清除每日摄入数据
    const clearDailyIntake = () => {
        setDailyIntake([]);
        setSelectedRowKeys([]);
        localStorage.removeItem('dailyIntake');
        message.success('已清除所有记录');
    };

    // 添加当前数据到每日摄入
    const addToDailyIntake = () => {
        if (formData.totalKcal <= 0) {
            message.warning('请先计算食品热量');
            return;
        }

        const newItem: DailyIntakeItem = {
            id: Date.now().toString(),
            timestamp: Date.now(),
            totalKcal: formData.totalKcal,
            totalKj: formData.totalKj,
            malePercent: formData.malePercent,
            femalePercent: formData.femalePercent,
            fat: formData.fat
        };

        const updatedIntake = [...dailyIntake, newItem];
        setDailyIntake(updatedIntake);
        saveDailyIntake(updatedIntake);
        message.success('已添加到每日摄入');
    };

    // 删除单条每日摄入记录
    const deleteIntakeItem = (id: string) => {
        const updatedIntake = dailyIntake.filter(item => item.id !== id);
        setDailyIntake(updatedIntake);
        setSelectedRowKeys(selectedRowKeys.filter(key => key !== id));
        saveDailyIntake(updatedIntake);
    };

    // 计算选中项或所有项的总和
    const calculateTotal = () => {
        const itemsToCalculate = selectedRowKeys.length > 0
            ? dailyIntake.filter(item => selectedRowKeys.includes(item.id))
            : dailyIntake;

        return {
            totalKcal: itemsToCalculate.reduce((sum, item) => sum + item.totalKcal, 0),
            totalKj: itemsToCalculate.reduce((sum, item) => sum + item.totalKj, 0),
            malePercent: itemsToCalculate.reduce((sum, item) => sum + item.malePercent, 0),
            femalePercent: itemsToCalculate.reduce((sum, item) => sum + item.femalePercent, 0),
            fat: itemsToCalculate.reduce((sum, item) => sum + item.fat, 0)
        };
    };

    // 单位热量同步处理
    const handleUnitChange = (field: string, value: number) => {
        const newData = {...formData};

        if (field === 'unitKcal') {
            newData.unitKcal = value;
            newData.unitKj = Number((value * KCAL_TO_KJ).toFixed(2));
        } else {
            newData.unitKj = value;
            newData.unitKcal = Number((value / KCAL_TO_KJ).toFixed(2));
        }

        updateCalculations(newData);
    };

    // 总热量同步处理
    const handleTotalChange = (field: string, value: number) => {
        const newData = {...formData};

        if (field === 'totalKcal') {
            newData.totalKcal = value;
            newData.totalKj = Number((value * KCAL_TO_KJ).toFixed(2));
        } else {
            newData.totalKj = value;
            newData.totalKcal = Number((value / KCAL_TO_KJ).toFixed(2));
        }

        updateSecondaryFields(newData);
    };

    // 更新所有计算结果
    const updateCalculations = (data: any) => {
        // 计算总热量
        data.totalKcal = Number((data.unitTotal / data.unitNum * data.unitKcal).toFixed(2));
        data.totalKj = Number((data.unitTotal / data.unitNum * data.unitKj).toFixed(2));

        updateSecondaryFields(data);
    };

    // 更新衍生字段
    const updateSecondaryFields = (data: any) => {
        // 计算脂肪量
        data.fat = Number((data.totalKcal / 7.7).toFixed(2));

        // 计算百分比
        data.malePercent = Number(((data.totalKcal / DAILY_KCAL_MALE) * 100).toFixed(1));
        data.femalePercent = Number(((data.totalKcal / DAILY_KCAL_FEMALE) * 100).toFixed(1));

        setFormData({...data});
    };

    // 脂肪量显示格式化
    const formatFat = (fat: number) => {
        return fat >= 1000
            ? {value: fat / 1000, unit: 'kg'}
            : {value: fat, unit: 'g'};
    };

    // 表格列定义
    const columns = [
        {
            title: '时间',
            dataIndex: 'timestamp',
            key: 'timestamp',
            render: (timestamp: number) => new Date(timestamp).toLocaleTimeString(),
            width: isMobile ? 80 : 100
        },
        {
            title: '大卡',
            dataIndex: 'totalKcal',
            key: 'totalKcal',
            render: (kcal: number) => kcal.toFixed(1),
            width: isMobile ? 60 : 80
        },
        {
            title: '千焦',
            dataIndex: 'totalKj',
            key: 'totalKj',
            render: (kj: number) => kj.toFixed(1),
            width: isMobile ? 60 : 80
        },
        {
            title: '脂肪',
            dataIndex: 'fat',
            key: 'fat',
            render: (fat: number) => {
                const formatted = formatFat(fat);
                return `${formatted.value.toFixed(1)}${formatted.unit}`;
            },
            width: isMobile ? 60 : 80
        },
        {
            title: '操作',
            key: 'action',
            render: (_: any, record: DailyIntakeItem) => (
                <Button
                    type="text"
                    danger
                    icon={<DeleteOutlined/>}
                    onClick={() => deleteIntakeItem(record.id)}
                />
            ),
            width: isMobile ? 60 : 80
        }
    ];

    // 表格行选择配置
    const rowSelection = {
        selectedRowKeys,
        onChange: (newSelectedRowKeys: React.Key[]) => {
            setSelectedRowKeys(newSelectedRowKeys as string[]);
        }
    };

    // 计算总计
    const totals = calculateTotal();

    return (
        <Form layout="vertical" style={{
            maxWidth: 800, margin: '0 auto', padding: 24
        }}>
            {/* 食品热量计算部分 */}
            <Title level={4} style={{marginBottom: 24}}>食品热量计算
                <Tooltip
                    title={
                        <div style={{color: 'white', maxWidth: 300}}>
                            <div>逻辑：输入食物热量将会同步修改总热量、热量占比、对应脂肪。修改后三者也会自动相互转换。</div>
                            <div>食物热量填写方法：如果面包的营养标签写了100g含有254kJ，同时重量为200g，那么单位质量或体积填200，单位热量(千焦)填254。</div>
                            <div>青年男性参考按照2500Kj，青年女性参考按照2000Kj计算。</div>
                            <div>脂肪按照1g脂肪7.7Kcal计算（人体脂肪含水所以不是9）。</div>
                        </div>

                    }
                    overlayInnerStyle={{
                        color: 'white', // 设置文字颜色
                        maxWidth: 300, // 设置最大宽度，避免内容太长
                    }}
                >
                    <QuestionCircleOutlined
                        style={{marginLeft: 8}}
                    />
                </Tooltip>
            </Title>

            <Row gutter={isMobile ? 8 : 16}>
                <Col xs={12} sm={6}>
                    <Form.Item label="总质量或体积">
                        <InputNumber
                            value={formData.unitTotal}
                            onChange={v => updateCalculations({...formData, unitTotal: Number(v)})}
                            min={0}
                            step={1}
                            {...useInputProps()}
                            addonAfter={<Button
                                onClick={
                                    () => {
                                        if (formData.unitNum === 1) {
                                            updateCalculations({...formData, unitTotal: formData.unitTotal + 1});
                                        } else {
                                            updateCalculations({...formData, unitTotal: 1, unitNum: 1});
                                        }
                                    }
                                }
                                type={"text"}
                            >
                                {formData.unitNum === 1 ? '加一份' : '以份计算'}
                            </Button>
                            }/>
                    </Form.Item>
                </Col>
                <Col xs={12} sm={6}>
                    <Form.Item label="单位质量或体积">
                        <InputNumber
                            value={formData.unitNum}
                            onChange={v => updateCalculations({...formData, unitNum: Number(v)})}
                            min={0}
                            step={1}
                            {...useInputProps()}
                            addonAfter={<Button
                                type={"text"}
                                onClick={
                                    () => updateCalculations({...formData, unitNum: 0})
                                }
                            >
                                清空
                            </Button>}
                        />
                    </Form.Item>
                </Col>
                <Col xs={12} sm={6}>
                    <Form.Item label="单位热量(大卡) ">
                        <InputNumber
                            value={formData.unitKcal}
                            onChange={v => handleUnitChange('unitKcal', Number(v))}
                            min={0}
                            step={1}
                            {...useInputProps()}
                            addonAfter="kcal/unit"
                        />
                    </Form.Item>
                </Col>
                <Col xs={12} sm={6}>
                    <Form.Item label="单位热量(千焦)">
                        <InputNumber
                            value={formData.unitKj}
                            onChange={v => handleUnitChange('unitKj', Number(v))}
                            min={0}
                            step={1}
                            {...useInputProps()}
                            addonAfter="kJ/unit"
                        />
                    </Form.Item>
                </Col>
            </Row>

            {/* 总热量部分 */}
            <Title level={4} style={{marginBottom: 24, marginTop: 24}}>总热量
                <Space style={{marginLeft: 16}}>
                    <Button
                        type="primary"
                        icon={<PlusOutlined/>}
                        onClick={addToDailyIntake}
                        size={isMobile ? "middle" : "small"}
                    >
                        计入每日
                    </Button>
                    <Button
                        danger
                        icon={<ClearOutlined/>}
                        onClick={clearDailyIntake}
                        size={isMobile ? "middle" : "small"}
                    >
                        清除
                    </Button>
                </Space>
            </Title>
            <Row gutter={isMobile ? 8 : 16}>
                <Col xs={12} sm={12}>
                    <Form.Item label="大卡">
                        <InputNumber
                            value={formData.totalKcal}
                            onChange={v => handleTotalChange('totalKcal', Number(v))}
                            min={0}
                            step={1}
                            {...useInputProps()}
                            addonAfter="kcal"
                        />
                    </Form.Item>
                </Col>
                <Col xs={12} sm={12}>
                    <Form.Item label="千焦">
                        <InputNumber
                            value={formData.totalKj}
                            onChange={v => handleTotalChange('totalKj', Number(v))}
                            min={0}
                            step={1}
                            {...useInputProps()}
                            addonAfter="kJ"
                        />
                    </Form.Item>
                </Col>
            </Row>

            {/* 热量百分比部分 */}
            <Title level={4} style={{marginBottom: 24, marginTop: 24}}>热量占比</Title>
            <Row gutter={isMobile ? 8 : 16}>
                <Col xs={12} sm={12}>
                    <Form.Item label="青年男性参考">
                        <InputNumber
                            value={formData.malePercent}
                            onChange={v => {
                                const total = (Number(v) / 100) * DAILY_KCAL_MALE;
                                handleTotalChange('totalKcal', total);
                            }}
                            min={0}
                            max={500}
                            step={1}
                            addonAfter="%"
                            parser={value => parseFloat(value?.toString().replace('%', '') || '0')}
                            {...useInputProps()}
                        />
                    </Form.Item>
                </Col>
                <Col xs={12} sm={12}>
                    <Form.Item label="青年女性参考">
                        <InputNumber
                            value={formData.femalePercent}
                            onChange={v => {
                                const total = (Number(v) / 100) * DAILY_KCAL_FEMALE;
                                handleTotalChange('totalKcal', total);
                            }}
                            min={0}
                            max={500}
                            step={1}
                            addonAfter="%"
                            parser={value => parseFloat(value?.toString().replace('%', '') || '0')}
                            {...useInputProps()}
                        />
                    </Form.Item>
                </Col>
            </Row>

            {/* 脂肪部分 */}
            <Title level={4} style={{marginBottom: 24, marginTop: 24}}>对应脂肪</Title>
            <Row>
                <Col xs={24}>
                    <Form.Item>
                        <InputNumber
                            value={formatFat(formData.fat).value}
                            min={0}
                            addonAfter={formatFat(formData.fat).unit}
                            parser={value => {
                                return parseFloat(value || "0");
                            }}
                            onChange={v => {
                                const newFat = formatFat(formData.fat).unit === 'kg'
                                    ? Number(v) * 1000
                                    : Number(v);
                                handleTotalChange('totalKcal', newFat * 7.7);
                            }}
                            {...useInputProps()}
                        />
                    </Form.Item>
                </Col>
            </Row>

            {/* 每日摄入部分 */}
            <Title level={4} style={{marginBottom: 24, marginTop: 24}}>每日摄入</Title>
            <Row>
                <Col xs={24}>
                    {dailyIntake.length > 0 ? (
                        <>
                            <Table
                                rowSelection={rowSelection}
                                columns={columns}
                                dataSource={dailyIntake}
                                rowKey="id"
                                pagination={false}
                                size="small"
                                scroll={{x: 'max-content'}}
                                style={{marginBottom: 16}}
                            />
                            <div style={{
                                background: '#f7f7f7',
                                padding: '12px 16px',
                                borderRadius: 4,
                                marginTop: 16
                            }}>
                                <Typography.Text strong>
                                    {selectedRowKeys.length > 0 ? `已选择 ${selectedRowKeys.length} 项` : '总计'}：
                                </Typography.Text>
                                <div style={{display: 'flex', flexWrap: 'wrap', gap: 16, marginTop: 8}}>
                                    <div>
                                        <Typography.Text type="secondary">大卡：</Typography.Text>
                                        <Typography.Text strong>{totals.totalKcal.toFixed(1)} kcal</Typography.Text>
                                    </div>
                                    <div>
                                        <Typography.Text type="secondary">千焦：</Typography.Text>
                                        <Typography.Text strong>{totals.totalKj.toFixed(1)} kJ</Typography.Text>
                                    </div>
                                    <div>
                                        <Typography.Text type="secondary">男性：</Typography.Text>
                                        <Typography.Text strong>{totals.malePercent.toFixed(1)}%</Typography.Text>
                                    </div>
                                    <div>
                                        <Typography.Text type="secondary">女性：</Typography.Text>
                                        <Typography.Text strong>{totals.femalePercent.toFixed(1)}%</Typography.Text>
                                    </div>
                                    <div>
                                        <Typography.Text type="secondary">脂肪：</Typography.Text>
                                        <Typography.Text strong>
                                            {formatFat(totals.fat).value.toFixed(1)}{formatFat(totals.fat).unit}
                                        </Typography.Text>
                                    </div>
                                </div>
                            </div>
                        </>
                    ) : (
                        <Typography.Text type="secondary">
                            暂无数据，请使用"计入每日"按钮添加数据
                        </Typography.Text>
                    )}
                </Col>
            </Row>
        </Form>
    );
};

export default NutritionCalculator;