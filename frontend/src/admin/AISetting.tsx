import {
    Alert,
    AutoComplete,
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
    ReloadOutlined,
    SaveOutlined,
} from "@ant-design/icons";
import {ReactNode, useCallback, useEffect, useState} from "react";
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

const {Paragraph, Text} = Typography;

const SOURCE_OPTIONS = [
    {value: "OpenAI", label: "OpenAI"},
];

const MODEL_TYPE_OPTIONS = [
    {value: "text", label: "Text（文本生成）"},
    {value: "stt", label: "STT（语音转写）"},
];

const MODEL_CALL_PROTOCOL_OPTIONS: Record<ModelType, {value: ModelCallProtocol, label: string}[]> = {
    text: [
        {value: "OpenAIText", label: "OpenAI 文字"},
    ],
    stt: [
        {value: "OpenAISTT", label: "OpenAI STT"},
        {value: "DashScopeQwen3ASR", label: "DashScope 千问3-ASR"},
        {value: "DashScopeFunASR", label: "DashScope Fun-ASR-Flash"},
    ],
};

const REASONING_OPTIONS = ["none", "minimal", "low", "medium", "high", "xhigh"].map((value) => ({
    value: value as ReasoningEffort,
    label: value,
}));

const TOOL_OPTIONS: {value: ChatTool, label: string}[] = [{value: "web_search", label: "Web Search"}];

const SCENE_SUGGESTIONS = [
    {value: "rewrite", label: "重写 (rewrite)"},
    {value: "summary", label: "新闻汇总 (summary)"},
    {value: "translate", label: "翻译 (translate)"},
    {value: "library_review_digest", label: "阅读笔记整理 (library_review_digest)"},
    {value: "transcribe", label: "语音转写 (transcribe)"},
];

function Field({label, children}: {label: string, children: ReactNode}) {
    return <Flex vertical gap={4} style={{width: "100%"}}>
        <Text type="secondary" style={{fontSize: 12}}>{label}</Text>
        {children}
    </Flex>;
}

