import {
    Alert,
    Button,
    Card,
    Col,
    Empty,
    Flex,
    Input,
    Modal,
    Popconfirm,
    Row,
    Select,
    Space,
    Spin,
    Table,
    Tabs,
    Tag,
    Typography,
    message,
} from "antd";
import {
    ArrowDownOutlined,
    ArrowUpOutlined,
    DeleteOutlined,
    ExperimentOutlined,
    PlusOutlined,
    SaveOutlined,
} from "@ant-design/icons";
import {ReactNode, useCallback, useEffect, useMemo, useState} from "react";
import {
    AIModelConfig,
    AIModelQueue,
    AIPlatformConfig,
    AIProviderConfig,
    AIQueueTestResult,
    ChatTool,
    ModelCallProtocol,
    ModelType,
    ProviderProtocol,
    ReasoningEffort,
    getAIPlatformConfig,
    saveAIPlatformConfig,
    testAIQueue,
} from "../common/aiConfig";
import {
    BUILTIN_STT_SAMPLE_DATA_URL,
    createBuiltInSTTSampleFile,
} from "../common/aiQueueTestSample";

import "./AISetting.css";

const {Text} = Typography;

const AI_SECTIONS = ["providers", "queues", "scenes"];

const SOURCE_OPTIONS = [
    {value: "OpenAI", label: "OpenAI"},
    {value: "DeepSeek", label: "DeepSeek"},
];

const MODEL_TYPE_OPTIONS = [
    {value: "text", label: "文本生成"},
    {value: "stt", label: "语音转写"},
];

function modelTypeLabel(type: ModelType): string {
    return type === "stt" ? "语音转写" : "文本生成";
}

const MODEL_CALL_PROTOCOL_OPTIONS: Record<ModelType, {value: ModelCallProtocol, label: string}[]> = {
    text: [
        {value: "OpenAIText", label: "OpenAI 文字"},
        {value: "DeepSeekText", label: "DeepSeek 文字"},
    ],
    stt: [
        {value: "OpenAISTT", label: "OpenAI STT"},
        {value: "DashScopeQwen3ASR", label: "DashScope 千问3-ASR-Flash（同步，不支持 filetrans）"},
        {value: "DashScopeFunASR", label: "DashScope Fun-ASR-Flash"},
        {value: "DashScopeFunASRRealtime", label: "DashScope Fun-ASR 实时（8 kHz）"},
    ],
};

const REASONING_OPTIONS = ["none", "minimal", "low", "medium", "high", "xhigh"].map((value) => ({
    value: value as ReasoningEffort,
    label: value,
}));

const DEEPSEEK_REASONING_OPTIONS = ["high", "max"].map((value) => ({
    value: value as ReasoningEffort,
    label: value,
}));

const TOOL_OPTIONS: {value: ChatTool, label: string}[] = [{value: "web_search", label: "Web Search"}];

const BUSINESS_DEFINITIONS: {scene: string, label: string, type: ModelType}[] = [
    {scene: "rewrite", label: "重写", type: "text"},
    {scene: "summary", label: "新闻汇总", type: "text"},
    {scene: "translate", label: "翻译", type: "text"},
    {scene: "library_review_digest", label: "阅读笔记整理", type: "text"},
    {scene: "transcribe", label: "语音转写", type: "stt"},
];

function Field({label, children}: {label: string, children: ReactNode}) {
    return <Flex vertical gap={4} style={{width: "100%"}}>
        <Text type="secondary" style={{fontSize: 12}}>{label}</Text>
        {children}
    </Flex>;
}

// 表格行里的单元格，窄屏时显示自身标签
function Cell({label, children}: {label: string, children: ReactNode}) {
    return <div style={{minWidth: 0}}>
        <span className="ai-cell-label">{label}</span>
        {children}
    </div>;
}

