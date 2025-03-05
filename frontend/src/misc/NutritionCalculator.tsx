import {useState} from 'react';
import {Col, Form, InputNumber, Row, Typography} from 'antd';
import {useIsMobile} from "../common/hooksv2";

const {Title} = Typography;

// 单位转换常数
const KCAL_TO_KJ = 4.184;
const DAILY_KCAL_MALE = 2500;
const DAILY_KCAL_FEMALE = 2000;

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
        data.fat = Number((data.totalKcal / 9).toFixed(2));

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
        <Form layout="vertical" style={{maxWidth: 800, margin: '0 auto'}}>
            {/* 食品热量计算部分 */}
            <Title level={4} style={{marginBottom: 24}}>食品热量计算</Title>
            <Row gutter={isMobile ? 0 : 16}>
                <Col xs={24} sm={6}>
                    <Form.Item label="总质量或体积">
                        <InputNumber
                            value={formData.unitTotal}
                            onChange={v => updateCalculations({...formData, unitTotal: Number(v)})}
                            min={0}
                            step={1}
                            style={{width: '100%'}}
                        />
                    </Form.Item>
                </Col>
                <Col xs={24} sm={6}>
                    <Form.Item label="单位质量或体积">
                        <InputNumber
                            value={formData.unitNum}
                            onChange={v => updateCalculations({...formData, unitNum: Number(v)})}
                            min={0}
                            step={0.1}
                            style={{width: '100%'}}
                        />
                    </Form.Item>
                </Col>
                <Col xs={24} sm={6}>
                    <Form.Item label="单位热量 (kcal/g)">
                        <InputNumber
                            value={formData.unitKcal}
                            onChange={v => handleUnitChange('unitKcal', Number(v))}
                            min={0}
                            step={0.1}
                            style={{width: '100%'}}
                        />
                    </Form.Item>
                </Col>
                <Col xs={24} sm={6}>
                    <Form.Item label="单位热量 (kJ/g)">
                        <InputNumber
                            value={formData.unitKj}
                            onChange={v => handleUnitChange('unitKj', Number(v))}
                            min={0}
                            step={0.1}
                            style={{width: '100%'}}
                        />
                    </Form.Item>
                </Col>
            </Row>

            {/* 总热量部分 */}
            <Title level={4} style={{marginBottom: 24, marginTop: 24}}>总热量</Title>
            <Row gutter={isMobile ? 0 : 16}>
                <Col xs={24} sm={12}>
                    <Form.Item label="大卡 (kcal)">
                        <InputNumber
                            value={formData.totalKcal}
                            onChange={v => handleTotalChange('totalKcal', Number(v))}
                            min={0}
                            step={1}
                            style={{width: '100%'}}
                        />
                    </Form.Item>
                </Col>
                <Col xs={24} sm={12}>
                    <Form.Item label="千焦 (kJ)">
                        <InputNumber
                            value={formData.totalKj}
                            onChange={v => handleTotalChange('totalKj', Number(v))}
                            min={0}
                            step={1}
                            style={{width: '100%'}}
                        />
                    </Form.Item>
                </Col>
            </Row>

            {/* 热量百分比部分 */}
            <Title level={4} style={{marginBottom: 24, marginTop: 24}}>热量占比</Title>
            <Row gutter={isMobile ? 0 : 16}>
                <Col xs={24} sm={12}>
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
                            formatter={value => `${value}%`}
                            parser={value => parseFloat(value?.toString().replace('%', '') || '0')}
                            style={{width: '100%'}}
                        />
                    </Form.Item>
                </Col>
                <Col xs={24} sm={12}>
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
                            formatter={value => `${value}%`}
                            parser={value => parseFloat(value?.toString().replace('%', '') || '0')}
                            style={{width: '100%'}}
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
                            step={formatFat(formData.fat).unit === 'kg' ? 0.1 : 1}
                            formatter={value =>
                                `${value} ${formatFat(formData.fat).unit}`
                            }
                            parser={value => {
                                const num = parseFloat(value?.toString().replace(/[^\d.]/g, '') || 0);
                                return formatFat(formData.fat).unit === 'kg'
                                    ? num * 1000
                                    : num;
                            }}
                            onChange={v => {
                                const newFat = formatFat(formData.fat).unit === 'kg'
                                    ? Number(v) * 1000
                                    : Number(v);
                                handleTotalChange('totalKcal', newFat * 9);
                            }}
                            style={{width: '100%'}}
                        />
                    </Form.Item>
                </Col>
            </Row>
        </Form>
    );
};

export default NutritionCalculator;