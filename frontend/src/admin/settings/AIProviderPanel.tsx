import {useState} from "react";
import {
    Button,
    Card,
    Checkbox,
    Col,
    Collapse,
    Empty,
    Flex,
    Input,
    Popconfirm,
    Row,
    Select,
    Tag,
    Typography,
    theme,
} from "antd";
import {PlusOutlined} from "@ant-design/icons";
import {
    AIDiscoveredModel,
    AIModelConfig,
    AIPlatformConfig,
    AIProviderConfig,
    ChatTool,
    ModelCallProtocol,
    ModelType,
    ProviderProtocol,
    ReasoningEffort,
    listAIProviderModels,
} from "../../common/aiConfig";
import {AIModelDiscovery} from "./AIModelDiscovery";
import {
    CALL_PROTOCOL_OPTIONS,
    DEEPSEEK_REASONING,
    MODEL_TYPE_OPTIONS,
    OPENAI_REASONING,
    callProtocolLabel,
    fitModelToProtocol,
    inheritedCallProtocolLabel,
    isDeepSeekText,
    modelDisplayName,
    modelTypeLabel,
    nextID,
    queueBusinesses,
    queuesEmptiedBy,
    queuesUsingModel,
} from "./aiConfigModel";

const {Text} = Typography;

function Field({label, children}: {label: string, children: React.ReactNode}) {
    return <Flex vertical gap={4} style={{minWidth: 0}}>
        <Text type="secondary" style={{fontSize: 12}}>{label}</Text>
        {children}
    </Flex>;
}

function modelSummary(model: AIModelConfig): string {
    const protocol = callProtocolLabel(model.callProtocol, model.type);
    return [
        modelTypeLabel(model.type),
        ...(protocol ? [protocol] : []),
        ...(model.type === "text" ? [(model.reasoning?.length ?? 0) > 0 ? `思考 ${model.reasoning?.length} 档` : "无思考档位"] : []),
        ...((model.tools ?? []).includes("web_search") ? ["Web Search"] : []),
    ].join(" · ");
}

// 删除前列出受影响的策略和业务
function deleteImpact(value: AIPlatformConfig, providerID: string, modelID?: string): string | undefined {
    const matches = (itemProvider: string, itemModel: string) => itemProvider === providerID && (modelID === undefined || itemModel === modelID);
    const used = value.queues.filter((queue) => queue.items.some((item) => matches(item.providerID, item.modelID)));
    if (used.length === 0) {
        return undefined;
    }
    const lines = [`会从策略${used.map((queue) => `「${queue.name}」`).join("、")}移除`];
    for (const queue of queuesEmptiedBy(value, matches)) {
        const businesses = queueBusinesses(value, queue.id).map((business) => business.label).join("、");
        lines.push(`策略「${queue.name}」会变空${businesses ? `，影响：${businesses}` : ""}`);
    }
    return lines.join("；");
}

