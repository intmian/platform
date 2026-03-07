import {Card, Col, Row, Typography} from "antd";
import {ConfigsCtr, UniConfig} from "../common/UniConfig";
import {ConfigsType, ConfigType} from "../common/UniConfigDef";

const {Paragraph} = Typography;

const AI_MODE_OPTIONS = [
    {value: "cheap", label: "cheap"},
    {value: "fast", label: "fast"},
    {value: "normal", label: "normal"},
];

const AIConfigs = new ConfigsCtr(ConfigsType.Plat);
AIConfigs.addBaseConfig("openai.base", "OpenAI Base URL", ConfigType.String, "AI 服务 Base URL");
AIConfigs.addBaseConfig("openai.token", "OpenAI Token", ConfigType.String, "AI 服务 Token", {secret: true});
AIConfigs.addBaseConfig("openai.model.cheap", "模型列表", ConfigType.SliceString, "按顺序回退");
AIConfigs.addBaseConfig("openai.model.fast", "模型列表", ConfigType.SliceString, "按顺序回退");
AIConfigs.addBaseConfig("openai.model.normal", "模型列表", ConfigType.SliceString, "按顺序回退");
AIConfigs.addEnumConfig("openai.scene.rewrite", "AI 重写模型档位", AI_MODE_OPTIONS, "默认 fast");
AIConfigs.addEnumConfig("openai.scene.summary", "新闻汇总模型档位", AI_MODE_OPTIONS, "默认 cheap");
AIConfigs.addEnumConfig("openai.scene.translate", "翻译模型档位", AI_MODE_OPTIONS, "默认 cheap");

const AI_MODEL_CONFIGS = [
    {key: "openai.model.cheap", title: "cheap"},
    {key: "openai.model.fast", title: "fast"},
    {key: "openai.model.normal", title: "normal"},
];

const AI_SCENE_CONFIGS = [
    {key: "openai.scene.rewrite", title: "重写"},
    {key: "openai.scene.summary", title: "汇总"},
    {key: "openai.scene.translate", title: "翻译"},
];

export function AISetting() {
    return <Card title="AI 设置" style={{marginBottom: 16}}>
        <Paragraph type="secondary">
            模型池固定分为 `cheap`、`fast`、`normal` 三档；业务侧按场景选择档位，再把档位和模型池传给 AI 模块。
        </Paragraph>
        <Card size="small" title="连接配置" style={{marginBottom: 16}}>
            <UniConfig configCtr={AIConfigs} configKeys={["openai.base", "openai.token"]}/>
        </Card>
        <Card size="small" title="模型池" style={{marginBottom: 16}}>
            <Row gutter={[16, 16]}>
                {AI_MODEL_CONFIGS.map((item) => (
                    <Col xs={24} lg={8} key={item.key}>
                        <Card size="small" title={item.title}>
                            <UniConfig configCtr={AIConfigs} configKeys={[item.key]} hideLabels={true}/>
                        </Card>
                    </Col>
                ))}
            </Row>
        </Card>
        <Card size="small" title="场景档位">
            <Row gutter={[16, 16]}>
                {AI_SCENE_CONFIGS.map((item) => (
                    <Col xs={24} lg={8} key={item.key}>
                        <Card size="small" title={item.title}>
                            <UniConfig configCtr={AIConfigs} configKeys={[item.key]} hideLabels={true}/>
                        </Card>
                    </Col>
                ))}
            </Row>
        </Card>
    </Card>;
}
