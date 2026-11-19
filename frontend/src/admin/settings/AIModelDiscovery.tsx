import {useEffect, useState} from "react";
import {Alert, Button, Card, Checkbox, Empty, Flex, Input, Spin, Tag, Typography} from "antd";
import {AIDiscoveredModel, AIModelCapabilitySource, AIProviderConfig, listAIProviderModels} from "../../common/aiConfig";
import {modelTypeLabel} from "./aiConfigModel";

const {Text} = Typography;

// 名字里带这些词的一般不是对话、转写或搜索模型，默认隐藏
const NON_CHAT_PATTERN = /embedding|tts|dall-e|image|moderation|realtime|davinci|babbage|sora|computer-use/i;

const SOURCE_TAGS: Record<AIModelCapabilitySource, {label: string, color?: string}> = {
    upstream: {label: "上游返回", color: "success"},
    rule: {label: "按名称判断"},
    unknown: {label: "需确认", color: "warning"},
};

function capabilityText(model: AIDiscoveredModel): string {
    return [
        modelTypeLabel(model.type),
        ...(model.reasoning.length > 0 ? [model.reasoning.join(" / ")] : []),
        ...(model.tools.includes("web_search") ? ["Web Search"] : []),
    ].join(" · ");
}

export function AIModelDiscovery({provider, onAdd, onClose}: {
    provider: AIProviderConfig;
    onAdd: (models: AIDiscoveredModel[]) => void;
    onClose: () => void;
}) {
    const [models, setModels] = useState<AIDiscoveredModel[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [keyword, setKeyword] = useState("");
    const [hideNonChat, setHideNonChat] = useState(true);
    const [selected, setSelected] = useState<string[]>([]);

    // 只在打开时拉取；编辑中的 provider 每次输入都会变，不作为依赖
    useEffect(() => {
        listAIProviderModels(provider)
            .then(setModels)
            .catch((err: Error) => setError(err.message))
            .finally(() => setLoading(false));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const existing = new Set(provider.models.map((model) => model.name));
    const visible = models.filter((model) => (
        (!hideNonChat || !NON_CHAT_PATTERN.test(model.name))
        && model.name.toLowerCase().includes(keyword.trim().toLowerCase())
    ));

    const toggle = (name: string, checked: boolean) => setSelected((current) => (
        checked ? [...current, name] : current.filter((item) => item !== name)
    ));

    return <Card size="small" title="获取模型" extra={<Button type="text" size="small" onClick={onClose}>收起</Button>}>
        <Flex vertical gap={10}>
            <Flex gap={12} align="center" wrap>
                <Input
                    allowClear
                    aria-label="搜索上游模型"
                    placeholder="搜索上游模型"
                    value={keyword}
                    onChange={(event) => setKeyword(event.target.value)}
                    style={{flex: "1 1 200px"}}
                />
                <Checkbox checked={hideNonChat} onChange={(event) => setHideNonChat(event.target.checked)}>隐藏向量、绘图等模型</Checkbox>
            </Flex>
            {error && <Alert type="error" showIcon message="获取失败" description={error}/>}
            {loading && <Flex justify="center" style={{padding: 24}}><Spin/></Flex>}
            {!loading && !error && visible.length === 0 && <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="没有匹配的模型"/>}
            {!loading && visible.length > 0 && <Flex vertical gap={8} style={{maxHeight: 320, overflowY: "auto"}}>
                {visible.map((model) => {
                    const added = existing.has(model.name);
                    const source = SOURCE_TAGS[model.source];
                    return <Flex key={model.name} align="center" justify="space-between" gap={8}>
                        <Checkbox
                            disabled={added}
                            checked={added || selected.includes(model.name)}
                            onChange={(event) => toggle(model.name, event.target.checked)}
                        >
                            <Flex vertical>
                                <Text style={{overflowWrap: "anywhere"}}>{model.name}</Text>
                                <Text type="secondary" style={{fontSize: 12}}>{capabilityText(model)}</Text>
                            </Flex>
                        </Checkbox>
                        <Tag color={added ? undefined : source.color} style={{marginInlineEnd: 0}}>{added ? "已添加" : source.label}</Tag>
                    </Flex>;
                })}
            </Flex>}
            <Flex justify="flex-end">
                <Button
                    type="primary"
                    disabled={selected.length === 0}
                    onClick={() => onAdd(models.filter((model) => selected.includes(model.name)))}
                >{selected.length > 0 ? `添加 ${selected.length} 个` : "添加"}</Button>
            </Flex>
        </Flex>
    </Card>;
}