function ModelEditor({value, provider, model, onChange}: {
    value: AIPlatformConfig;
    provider: AIProviderConfig;
    model: AIModelConfig;
    onChange: (next: AIModelConfig) => void;
}) {
    const {token} = theme.useToken();
    const used = queuesUsingModel(value, provider.id, model.id).length > 0;
    const deepSeek = isDeepSeekText(provider, model);
    const efforts = deepSeek ? DEEPSEEK_REASONING : OPENAI_REASONING;
    const copySources = value.providers.flatMap((candidate) => candidate.models
        .filter((item) => item.type === model.type && item.id !== model.id && item.name.trim())
        .map((item) => ({
            value: `${candidate.id}|${item.id}`,
            label: `${candidate.name} / ${modelDisplayName(item)}`,
            source: item,
        })));

    const toggleEffort = (effort: ReasoningEffort, checked: boolean) => onChange({
        ...model,
        reasoning: checked ? [...(model.reasoning ?? []), effort] : (model.reasoning ?? []).filter((item) => item !== effort),
    });

    return <Flex vertical gap={12} className="ai-model-editor" style={{background: token.colorFillQuaternary, borderColor: token.colorBorderSecondary}}>
        <Row gutter={[12, 12]}>
            <Col xs={24} md={12}><Field label="上游模型 ID">
                <Input value={model.name} onChange={(event) => onChange({...model, name: event.target.value})}/>
            </Field></Col>
            <Col xs={24} md={12}><Field label="别名">
                <Input
                    allowClear
                    placeholder={model.name}
                    value={model.alias ?? ""}
                    onChange={(event) => onChange({...model, alias: event.target.value || undefined})}
                />
            </Field></Col>
            <Col xs={24} md={12}><Field label={used ? "类型（使用中不能改）" : "类型"}>
                <Select
                    disabled={used}
                    value={model.type}
                    options={MODEL_TYPE_OPTIONS}
                    onChange={(type: ModelType) => onChange({
                        ...model,
                        type,
                        callProtocol: undefined,
                        reasoning: type === "text" ? model.reasoning : [],
                        tools: type === "text" ? model.tools : [],
                    })}
                />
            </Field></Col>
            <Col xs={24} md={12}><Field label="调用协议">
                <Select
                    value={model.callProtocol ?? ""}
                    options={[
                        {value: "", label: `跟随供应商（${inheritedCallProtocolLabel(provider.protocol, model.type)}）`},
                        ...CALL_PROTOCOL_OPTIONS[model.type],
                    ]}
                    onChange={(callProtocol: ModelCallProtocol | "") => onChange(fitModelToProtocol(provider, {
                        ...model,
                        callProtocol: callProtocol || undefined,
                    }))}
                />
            </Field></Col>
            {model.type === "text" && copySources.length > 0 && <Col xs={24} md={12}><Field label="复制设置">
                <Select
                    showSearch
                    optionFilterProp="label"
                    placeholder="选择模型"
                    value={null}
                    options={copySources.map(({value: optionValue, label}) => ({value: optionValue, label}))}
                    onChange={(key: string | null) => {
                        const source = copySources.find((item) => item.value === key)?.source;
                        if (source) {
                            onChange(fitModelToProtocol(provider, {
                                ...model,
                                callProtocol: source.callProtocol,
                                reasoning: [...(source.reasoning ?? [])],
                                tools: [...(source.tools ?? [])],
                            }));
                        }
                    }}
                />
            </Field></Col>}
        </Row>
        {model.type === "text" && <Field label="可用思考强度">
            <Flex gap={6} wrap>
                {efforts.map((effort) => <Tag.CheckableTag
                    key={effort}
                    checked={(model.reasoning ?? []).includes(effort)}
                    onChange={(checked) => toggleEffort(effort, checked)}
                >{effort}</Tag.CheckableTag>)}
            </Flex>
        </Field>}
        {model.type === "text" && !deepSeek && <Checkbox
            checked={(model.tools ?? []).includes("web_search")}
            onChange={(event) => onChange({...model, tools: event.target.checked ? ["web_search" as ChatTool] : []})}
        >支持 Web Search</Checkbox>}
    </Flex>;
}