function nextID(prefix: string): string {
    return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

function findModel(value: AIPlatformConfig, providerID: string, modelID: string): AIModelConfig | undefined {
    return value.providers.find((provider) => provider.id === providerID)
        ?.models.find((model) => model.id === modelID);
}

function modelDisplayName(value: AIPlatformConfig, providerID: string, modelID: string): string {
    const provider = value.providers.find((candidate) => candidate.id === providerID);
    const model = provider?.models.find((candidate) => candidate.id === modelID);
    return `${provider?.name || "未知供应商"}/${model?.name || "未知模型"}`;
}

function inheritedCallProtocolLabel(providerProtocol: ProviderProtocol, modelType: ModelType): string {
    if (providerProtocol === "OpenAI") {
        return modelType === "text" ? "OpenAI 文字" : "OpenAI STT";
    }
    if (providerProtocol === "DeepSeek") {
        return modelType === "text" ? "DeepSeek 文字" : "无默认协议，需手动选择";
    }
    return "无默认协议";
}

function resolvedCallProtocol(provider: AIProviderConfig | undefined, model: AIModelConfig | undefined): ModelCallProtocol | undefined {
    if (!provider || !model) return undefined;
    if (model.callProtocol) return model.callProtocol;
    if (provider.protocol === "OpenAI") return model.type === "text" ? "OpenAIText" : "OpenAISTT";
    if (provider.protocol === "DeepSeek" && model.type === "text") return "DeepSeekText";
    return undefined;
}

export interface AISettingExtraTab {
    key: string;
    label: ReactNode;
    children: ReactNode;
}

// extraTabs 和 AI 配置的分区共用同一排吸顶标签栏，保存按钮只作用于 AI 分区
export function AISetting({extraTabs = []}: {extraTabs?: AISettingExtraTab[]}) {
    const [value, setValue] = useState<AIPlatformConfig | null>(null);
    const [savedSnapshot, setSavedSnapshot] = useState("");
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [testQueueIndex, setTestQueueIndex] = useState<number | null>(null);
    const [queueTestInput, setQueueTestInput] = useState("Hello，请用一句中文介绍你能做什么。");
    const [queueTestFile, setQueueTestFile] = useState<File | null>(null);
    const [queueTestAudioURL, setQueueTestAudioURL] = useState("");
    const [queueTestResult, setQueueTestResult] = useState<AIQueueTestResult | null>(null);
    const [queueTesting, setQueueTesting] = useState(false);
    const [section, setSection] = useState<string>("providers");

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const loadedValue = await getAIPlatformConfig();
            setValue(loadedValue);
            setSavedSnapshot(JSON.stringify(loadedValue));
        } catch (error) {
            message.error(error instanceof Error ? error.message : "AI 配置加载失败");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void load();
    }, [load]);

    useEffect(() => {
        if (!queueTestFile) {
            setQueueTestAudioURL("");
            return;
        }
        const url = URL.createObjectURL(queueTestFile);
        setQueueTestAudioURL(url);
        return () => URL.revokeObjectURL(url);
    }, [queueTestFile]);

    const mutate = useCallback((change: (current: AIPlatformConfig) => AIPlatformConfig) => {
        setValue((current) => current ? change(current) : current);
    }, []);

    const dirty = useMemo(
        () => value !== null && JSON.stringify(value) !== savedSnapshot,
        [savedSnapshot, value],
    );

    const isAISection = AI_SECTIONS.includes(section);

    const save = async () => {
        if (!value) {
            return;
        }
        setSaving(true);
        try {
            await saveAIPlatformConfig(value);
            message.success("AI 配置已保存");
            await load();
        } catch (error) {
            message.error(error instanceof Error ? error.message : "AI 配置保存失败");
        } finally {
            setSaving(false);
        }
    };

    const bar = <div className="ai-bar">
        <Tabs
            activeKey={section}
            onChange={setSection}
            items={[
                {key: "providers", label: `供应商与模型${value ? ` · ${value.providers.length}` : ""}`},
                {key: "queues", label: `调用策略${value ? ` · ${value.queues.length}` : ""}`},
                {
                    key: "scenes",
                    label: `业务配置${value ? ` · ${value.businesses.filter((business) => business.queueID).length}/${BUSINESS_DEFINITIONS.length}` : ""}`,
                },
                ...extraTabs.map(({key, label}) => ({key, label})),
            ]}
            tabBarExtraContent={isAISection && value ? <Space size={12}>
                {dirty && <span className="ai-dirty">有未保存的修改</span>}
                <Button
                    type="primary"
                    icon={<SaveOutlined/>}
                    loading={saving}
                    disabled={!dirty}
                    onClick={() => void save()}
                >保存 AI 配置</Button>
            </Space> : null}
        />
    </div>;

    // 额外标签页常驻挂载，切换时不丢失其中未保存的输入
    const extraContent = extraTabs.map((tab) => <div key={tab.key} style={{display: section === tab.key ? undefined : "none"}}>
        {tab.children}
    </div>);

    if (loading || !value) {
        return <div>
            {bar}
            {isAISection && <Flex justify="center" style={{padding: 48}}><Spin/></Flex>}
            {extraContent}
        </div>;
    }

    const updateProvider = (index: number, patch: Partial<AIProviderConfig>) => mutate((current) => ({
        ...current,
        providers: current.providers.map((provider, i) => i === index ? {...provider, ...patch} : provider),
    }));

    const updateModel = (providerIndex: number, modelIndex: number, patch: Partial<AIModelConfig>) => mutate((current) => ({
        ...current,
        providers: current.providers.map((provider, i) => i !== providerIndex ? provider : ({
            ...provider,
            models: provider.models.map((model, j) => j === modelIndex ? {...model, ...patch} : model),
        })),
    }));

    const updateQueue = (queueIndex: number, patch: Partial<AIModelQueue>) => mutate((current) => ({
        ...current,
        queues: current.queues.map((queue, i) => i === queueIndex ? {...queue, ...patch} : queue),
    }));

    const updateQueueItem = (queueIndex: number, itemIndex: number, patch: Partial<AIModelQueue["items"][number]>) => mutate((current) => ({
        ...current,
        queues: current.queues.map((queue, i) => i !== queueIndex ? queue : ({
            ...queue,
            items: queue.items.map((item, j) => j === itemIndex ? {...item, ...patch} : item),
        })),
    }));

    const closeQueueTest = () => {
        setTestQueueIndex(null);
        setQueueTestFile(null);
        setQueueTestResult(null);
    };

    const runQueueTest = async () => {
        if (testQueueIndex === null) {
            return;
        }
        const queue = value.queues[testQueueIndex];
        if (!queue) {
            return;
        }
        setQueueTesting(true);
        setQueueTestResult(null);
        try {
            const file = queue.type === "stt" ? (queueTestFile ?? createBuiltInSTTSampleFile()) : undefined;
            const result = await testAIQueue(value, queue.id, queue.type === "text" ? queueTestInput : undefined, file);
            setQueueTestResult(result);
        } catch (error) {
            message.error(error instanceof Error ? error.message : "Queue 测试失败");
        } finally {
            setQueueTesting(false);
        }
    };

    const activeTestQueue = testQueueIndex === null ? undefined : value.queues[testQueueIndex];

    const providerPanel = <Flex vertical gap={16}>
        {value.providers.length === 0 && <Empty description="还没有供应商"/>}
        {value.providers.map((provider, providerIndex) => <Card
            key={`${provider.id}-${providerIndex}`}
            title={<Input
                variant="borderless"
                placeholder="未命名供应商"
                value={provider.name}
                onChange={(event) => updateProvider(providerIndex, {name: event.target.value})}
                style={{fontSize: 16, fontWeight: 600, paddingInline: 0, maxWidth: 360}}
            />}
            extra={<Popconfirm
                title="删除这个供应商？"
                description="该供应商的模型及策略引用会一并移除。"
                onConfirm={() => mutate((current) => ({
                    ...current,
                    providers: current.providers.filter((_, i) => i !== providerIndex),
                    queues: current.queues.map((queue) => ({
                        ...queue,
                        items: queue.items.filter((item) => item.providerID !== provider.id),
                    })),
                }))}
            >
                <Button danger type="text" icon={<DeleteOutlined/>}/>
            </Popconfirm>}
        >
            <Row gutter={[16, 12]}>
                <Col xs={24} lg={6}><Field label="供应商类型">
                    <Select
                        value={provider.protocol}
                        options={SOURCE_OPTIONS}
                        onChange={(protocol: ProviderProtocol) => updateProvider(providerIndex, {
                            protocol,
                            models: provider.models.map((model) => {
                                const callProtocol = model.callProtocol
                                    || (protocol === "OpenAI"
                                        ? (model.type === "text" ? "OpenAIText" : "OpenAISTT")
                                        : (model.type === "text" ? "DeepSeekText" : undefined));
                                return {
                                    ...model,
                                    reasoning: (model.reasoning ?? []).filter((effort) => (
                                        callProtocol === "DeepSeekText"
                                            ? effort === "high" || effort === "max"
                                            : callProtocol === "OpenAIText" && effort !== "max"
                                    )),
                                    tools: callProtocol === "OpenAIText" ? model.tools : [],
                                };
                            }),
                        })}
                    />
                </Field></Col>
                <Col xs={24} lg={10}><Field label={provider.protocol === "OpenAI"
                    ? "Base URL（OpenAI 官方可留空）"
                    : "Base URL（DeepSeek 必填）"}>
                    <Input value={provider.baseURL} onChange={(event) => updateProvider(providerIndex, {baseURL: event.target.value})}/>
                </Field></Col>
                <Col xs={24} lg={8}><Field label="Token">
                    <Input.Password value={provider.token} onChange={(event) => updateProvider(providerIndex, {token: event.target.value})}/>
                </Field></Col>
            </Row>

            <div className="ai-section-title">
                <span>模型 <Text type="secondary">{provider.models.length}</Text></span>
                <Button size="small" icon={<PlusOutlined/>} onClick={() => updateProvider(providerIndex, {
                    models: [...provider.models, {
                        id: nextID("model"),
                        name: "",
                        type: "text",
                        reasoning: [],
                        tools: [],
                    }],
                })}>添加模型</Button>
            </div>
            {provider.models.length === 0
                ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="没有注册模型"/>
                : <div className="ai-rows ai-models">
                    <div className="ai-row ai-row-head">
                        <span>上游模型 ID</span>
                        <span>类型</span>
                        <span>调用协议</span>
                        <span>可用思考强度</span>
                        <span>可用工具</span>
                        <span/>
                    </div>
                    {provider.models.map((model, modelIndex) => {
                        const callProtocol = resolvedCallProtocol(provider, model);
                        return <div className="ai-row" key={`${model.id}-${modelIndex}`}>
                            <Cell label="上游模型 ID">
                                <Input value={model.name} onChange={(event) => updateModel(providerIndex, modelIndex, {name: event.target.value})}/>
                            </Cell>
                            <Cell label="类型">
                                <Select
                                    style={{width: "100%"}}
                                    value={model.type}
                                    options={MODEL_TYPE_OPTIONS}
                                    onChange={(type: ModelType) => updateModel(providerIndex, modelIndex, {
                                        type,
                                        callProtocol: undefined,
                                        reasoning: type === "text" ? model.reasoning : [],
                                        tools: type === "text" ? model.tools : [],
                                    })}
                                />
                            </Cell>
                            <Cell label="调用协议">
                                <Select
                                    style={{width: "100%"}}
                                    value={model.callProtocol ?? ""}
                                    options={[
                                        {
                                            value: "",
                                            label: `继承（${inheritedCallProtocolLabel(provider.protocol, model.type)}）`,
                                        },
                                        ...MODEL_CALL_PROTOCOL_OPTIONS[model.type],
                                    ]}
                                    onChange={(callProtocol: ModelCallProtocol | "") => {
                                        const nextCallProtocol = callProtocol || undefined;
                                        const nextIsDeepSeek = nextCallProtocol === "DeepSeekText"
                                            || (!nextCallProtocol && provider.protocol === "DeepSeek" && model.type === "text");
                                        updateModel(providerIndex, modelIndex, {
                                            callProtocol: nextCallProtocol,
                                            reasoning: nextIsDeepSeek
                                                ? (model.reasoning ?? []).filter((effort) => effort === "high" || effort === "max")
                                                : (model.reasoning ?? []).filter((effort) => effort !== "max"),
                                            tools: nextIsDeepSeek ? [] : model.tools,
                                        });
                                    }}
                                />
                            </Cell>
                            <Cell label="可用思考强度">
                                {model.type === "text"
                                    ? <Select
                                        style={{width: "100%"}}
                                        mode="multiple"
                                        maxTagCount="responsive"
                                        placeholder="不支持"
                                        value={model.reasoning ?? []}
                                        options={callProtocol === "DeepSeekText"
                                            ? DEEPSEEK_REASONING_OPTIONS
                                            : REASONING_OPTIONS}
                                        onChange={(reasoning: ReasoningEffort[]) => updateModel(providerIndex, modelIndex, {reasoning})}
                                    />
                                    : <span className="ai-na">—</span>}
                            </Cell>
                            <Cell label="可用工具">
                                {model.type === "text" && callProtocol !== "DeepSeekText"
                                    ? <Select
                                        style={{width: "100%"}}
                                        mode="multiple"
                                        maxTagCount="responsive"
                                        placeholder="无"
                                        value={model.tools ?? []}
                                        options={TOOL_OPTIONS}
                                        onChange={(tools: ChatTool[]) => updateModel(providerIndex, modelIndex, {tools})}
                                    />
                                    : <span className="ai-na">—</span>}
                            </Cell>
                            <Button danger type="text" icon={<DeleteOutlined/>} style={{justifySelf: "end"}} onClick={() => mutate((current) => ({
                                ...current,
                                providers: current.providers.map((item, i) => i === providerIndex ? {
                                    ...item,
                                    models: item.models.filter((_, j) => j !== modelIndex),
                                } : item),
                                queues: current.queues.map((item) => ({
                                    ...item,
                                    items: item.items.filter((queueItem) => !(
                                        queueItem.providerID === provider.id && queueItem.modelID === model.id
                                    )),
                                })),
                            }))}/>
                        </div>;
                    })}
                </div>}
        </Card>)}
        <Button block type="dashed" icon={<PlusOutlined/>} onClick={() => mutate((current) => ({
            ...current,
            providers: [...current.providers, {
                id: nextID("provider"),
                name: "新供应商",
                protocol: "OpenAI",
                baseURL: "",
                token: "",
                models: [],
            }],
        }))}>添加供应商</Button>
    </Flex>;

    const queuePanel = <Flex vertical gap={16}>
        {value.queues.length === 0 && <Empty description="还没有调用策略"/>}
        {value.queues.map((queue, queueIndex) => {
            const queueProviderOptions = value.providers
                .filter((provider) => provider.models.some((model) => model.type === queue.type))
                .map((provider) => ({
                    value: provider.id,
                    label: provider.name || "未命名供应商",
                }));
            return <Card
                key={`${queue.id}-${queueIndex}`}
                title={<Flex align="center" gap={8}>
                    <Input
                        variant="borderless"
                        placeholder="未命名策略"
                        value={queue.name}
                        onChange={(event) => updateQueue(queueIndex, {name: event.target.value})}
                        style={{fontSize: 16, fontWeight: 600, paddingInline: 0, maxWidth: 280}}
                    />
                    <Select
                        size="small"
                        variant="filled"
                        value={queue.type}
                        options={MODEL_TYPE_OPTIONS}
                        popupMatchSelectWidth={false}
                        onChange={(type: ModelType) => updateQueue(queueIndex, {type, items: []})}
                    />
                </Flex>}
                extra={<Space>
                    <Button icon={<ExperimentOutlined/>} onClick={() => {
                        setTestQueueIndex(queueIndex);
                        setQueueTestInput("Hello，请用一句中文介绍你能做什么。");
                        setQueueTestFile(null);
                        setQueueTestResult(null);
                    }}>测试</Button>
                    <Popconfirm title="删除这个调用策略？" description="使用该策略的业务配置将清空选择。" onConfirm={() => mutate((current) => ({
                        ...current,
                        queues: current.queues.filter((_, i) => i !== queueIndex),
                        businesses: current.businesses.map((business) => business.queueID === queue.id
                            ? {...business, queueID: ""}
                            : business),
                    }))}><Button danger type="text" icon={<DeleteOutlined/>}/></Popconfirm>
                </Space>}
            >
                {queue.items.length === 0
                    ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="还没有模型，至少添加一个"/>
                    : <div className="ai-rows ai-queue-items">
                        <div className="ai-row ai-row-head">
                            <span>#</span>
                            <span>供应商</span>
                            <span>模型</span>
                            <span>思考强度</span>
                            <span>启用工具</span>
                            <span/>
                        </div>
                        {queue.items.map((item, itemIndex) => {
                            const provider = value.providers.find((candidate) => candidate.id === item.providerID);
                            const model = findModel(value, item.providerID, item.modelID);
                            const isDeepSeek = resolvedCallProtocol(provider, model) === "DeepSeekText";
                            return <div className="ai-row" key={`${item.providerID}-${item.modelID}-${itemIndex}`}>
                                <span className="ai-order">{itemIndex + 1}</span>
                                <Cell label="供应商">
                                    <Select
                                        style={{width: "100%"}}
                                        showSearch
                                        placeholder="选择供应商"
                                        value={item.providerID || undefined}
                                        options={queueProviderOptions}
                                        onChange={(providerID: string) => updateQueueItem(queueIndex, itemIndex, {
                                            providerID,
                                            modelID: "",
                                            reasoningEffort: undefined,
                                            tools: [],
                                        })}
                                    />
                                </Cell>
                                <Cell label="模型">
                                    <Select
                                        style={{width: "100%"}}
                                        showSearch
                                        placeholder="选择模型"
                                        value={item.modelID || undefined}
                                        options={(provider?.models ?? []).filter((candidate) => candidate.type === queue.type).map((candidate) => ({
                                            value: candidate.id,
                                            label: candidate.name,
                                        }))}
                                        onChange={(modelID: string) => {
                                            const selectedModel = provider?.models.find((candidate) => candidate.id === modelID);
                                            updateQueueItem(queueIndex, itemIndex, {
                                                modelID,
                                                reasoningEffort: resolvedCallProtocol(provider, selectedModel) === "DeepSeekText"
                                                    ? "none"
                                                    : undefined,
                                                tools: [],
                                            });
                                        }}
                                    />
                                </Cell>
                                <Cell label="思考强度">
                                    {queue.type === "text"
                                        ? <Select
                                            style={{width: "100%"}}
                                            placeholder="默认"
                                            allowClear={!isDeepSeek}
                                            value={item.reasoningEffort || undefined}
                                            options={(isDeepSeek
                                                ? ["none", ...(model?.reasoning ?? []).filter((effort) => effort === "high" || effort === "max")]
                                                : (model?.reasoning ?? [])
                                            ).map((effort) => ({value: effort, label: effort}))}
                                            disabled={!isDeepSeek && (model?.reasoning?.length ?? 0) === 0}
                                            onChange={(reasoningEffort?: ReasoningEffort) => updateQueueItem(queueIndex, itemIndex, {reasoningEffort})}
                                        />
                                        : <span className="ai-na">—</span>}
                                </Cell>
                                <Cell label="启用工具">
                                    {queue.type === "text"
                                        ? <Select
                                            style={{width: "100%"}}
                                            mode="multiple"
                                            placeholder="无"
                                            value={item.tools ?? []}
                                            options={(model?.tools ?? []).map((tool) => ({value: tool, label: tool}))}
                                            disabled={(model?.tools?.length ?? 0) === 0}
                                            onChange={(tools: ChatTool[]) => updateQueueItem(queueIndex, itemIndex, {tools})}
                                        />
                                        : <span className="ai-na">—</span>}
                                </Cell>
                                <Flex justify="flex-end">
                                    <Space.Compact>
                                        <Button
                                            icon={<ArrowUpOutlined/>}
                                            disabled={itemIndex === 0}
                                            onClick={() => {
                                                const items = [...queue.items];
                                                [items[itemIndex - 1], items[itemIndex]] = [items[itemIndex], items[itemIndex - 1]];
                                                updateQueue(queueIndex, {items});
                                            }}
                                        />
                                        <Button
                                            icon={<ArrowDownOutlined/>}
                                            disabled={itemIndex === queue.items.length - 1}
                                            onClick={() => {
                                                const items = [...queue.items];
                                                [items[itemIndex], items[itemIndex + 1]] = [items[itemIndex + 1], items[itemIndex]];
                                                updateQueue(queueIndex, {items});
                                            }}
                                        />
                                        <Button danger icon={<DeleteOutlined/>} onClick={() => updateQueue(queueIndex, {
                                            items: queue.items.filter((_, i) => i !== itemIndex),
                                        })}/>
                                    </Space.Compact>
                                </Flex>
                            </div>;
                        })}
                    </div>}
                <Button block type="dashed" icon={<PlusOutlined/>} style={{marginTop: 12}} onClick={() => updateQueue(queueIndex, {
                    items: [...queue.items, {providerID: "", modelID: "", tools: []}],
                })}>添加备用模型</Button>
            </Card>;
        })}
        <Button block type="dashed" icon={<PlusOutlined/>} onClick={() => mutate((current) => ({
            ...current,
            queues: [...current.queues, {id: nextID("queue"), name: "新策略", type: "text", items: []}],
        }))}>添加调用策略</Button>
    </Flex>;

    const scenePanel = <Card styles={{body: {padding: 0}}}>
        <Table
            size="middle"
            pagination={false}
            rowKey={(definition) => `${definition.scene}-${definition.type}`}
            dataSource={BUSINESS_DEFINITIONS}
            columns={[
                {
                    title: "业务",
                    render: (_, definition) => <Flex vertical>
                        <Text strong>{definition.label}</Text>
                        <Text type="secondary" style={{fontSize: 12}}>{definition.scene}</Text>
                    </Flex>,
                },
                {
                    title: "类型",
                    width: 140,
                    render: (_, definition) => <Tag bordered={false}>{modelTypeLabel(definition.type)}</Tag>,
                },
                {
                    title: "调用策略",
                    width: 320,
                    render: (_, definition) => {
                        const binding = value.businesses.find((item) => (
                            item.scene === definition.scene && item.type === definition.type
                        )) ?? {...definition, queueID: ""};
                        const queueOptions = value.queues
                            .filter((queue) => queue.type === definition.type)
                            .map((queue) => ({value: queue.id, label: queue.name || "未命名策略"}));
                        return <Select
                            style={{width: "100%"}}
                            showSearch
                            value={binding.queueID || undefined}
                            placeholder="选择调用策略"
                            options={queueOptions}
                            onChange={(queueID: string) => mutate((current) => ({
                                ...current,
                                businesses: BUSINESS_DEFINITIONS.map((item) => {
                                    const currentBinding = current.businesses.find((candidate) => (
                                        candidate.scene === item.scene && candidate.type === item.type
                                    ));
                                    return {
                                        scene: item.scene,
                                        type: item.type,
                                        queueID: item.scene === definition.scene && item.type === definition.type
                                            ? queueID
                                            : (currentBinding?.queueID ?? ""),
                                    };
                                }),
                            }))}
                        />;
                    },
                },
            ]}
        />
    </Card>;

    const panels: Record<string, ReactNode> = {providers: providerPanel, queues: queuePanel, scenes: scenePanel};

    return <div>
        {bar}
        {panels[section]}
        {extraContent}
        <Modal
            open={Boolean(activeTestQueue)}
            title={activeTestQueue ? `测试调用策略：${activeTestQueue.name || "未命名策略"}` : "测试调用策略"}
            onCancel={closeQueueTest}
            width={720}
            footer={<Space>
                <Button onClick={closeQueueTest}>关闭</Button>
                <Button type="primary" loading={queueTesting} onClick={() => void runQueueTest()}>运行测试</Button>
            </Space>}
        >
            {activeTestQueue && <Flex vertical gap={16}>
                <Alert
                    type="info"
                    showIcon
                    message={`使用当前未保存的配置，按${modelTypeLabel(activeTestQueue.type)}模型顺序执行并自动回退。`}
                />
                {activeTestQueue.type === "text" ? <Field label="测试文字">
                    <Input.TextArea
                        rows={5}
                        value={queueTestInput}
                        placeholder="输入要发送给模型的文字"
                        onChange={(event) => setQueueTestInput(event.target.value)}
                    />
                </Field> : <Flex vertical gap={10}>
                    <Field label={queueTestFile ? `已选择：${queueTestFile.name}` : "内置样例：Hi."}>
                        <audio controls src={queueTestAudioURL || BUILTIN_STT_SAMPLE_DATA_URL} style={{width: "100%"}}/>
                    </Field>
                    <Field label="替换为自己的音频（可选）">
                        <Input
                            key={`${testQueueIndex}-${queueTestFile?.name ?? "builtin"}`}
                            type="file"
                            accept="audio/*,.wav,.mp3,.m4a,.ogg,.webm"
                            onChange={(event) => setQueueTestFile(event.target.files?.[0] ?? null)}
                        />
                    </Field>
                    {queueTestFile && <Button onClick={() => setQueueTestFile(null)}>恢复内置样例</Button>}
                </Flex>}

                {queueTestResult && <Flex vertical gap={12}>
                    <Alert
                        type={queueTestResult.error ? "error" : "success"}
                        showIcon
                        message={queueTestResult.error ? "调用策略执行失败" : "调用策略执行成功"}
                        description={queueTestResult.error || (
                            queueTestResult.providerID && queueTestResult.modelID
                                ? `命中 ${modelDisplayName(value, queueTestResult.providerID, queueTestResult.modelID)}`
                                : undefined
                        )}
                    />
                    {queueTestResult.outputText !== undefined && <Field label={activeTestQueue.type === "stt" ? "转写结果" : "模型输出"}>
                        <Input.TextArea rows={5} readOnly value={queueTestResult.outputText}/>
                    </Field>}
                    <Field label="调用尝试">
                        <Flex vertical gap={6}>
                            {queueTestResult.attempts.map((attempt, index) => <Flex key={`${attempt.providerID}-${attempt.modelID}-${index}`} gap={8} align="center" wrap>
                                <Tag color={attempt.success ? "success" : "error"}>{attempt.success ? "成功" : "失败"}</Tag>
                                <Text>{index + 1}. {modelDisplayName(value, attempt.providerID, attempt.modelID)}</Text>
                                <Text type="secondary">{attempt.durationMS} ms</Text>
                                {attempt.error && <Text type="danger">{attempt.error}</Text>}
                            </Flex>)}
                        </Flex>
                    </Field>
                </Flex>}
            </Flex>}
        </Modal>
    </div>;
}