function nextID(prefix: string): string {
    return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

function findModel(value: AIPlatformConfig, providerID: string, modelID: string): AIModelConfig | undefined {
    return value.providers.find((provider) => provider.id === providerID)
        ?.models.find((model) => model.id === modelID);
}

function inheritedCallProtocolLabel(providerProtocol: ProviderProtocol, modelType: ModelType): string {
    if (providerProtocol === "OpenAI") {
        return modelType === "text" ? "OpenAI 文字" : "OpenAI STT";
    }
    return providerProtocol;
}

export function AISetting() {
    const [value, setValue] = useState<AIPlatformConfig | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [testQueueIndex, setTestQueueIndex] = useState<number | null>(null);
    const [queueTestInput, setQueueTestInput] = useState("Hello，请用一句中文介绍你能做什么。");
    const [queueTestFile, setQueueTestFile] = useState<File | null>(null);
    const [queueTestAudioURL, setQueueTestAudioURL] = useState("");
    const [queueTestResult, setQueueTestResult] = useState<AIQueueTestResult | null>(null);
    const [queueTesting, setQueueTesting] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            setValue(await getAIPlatformConfig());
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

    if (loading || !value) {
        return <Card title="AI 设置"><Flex justify="center" style={{padding: 48}}><Spin/></Flex></Card>;
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
        <Alert
            type="info"
            showIcon
            message="模型默认按供应商类型和模型类型继承调用协议；STT 模型可显式选择 OpenAI STT、DashScope 千问3-ASR 或 DashScope Fun-ASR-Flash。"
        />
        {value.providers.length === 0 && <Empty description="还没有供应商"/>}
        {value.providers.map((provider, providerIndex) => <Card
            key={`${provider.id}-${providerIndex}`}
            size="small"
            title={provider.name || provider.id || "未命名供应商"}
            extra={<Popconfirm
                title="删除这个供应商？"
                description="该供应商的模型及队列引用会一并移除。"
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
            <Row gutter={[12, 12]}>
                <Col xs={24} md={8}><Field label="供应商 ID">
                    <Input value={provider.id} onChange={(event) => updateProvider(providerIndex, {id: event.target.value})}/>
                </Field></Col>
                <Col xs={24} md={8}><Field label="显示名称">
                    <Input value={provider.name} onChange={(event) => updateProvider(providerIndex, {name: event.target.value})}/>
                </Field></Col>
                <Col xs={24} md={8}><Field label="供应商类型">
                    <Select
                        value={provider.protocol}
                        options={SOURCE_OPTIONS}
                        onChange={(protocol: ProviderProtocol) => updateProvider(providerIndex, {protocol})}
                    />
                </Field></Col>
                <Col xs={24} md={12}><Field label="Base URL（OpenAI 官方可留空）">
                    <Input value={provider.baseURL} onChange={(event) => updateProvider(providerIndex, {baseURL: event.target.value})}/>
                </Field></Col>
                <Col xs={24} md={12}><Field label="Token">
                    <Input.Password value={provider.token} onChange={(event) => updateProvider(providerIndex, {token: event.target.value})}/>
                </Field></Col>
            </Row>

            <Flex justify="space-between" align="center" style={{marginTop: 20, marginBottom: 10}}>
                <Text strong>注册模型</Text>
                <Button size="small" icon={<PlusOutlined/>} onClick={() => updateProvider(providerIndex, {
                    models: [...provider.models, {
                        id: nextID("model"),
                        name: "",
                        type: "text",
                        reasoning: [],
                        tools: [],
                    }],
                })}>添加模型</Button>
            </Flex>
            {provider.models.length === 0 && <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="没有注册模型"/>}
            <Flex vertical gap={10}>
                {provider.models.map((model, modelIndex) => <Card key={`${model.id}-${modelIndex}`} size="small">
                    <Row gutter={[10, 10]} align="bottom">
                        <Col xs={24} md={4}><Field label="模型 ID">
                            <Input value={model.id} onChange={(event) => updateModel(providerIndex, modelIndex, {id: event.target.value})}/>
                        </Field></Col>
                        <Col xs={24} md={5}><Field label="上游模型名称">
                            <Input value={model.name} onChange={(event) => updateModel(providerIndex, modelIndex, {name: event.target.value})}/>
                        </Field></Col>
                        <Col xs={24} md={3}><Field label="类型">
                            <Select
                                value={model.type}
                                options={MODEL_TYPE_OPTIONS}
                                onChange={(type: ModelType) => updateModel(providerIndex, modelIndex, {
                                    type,
                                    callProtocol: undefined,
                                    reasoning: type === "text" ? model.reasoning : [],
                                    tools: type === "text" ? model.tools : [],
                                })}
                            />
                        </Field></Col>
                        <Col xs={24} md={4}><Field label="调用协议">
                            <Select
                                value={model.callProtocol ?? ""}
                                options={[
                                    {
                                        value: "",
                                        label: `继承（${inheritedCallProtocolLabel(provider.protocol, model.type)}）`,
                                    },
                                    ...MODEL_CALL_PROTOCOL_OPTIONS[model.type],
                                ]}
                                onChange={(callProtocol: ModelCallProtocol | "") => updateModel(providerIndex, modelIndex, {
                                    callProtocol: callProtocol || undefined,
                                })}
                            />
                        </Field></Col>
                        <Col xs={24} md={3}><Field label="可用思考强度">
                            <Select
                                mode="multiple"
                                value={model.reasoning ?? []}
                                options={REASONING_OPTIONS}
                                disabled={model.type !== "text"}
                                onChange={(reasoning: ReasoningEffort[]) => updateModel(providerIndex, modelIndex, {reasoning})}
                            />
                        </Field></Col>
                        <Col xs={20} md={4}><Field label="可用工具">
                            <Select
                                mode="multiple"
                                value={model.tools ?? []}
                                options={TOOL_OPTIONS}
                                disabled={model.type !== "text"}
                                onChange={(tools: ChatTool[]) => updateModel(providerIndex, modelIndex, {tools})}
                            />
                        </Field></Col>
                        <Col xs={4} md={1}>
                            <Button danger type="text" icon={<DeleteOutlined/>} onClick={() => mutate((current) => ({
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
                        </Col>
                    </Row>
                </Card>)}
            </Flex>
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
        <Alert type="info" showIcon message="模型队列是有序调用预设：上一项失败后尝试下一项，第一个成功结果立即返回。"/>
        {value.queues.length === 0 && <Empty description="还没有模型队列"/>}
        {value.queues.map((queue, queueIndex) => {
            const queueProviderOptions = value.providers
                .filter((provider) => provider.models.some((model) => model.type === queue.type))
                .map((provider) => ({
                    value: provider.id,
                    label: provider.name ? `${provider.name} (${provider.id})` : provider.id,
                }));
            return <Card
                key={`${queue.id}-${queueIndex}`}
                size="small"
                title={<Space>{queue.name || "未命名队列"}<Tag>{queue.type.toUpperCase()}</Tag></Space>}
                extra={<Space>
                    <Button icon={<ExperimentOutlined/>} onClick={() => {
                        setTestQueueIndex(queueIndex);
                        setQueueTestInput("Hello，请用一句中文介绍你能做什么。");
                        setQueueTestFile(null);
                        setQueueTestResult(null);
                    }}>测试</Button>
                    <Popconfirm title="删除这个模型队列？" description="引用该队列的业务配置也会移除。" onConfirm={() => mutate((current) => ({
                        ...current,
                        queues: current.queues.filter((_, i) => i !== queueIndex),
                        businesses: current.businesses.filter((business) => business.queueID !== queue.id),
                    }))}><Button danger type="text" icon={<DeleteOutlined/>}/></Popconfirm>
                </Space>}
            >
                <Row gutter={[12, 12]}>
                    <Col xs={24} md={8}><Field label="队列 ID（系统生成）">
                        <Text code copyable={{text: queue.id}}>{queue.id}</Text>
                    </Field></Col>
                    <Col xs={24} md={8}><Field label="显示名称">
                        <Input value={queue.name} onChange={(event) => updateQueue(queueIndex, {name: event.target.value})}/>
                    </Field></Col>
                    <Col xs={24} md={8}><Field label="类型">
                        <Select
                            value={queue.type}
                            options={MODEL_TYPE_OPTIONS}
                            onChange={(type: ModelType) => updateQueue(queueIndex, {type, items: []})}
                        />
                    </Field></Col>
                </Row>
                <Flex vertical gap={10} style={{marginTop: 16}}>
                    {queue.items.map((item, itemIndex) => {
                        const provider = value.providers.find((candidate) => candidate.id === item.providerID);
                        const model = findModel(value, item.providerID, item.modelID);
                        return <Card key={`${item.providerID}-${item.modelID}-${itemIndex}`} size="small">
                            <Row gutter={[8, 8]} align="bottom">
                                <Col xs={24} md={5}><Field label={`${itemIndex + 1}. 供应商`}>
                                    <Select
                                        showSearch
                                        value={item.providerID || undefined}
                                        options={queueProviderOptions}
                                        onChange={(providerID: string) => updateQueueItem(queueIndex, itemIndex, {
                                            providerID,
                                            modelID: "",
                                            reasoningEffort: undefined,
                                            tools: [],
                                        })}
                                    />
                                </Field></Col>
                                <Col xs={24} md={6}><Field label="模型">
                                    <Select
                                        showSearch
                                        value={item.modelID || undefined}
                                        options={(provider?.models ?? []).filter((candidate) => candidate.type === queue.type).map((candidate) => ({
                                            value: candidate.id,
                                            label: `${candidate.id} · ${candidate.name}`,
                                        }))}
                                        onChange={(modelID: string) => updateQueueItem(queueIndex, itemIndex, {
                                            modelID,
                                            reasoningEffort: undefined,
                                            tools: [],
                                        })}
                                    />
                                </Field></Col>
                                <Col xs={24} md={5}><Field label="思考强度">
                                    <Select
                                        allowClear
                                        value={item.reasoningEffort || undefined}
                                        options={(model?.reasoning ?? []).map((effort) => ({value: effort, label: effort}))}
                                        disabled={queue.type !== "text" || (model?.reasoning?.length ?? 0) === 0}
                                        onChange={(reasoningEffort?: ReasoningEffort) => updateQueueItem(queueIndex, itemIndex, {reasoningEffort})}
                                    />
                                </Field></Col>
                                <Col xs={20} md={5}><Field label="启用工具">
                                    <Select
                                        mode="multiple"
                                        value={item.tools ?? []}
                                        options={(model?.tools ?? []).map((tool) => ({value: tool, label: tool}))}
                                        disabled={queue.type !== "text" || (model?.tools?.length ?? 0) === 0}
                                        onChange={(tools: ChatTool[]) => updateQueueItem(queueIndex, itemIndex, {tools})}
                                    />
                                </Field></Col>
                                <Col xs={4} md={3}>
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
                                </Col>
                            </Row>
                        </Card>;
                    })}
                    <Button type="dashed" icon={<PlusOutlined/>} onClick={() => updateQueue(queueIndex, {
                        items: [...queue.items, {providerID: "", modelID: "", tools: []}],
                    })}>添加队列项</Button>
                </Flex>
            </Card>;
        })}
        <Button block type="dashed" icon={<PlusOutlined/>} onClick={() => mutate((current) => ({
            ...current,
            queues: [...current.queues, {id: nextID("queue"), name: "新队列", type: "text", items: []}],
        }))}>添加模型队列</Button>
    </Flex>;

    const scenePanel = <Flex vertical gap={16}>
        <Alert type="info" showIcon message="每条业务配置只绑定一个同类型队列；STT 与文本场景使用同一套列表。"/>
        <Card size="small" title="业务配置列表">
            <Flex vertical gap={10}>
                {value.businesses.map((binding, index) => {
                    const queueOptions = value.queues
                        .filter((queue) => queue.type === binding.type)
                        .map((queue) => ({value: queue.id, label: queue.name ? `${queue.name} (${queue.id})` : queue.id}));
                    return <Row key={`${binding.scene}-${binding.type}-${index}`} gutter={[10, 10]} align="bottom">
                    <Col xs={24} md={8}><Field label="场景">
                        <AutoComplete
                            value={binding.scene || undefined}
                            options={SCENE_SUGGESTIONS}
                            placeholder="选择或输入业务场景 ID"
                            onChange={(scene: string) => mutate((current) => ({
                                ...current,
                                businesses: current.businesses.map((item, i) => i === index ? {...item, scene} : item),
                            }))}
                        />
                    </Field></Col>
                    <Col xs={24} md={5}><Field label="类型">
                        <Select
                            value={binding.type}
                            options={MODEL_TYPE_OPTIONS}
                            onChange={(type: ModelType) => mutate((current) => ({
                                ...current,
                                businesses: current.businesses.map((item, i) => i === index ? {...item, type, queueID: ""} : item),
                            }))}
                        />
                    </Field></Col>
                    <Col xs={20} md={9}><Field label="队列预设">
                        <Select
                            showSearch
                            value={binding.queueID || undefined}
                            options={queueOptions}
                            onChange={(queueID: string) => mutate((current) => ({
                                ...current,
                                businesses: current.businesses.map((item, i) => i === index ? {...item, queueID} : item),
                            }))}
                        />
                    </Field></Col>
                    <Col xs={4} md={2}><Button danger type="text" icon={<DeleteOutlined/>} onClick={() => mutate((current) => ({
                        ...current,
                        businesses: current.businesses.filter((_, i) => i !== index),
                    }))}/></Col>
                </Row>})}
                <Button type="dashed" icon={<PlusOutlined/>} onClick={() => mutate((current) => ({
                    ...current,
                    businesses: [...current.businesses, {scene: "", type: "text", queueID: ""}],
                }))}>添加业务配置</Button>
            </Flex>
        </Card>
    </Flex>;

    return <Card
        title="AI 设置"
        style={{marginBottom: 16}}
        extra={<Space>
            <Button icon={<ReloadOutlined/>} onClick={() => void load()} disabled={saving}>重新加载</Button>
            <Button
                type="primary"
                icon={<SaveOutlined/>}
                loading={saving}
                onClick={async () => {
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
                }}
            >保存全部配置</Button>
        </Space>}
    >
        <Paragraph type="secondary">
            供应商注册模型，模型和队列声明类型，业务按场景与类型选择队列预设。
        </Paragraph>
        <Tabs items={[
            {key: "providers", label: `供应商与模型 (${value.providers.length})`, children: providerPanel},
            {key: "queues", label: `模型队列 (${value.queues.length})`, children: queuePanel},
            {key: "scenes", label: `业务配置 (${value.businesses.length})`, children: scenePanel},
        ]}/>
        <Modal
            open={Boolean(activeTestQueue)}
            title={activeTestQueue ? `测试 Queue：${activeTestQueue.name || activeTestQueue.id}` : "测试 Queue"}
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
                    message={`使用当前未保存的配置，按 ${activeTestQueue.type.toUpperCase()} Queue 顺序执行并自动回退。`}
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
                        message={queueTestResult.error ? "Queue 执行失败" : "Queue 执行成功"}
                        description={queueTestResult.error || (
                            queueTestResult.providerID && queueTestResult.modelID
                                ? `命中 ${queueTestResult.providerID}/${queueTestResult.modelID}`
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
                                <Text>{index + 1}. {attempt.providerID}/{attempt.modelID}</Text>
                                <Text type="secondary">{attempt.durationMS} ms</Text>
                                {attempt.error && <Text type="danger">{attempt.error}</Text>}
                            </Flex>)}
                        </Flex>
                    </Field>
                </Flex>}
            </Flex>}
        </Modal>
    </Card>;
}