function ProviderEditor({value, provider, onChange, onDelete}: {
    value: AIPlatformConfig;
    provider: AIProviderConfig;
    onChange: (next: AIProviderConfig) => void;
    onDelete: () => void;
}) {
    const [openModelID, setOpenModelID] = useState<string | null>(null);
    const [discovering, setDiscovering] = useState(false);
    const [reviewIDs, setReviewIDs] = useState<string[]>([]);
    const [connection, setConnection] = useState<{state: "loading" | "ok" | "error", text: string} | null>(null);
    const {token} = theme.useToken();

    const updateModel = (next: AIModelConfig) => onChange({
        ...provider,
        models: provider.models.map((model) => model.id === next.id ? next : model),
    });

    const openModel = (id: string) => {
        setOpenModelID(openModelID === id ? null : id);
        setReviewIDs((current) => current.filter((item) => item !== id));
    };

    const duplicateModel = (model: AIModelConfig) => {
        const copy = {...model, id: nextID("model"), alias: `${modelDisplayName(model)} 副本`};
        const index = provider.models.findIndex((item) => item.id === model.id);
        onChange({...provider, models: [...provider.models.slice(0, index + 1), copy, ...provider.models.slice(index + 1)]});
        setOpenModelID(copy.id);
    };

    const addManualModel = () => {
        const model: AIModelConfig = {id: nextID("model"), name: "", type: "text", reasoning: [], tools: []};
        onChange({...provider, models: [...provider.models, model]});
        setOpenModelID(model.id);
    };

    const addDiscovered = (models: AIDiscoveredModel[]) => {
        const added = models.map((model) => ({
            source: model.source,
            config: {
                id: nextID("model"),
                name: model.name,
                type: model.type,
                reasoning: model.reasoning,
                tools: model.tools,
            } as AIModelConfig,
        }));
        onChange({...provider, models: [...provider.models, ...added.map((item) => item.config)]});
        setReviewIDs((current) => [...current, ...added.filter((item) => item.source === "unknown").map((item) => item.config.id)]);
        setDiscovering(false);
    };

    const checkConnection = async () => {
        setConnection({state: "loading", text: ""});
        try {
            const models = await listAIProviderModels(provider);
            setConnection({state: "ok", text: `连接正常，上游有 ${models.length} 个模型`});
        } catch (error) {
            setConnection({state: "error", text: error instanceof Error ? error.message : "连接失败"});
        }
    };

    return <Flex vertical gap={16}>
        <Flex justify="space-between" align="center" gap={12} wrap>
            <Input
                variant="borderless"
                aria-label="供应商名称"
                placeholder="未命名供应商"
                value={provider.name}
                onChange={(event) => onChange({...provider, name: event.target.value})}
                style={{fontSize: 18, fontWeight: 600, paddingInline: 0, flex: "1 1 200px", maxWidth: 380}}
            />
            <Flex gap={8} align="center" wrap>
                {connection && connection.state !== "loading" && <Text type={connection.state === "ok" ? "success" : "danger"}>{connection.text}</Text>}
                <Button loading={connection?.state === "loading"} onClick={() => void checkConnection()}>检测连接</Button>
                <Popconfirm
                    title={`删除供应商「${provider.name}」？`}
                    description={deleteImpact(value, provider.id)}
                    okText="删除"
                    okButtonProps={{danger: true}}
                    cancelText="取消"
                    onConfirm={onDelete}
                >
                    <Button danger type="text">删除</Button>
                </Popconfirm>
            </Flex>
        </Flex>

        <Row gutter={[12, 12]}>
            <Col xs={24} md={12}><Field label={provider.protocol === "OpenAI" ? "Base URL（官方接口可留空）" : "Base URL"}>
                <Input value={provider.baseURL} onChange={(event) => onChange({...provider, baseURL: event.target.value})}/>
            </Field></Col>
            <Col xs={24} md={12}><Field label="Token">
                <Input.Password autoComplete="off" value={provider.token} onChange={(event) => onChange({...provider, token: event.target.value})}/>
            </Field></Col>
        </Row>

        <Collapse ghost size="small" items={[{
            key: "advanced",
            label: "高级设置",
            styles: {header: {paddingInline: 0}, body: {paddingInline: 0}},
            children: <Row gutter={[12, 12]}>
                <Col xs={24} md={12}><Field label="供应商类型">
                    <Select
                        value={provider.protocol}
                        options={[{value: "OpenAI", label: "OpenAI"}, {value: "DeepSeek", label: "DeepSeek"}]}
                        onChange={(protocol: ProviderProtocol) => {
                            const next = {...provider, protocol};
                            onChange({...next, models: provider.models.map((model) => fitModelToProtocol(next, model))});
                        }}
                    />
                </Field></Col>
                <Col xs={24} md={12}><Field label="转发地址（留空直连）">
                    <Input
                        allowClear
                        placeholder="https://xxx.workers.dev"
                        value={provider.proxyURL ?? ""}
                        onChange={(event) => onChange({...provider, proxyURL: event.target.value || undefined})}
                    />
                </Field></Col>
            </Row>,
        }]}/>

        <Flex vertical gap={10}>
            <Flex justify="space-between" align="center" gap={8} wrap>
                <Text strong>模型 <Text type="secondary">{provider.models.length}</Text></Text>
                <Flex gap={8}>
                    <Button onClick={() => setDiscovering(true)}>获取模型</Button>
                    <Button onClick={addManualModel}>手动添加</Button>
                </Flex>
            </Flex>
            {discovering && <AIModelDiscovery provider={provider} onAdd={addDiscovered} onClose={() => setDiscovering(false)}/>}
            {provider.models.length === 0
                ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="还没有模型"/>
                : <div className="ai-model-list" style={{borderColor: token.colorBorderSecondary, borderRadius: token.borderRadius}}>
                    {provider.models.map((model) => {
                        const used = queuesUsingModel(value, provider.id, model.id);
                        const open = openModelID === model.id;
                        return <div key={model.id} className="ai-model-item" style={{borderColor: token.colorBorderSecondary}}>
                            <div className="ai-model-row">
                                <Flex vertical style={{minWidth: 0}}>
                                    <Button type="link" className="ai-model-name" style={{color: token.colorText}} onClick={() => openModel(model.id)}>
                                        {modelDisplayName(model) || "未命名模型"}
                                    </Button>
                                    {model.alias?.trim() && <Text type="secondary" style={{fontSize: 12, overflowWrap: "anywhere"}}>{model.name}</Text>}
                                </Flex>
                                <Flex gap={6} wrap align="center" className="ai-model-meta">
                                    <Text type="secondary" style={{fontSize: 12}}>{modelSummary(model)}</Text>
                                    {reviewIDs.includes(model.id) && <Tag color="warning" style={{marginInlineEnd: 0}}>需确认</Tag>}
                                </Flex>
                                <Flex gap={4} wrap align="center" className="ai-model-used">
                                    {used.length > 0
                                        ? used.map((queue) => <Tag key={queue.id} bordered={false} style={{marginInlineEnd: 0}}>{queue.name}</Tag>)
                                        : <Text type="secondary" style={{fontSize: 12}}>未使用</Text>}
                                </Flex>
                                <Flex gap={2} justify="flex-end" className="ai-model-actions">
                                    <Button type="text" size="small" aria-expanded={open} onClick={() => openModel(model.id)}>{open ? "收起" : "编辑"}</Button>
                                    <Button type="text" size="small" onClick={() => duplicateModel(model)}>复制</Button>
                                    <Popconfirm
                                        title={`删除模型 ${modelDisplayName(model) || "未命名模型"}？`}
                                        description={deleteImpact(value, provider.id, model.id)}
                                        okText="删除"
                                        okButtonProps={{danger: true}}
                                        cancelText="取消"
                                        onConfirm={() => onChange({...provider, models: provider.models.filter((item) => item.id !== model.id)})}
                                    >
                                        <Button type="text" size="small" danger>删除</Button>
                                    </Popconfirm>
                                </Flex>
                            </div>
                            {open && <ModelEditor value={value} provider={provider} model={model} onChange={updateModel}/>}
                        </div>;
                    })}
                </div>}
        </Flex>
    </Flex>;
}

