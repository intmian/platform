import {Card, Typography} from "antd";
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
AIConfigs.addBaseConfig("openai.token", "OpenAI Token", ConfigType.String, "AI 服务 Token");
AIConfigs.addBaseConfig("openai.model.cheap", "cheap 模型列表", ConfigType.SliceString, "按顺序回退");
AIConfigs.addBaseConfig("openai.model.fast", "fast 模型列表", ConfigType.SliceString, "按顺序回退");
AIConfigs.addBaseConfig("openai.model.normal", "normal 模型列表", ConfigType.SliceString, "按顺序回退");
AIConfigs.addEnumConfig("openai.scene.rewrite", "AI 重写模型档位", AI_MODE_OPTIONS, "默认 fast");
AIConfigs.addEnumConfig("openai.scene.summary", "新闻汇总模型档位", AI_MODE_OPTIONS, "默认 cheap");
AIConfigs.addEnumConfig("openai.scene.translate", "翻译模型档位", AI_MODE_OPTIONS, "默认 cheap");

export function AISetting() {
    return <Card title="AI 设置" style={{marginBottom: 16}}>
        <Paragraph type="secondary">
            模型池固定分为 `cheap`、`fast`、`normal` 三档；业务侧按场景选择档位，再把档位和模型池传给 AI 模块。
        </Paragraph>
        <UniConfig configCtr={AIConfigs}/>
    </Card>;
}
