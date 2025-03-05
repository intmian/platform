import {useState} from 'react';
import {Col, Form, InputNumber, Row, Tooltip, Typography} from 'antd';
import {useIsMobile} from "../common/hooksv2";
import {QuestionCircleOutlined} from '@ant-design/icons';

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
        // fontSize: '16px' // 解决iOS缩放问题
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
                        />
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
            <Title level={4} style={{marginBottom: 24, marginTop: 24}}>总热量</Title>
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
        </Form>
    );
};

export default NutritionCalculator;