export function AIProviderPanel({value, selectedID, onSelect, onAdd, onChange, onDelete}: {
    value: AIPlatformConfig;
    selectedID: string | null;
    onSelect: (id: string) => void;
    onAdd: () => void;
    onChange: (next: AIProviderConfig) => void;
    onDelete: (id: string) => void;
}) {
    const {token} = theme.useToken();
    const selected = value.providers.find((provider) => provider.id === selectedID) ?? value.providers[0];

    return <div className="settings-split">
        <Card styles={{body: {padding: 6}}}>
            <Flex vertical gap={2}>
                {value.providers.map((provider) => <button
                    type="button"
                    key={provider.id}
                    className="settings-list-item"
                    style={{background: provider.id === selected?.id ? token.controlItemBgActive : undefined, borderRadius: token.borderRadius}}
                    onClick={() => onSelect(provider.id)}
                >
                    <Text strong style={{overflowWrap: "anywhere"}}>{provider.name || "未命名供应商"}</Text>
                    <Text type="secondary" style={{fontSize: 12}}>{provider.protocol} · {provider.models.length} 个模型</Text>
                </button>)}
                <Button type="dashed" icon={<PlusOutlined/>} onClick={onAdd} style={{marginTop: 4}}>添加供应商</Button>
            </Flex>
        </Card>
        <Card>
            {selected
                ? <ProviderEditor
                    key={selected.id}
                    value={value}
                    provider={selected}
                    onChange={onChange}
                    onDelete={() => onDelete(selected.id)}
                />
                : <Empty description="还没有供应商"/>}
        </Card>
    </div>;
}
