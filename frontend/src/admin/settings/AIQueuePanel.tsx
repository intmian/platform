import {ReactNode, useEffect, useState} from "react";
import {DndContext, DragEndEvent, KeyboardSensor, PointerSensor, TouchSensor, closestCenter, useSensor, useSensors} from "@dnd-kit/core";
import {SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy} from "@dnd-kit/sortable";
import {CSS} from "@dnd-kit/utilities";
import {
    Alert,
    Button,
    Card,
    Checkbox,
    Empty,
    Flex,
    Input,
    Popconfirm,
    Tooltip,
    Select,
    Tag,
    Typography,
    message,
    theme,
} from "antd";
import {DeleteOutlined, HolderOutlined, PlusOutlined} from "@ant-design/icons";
import {
    AIModelQueue,
    AIModelQueueItem,
    AIPlatformConfig,
    AIQueueTestResult,
    ChatTool,
    ModelType,
    ReasoningEffort,
    testAIQueue,
} from "../../common/aiConfig";
import {BUILTIN_STT_SAMPLE_DATA_URL, createBuiltInSTTSampleFile} from "../../common/aiQueueTestSample";
import {
    MODEL_TYPE_OPTIONS,
    buildQueueTestConfig,
    findModel,
    findProvider,
    isDeepSeekText,
    modelDisplayName,
    modelTypeLabel,
    queueBusinesses,
} from "./aiConfigModel";

const {Text} = Typography;

const DEFAULT_TEST_INPUT: Record<ModelType, string> = {
    text: "用一句话介绍你能做什么。",
    stt: "",
    search: "DeepSeek 最新消息",
};

function QueueTest({value, queue, onlyIndex, onTestAll}: {
    value: AIPlatformConfig;
    queue: AIModelQueue;
    onlyIndex: number | null;
    onTestAll: () => void;
}) {
    const [input, setInput] = useState(DEFAULT_TEST_INPUT[queue.type]);
    const [file, setFile] = useState<File | null>(null);
    const [audioURL, setAudioURL] = useState("");
    const [running, setRunning] = useState(false);
    const [result, setResult] = useState<AIQueueTestResult | null>(null);

    useEffect(() => {
        if (!file) {
            setAudioURL("");
            return;
        }
        const url = URL.createObjectURL(file);
        setAudioURL(url);
        return () => URL.revokeObjectURL(url);
    }, [file]);

    useEffect(() => setResult(null), [onlyIndex]);

    const onlyItem = onlyIndex === null ? undefined : queue.items[onlyIndex];
    const onlyModel = onlyItem && findModel(value, onlyItem.providerID, onlyItem.modelID);

    const run = async () => {
        setRunning(true);
        setResult(null);
        try {
            const test = buildQueueTestConfig(value, queue, onlyIndex);
            const audio = queue.type === "stt" ? (file ?? createBuiltInSTTSampleFile()) : undefined;
            setResult(await testAIQueue(test.config, queue.id, queue.type === "stt" ? undefined : input, audio));
        } catch (error) {
            message.error(error instanceof Error ? error.message : "测试失败");
        } finally {
            setRunning(false);
        }
    };

    const nameOf = (providerID: string, modelID: string) => {
        const model = findModel(value, providerID, modelID);
        return model ? modelDisplayName(model) : modelID;
    };

    return <Card size="small" title="测试" extra={<Text type="secondary">
        {onlyModel ? `只测 ${modelDisplayName(onlyModel)}` : "整条策略"}
    </Text>}>
        <Flex vertical gap={10}>
            {queue.type === "stt"
                ? <Flex vertical gap={8}>
                    <audio controls src={audioURL || BUILTIN_STT_SAMPLE_DATA_URL} style={{width: "100%"}}/>
                    <Input
                        key={file?.name ?? "builtin"}
                        type="file"
                        aria-label="选择测试音频"
                        accept="audio/*,.wav,.mp3,.m4a,.ogg,.webm"
                        onChange={(event) => setFile(event.target.files?.[0] ?? null)}
                    />
                </Flex>
                : <Input.TextArea
                    rows={2}
                    aria-label="测试内容"
                    value={input}
                    onChange={(event) => setInput(event.target.value)}
                />}
            <Flex justify="flex-end" gap={8}>
                {onlyIndex !== null && <Button onClick={onTestAll}>改测整条</Button>}
                <Button
                    type="primary"
                    loading={running}
                    disabled={queue.items.length === 0 || (queue.type !== "stt" && !input.trim())}
                    onClick={() => void run()}
                >运行测试</Button>
            </Flex>
            {result && <Flex vertical gap={8}>
                {result.attempts.map((attempt, index) => <Flex key={index} gap={8} align="center" wrap>
                    <Tag color={attempt.success ? "success" : "error"} style={{marginInlineEnd: 0}}>{attempt.success ? "成功" : "失败"}</Tag>
                    <Text>{nameOf(attempt.providerID, attempt.modelID)}</Text>
                    <Text type="secondary">{attempt.durationMS} ms</Text>
                    {attempt.error && <Text type="danger">{attempt.error}</Text>}
                </Flex>)}
                {result.error && result.attempts.length === 0 && <Alert type="error" showIcon message={result.error}/>}
                {result.outputText !== undefined && <Input.TextArea
                    readOnly
                    aria-label="测试结果"
                    autoSize={{minRows: 2, maxRows: 12}}
                    value={result.outputText}
                />}
            </Flex>}
        </Flex>
    </Card>;
}

function itemKey(item: AIModelQueueItem): string {
    return `${item.providerID}|${item.modelID}`;
}

// 调用顺序里的一步：按住左边的把手拖动排序。
// useSortable 给出拖动时的位移（transform），把手上挂 listeners 才能拖起来。
function SortableStep({id, handle, children}: {
    id: string;
    handle: (props: {listeners: object; attributes: object}) => ReactNode;
    children: ReactNode;
}) {
    const {attributes, listeners, setNodeRef, transform, transition, isDragging} = useSortable({id});
    return <div
        ref={setNodeRef}
        className={`ai-queue-step${isDragging ? " is-dragging" : ""}`}
        style={{transform: CSS.Translate.toString(transform), transition}}
    >
        {handle({listeners: listeners ?? {}, attributes})}
        {children}
    </div>;
}

function QueueEditor({value, queue, onChange, onDelete}: {
    value: AIPlatformConfig;
    queue: AIModelQueue;
    onChange: (patch: Partial<AIModelQueue>) => void;
    onDelete: () => void;
}) {
    const [testIndex, setTestIndex] = useState<number | null>(null);
    const {token} = theme.useToken();
    const businesses = queueBusinesses(value, queue.id);

    const updateItem = (index: number, patch: Partial<AIModelQueueItem>) => onChange({
        items: queue.items.map((item, i) => i === index ? {...item, ...patch} : item),
    });

    const sensors = useSensors(
        useSensor(PointerSensor, {activationConstraint: {distance: 4}}),
        // 手机上长按一下再拖，免得和页面滚动打架
        useSensor(TouchSensor, {activationConstraint: {delay: 200, tolerance: 6}}),
        useSensor(KeyboardSensor, {coordinateGetter: sortableKeyboardCoordinates}),
    );

    const onDragEnd = ({active, over}: DragEndEvent) => {
        if (!over || active.id === over.id) {
            return;
        }
        const from = queue.items.findIndex((item) => itemKey(item) === active.id);
        const to = queue.items.findIndex((item) => itemKey(item) === over.id);
        if (from < 0 || to < 0) {
            return;
        }
        setTestIndex(null);
        onChange({items: arrayMove(queue.items, from, to)});
    };

    const removeItem = (index: number) => {
        setTestIndex(null);
        onChange({items: queue.items.filter((_, i) => i !== index)});
    };

    const addItem = (key: string) => {
        const [providerID, modelID] = key.split("|");
        const provider = findProvider(value, providerID);
        const model = findModel(value, providerID, modelID);
        if (!provider || !model) {
            return;
        }
        onChange({
            items: [...queue.items, {
                providerID,
                modelID,
                reasoningEffort: isDeepSeekText(provider, model) ? "none" : undefined,
                tools: [],
            }],
        });
    };

    const pickerOptions = value.providers
        .map((provider) => ({
            label: provider.name || "未命名供应商",
            options: provider.models
                .filter((model) => model.type === queue.type && model.name.trim())
                .map((model) => ({
                    value: `${provider.id}|${model.id}`,
                    label: modelDisplayName(model),
                    search: `${model.name} ${model.alias ?? ""}`.toLowerCase(),
                    disabled: queue.items.some((item) => item.providerID === provider.id && item.modelID === model.id),
                })),
        }))
        .filter((group) => group.options.length > 0);

    return <Flex vertical gap={16}>
        <Flex justify="space-between" align="flex-start" gap={12} wrap>
            <Flex vertical gap={6} style={{flex: "1 1 240px", minWidth: 0}}>
                <Input
                    variant="borderless"
                    aria-label="策略名称"
                    placeholder="未命名策略"
                    value={queue.name}
                    onChange={(event) => onChange({name: event.target.value})}
                    style={{fontSize: 18, fontWeight: 600, paddingInline: 0, maxWidth: 380}}
                />
                <Flex gap={6} wrap align="center">
                    {queue.items.length === 0
                        ? <Select
                            size="small"
                            aria-label="策略类型"
                            value={queue.type}
                            options={MODEL_TYPE_OPTIONS}
                            popupMatchSelectWidth={false}
                            onChange={(type: ModelType) => onChange({type})}
                        />
                        : <Tag style={{marginInlineEnd: 0}}>{modelTypeLabel(queue.type)}</Tag>}
                    {businesses.length > 0
                        ? businesses.map((business) => <Tag key={business.scene} bordered={false} style={{marginInlineEnd: 0}}>{business.label}</Tag>)
                        : <Text type="secondary" style={{fontSize: 12}}>未使用</Text>}
                </Flex>
            </Flex>
            {businesses.length > 0
                // 正在被业务使用的策略不能删：删了业务就变成未配置，没有意义。要删先在“业务”里换掉。
                ? <Tooltip title={`正在用于${businesses.map((business) => business.label).join("、")}，先在“业务”里换成别的策略才能删除`}>
                    <Button type="text" disabled>删除策略</Button>
                </Tooltip>
                : <Popconfirm
                    title={`删除策略「${queue.name || "未命名策略"}」？`}
                    okText="删除"
                    okButtonProps={{danger: true}}
                    cancelText="取消"
                    onConfirm={onDelete}
                >
                    <Button danger type="text">删除策略</Button>
                </Popconfirm>}
        </Flex>

        <Flex vertical gap={10}>
            <Flex justify="space-between" align="center" gap={12} wrap>
                <Text strong>调用顺序</Text>
                <Select
                    showSearch
                    aria-label="添加模型"
                    style={{width: 260, maxWidth: "100%"}}
                    placeholder={<><PlusOutlined/> 添加模型</>}
                    value={null}
                    options={pickerOptions}
                    notFoundContent={`没有${modelTypeLabel(queue.type)}模型`}
                    filterOption={(input, option) => Boolean((option as {search?: string} | undefined)?.search?.includes(input.trim().toLowerCase()))}
                    onChange={(key: string | null) => key && addItem(key)}
                />
            </Flex>
            {queue.items.length === 0 && <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="还没有模型"/>}
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext items={queue.items.map(itemKey)} strategy={verticalListSortingStrategy}>
            {queue.items.map((item, index) => {
                const provider = findProvider(value, item.providerID);
                const model = findModel(value, item.providerID, item.modelID);
                if (!provider || !model) {
                    return null;
                }
                const deepSeek = isDeepSeekText(provider, model);
                const efforts: ReasoningEffort[] = deepSeek ? ["none", ...(model.reasoning ?? [])] : (model.reasoning ?? []);
                const supportsWeb = queue.type === "text" && (model.tools ?? []).includes("web_search");
                return <SortableStep key={itemKey(item)} id={itemKey(item)} handle={({listeners, attributes}) => <div
                    {...attributes}
                    {...listeners}
                    className="ai-queue-index"
                    aria-label="拖动排序"
                    title="按住拖动排序"
                    style={{
                        background: index === 0 ? token.colorPrimary : token.colorFillSecondary,
                        color: index === 0 ? token.colorTextLightSolid : token.colorTextSecondary,
                    }}
                >
                    <span className="ai-queue-number">{index + 1}</span>
                    <HolderOutlined className="ai-queue-grip"/>
                </div>}>
                    <div className="ai-queue-body" style={{borderColor: token.colorBorderSecondary, borderRadius: token.borderRadius}}>
                        <Flex justify="space-between" align="flex-start" gap={8} wrap>
                            <Flex vertical style={{minWidth: 0}}>
                                <Text strong style={{overflowWrap: "anywhere"}}>{modelDisplayName(model)}</Text>
                                <Text type="secondary" style={{fontSize: 12, overflowWrap: "anywhere"}}>
                                    {provider.name}{model.alias?.trim() ? ` · ${model.name}` : ""}
                                </Text>
                            </Flex>
                            <Flex gap={2}>
                                <Button type="text" size="small" onClick={() => setTestIndex(index)}>单测</Button>
                                <Button type="text" size="small" danger aria-label="移除" icon={<DeleteOutlined/>} onClick={() => removeItem(index)}/>
                            </Flex>
                        </Flex>
                        {queue.type === "text" && <Flex gap={16} align="center" wrap>
                            {efforts.length > 0
                                ? <Flex gap={6} align="center">
                                    <Text type="secondary" style={{fontSize: 13}}>思考强度</Text>
                                    <Select
                                        size="small"
                                        aria-label="思考强度"
                                        style={{width: 104}}
                                        allowClear={!deepSeek}
                                        placeholder="默认"
                                        value={item.reasoningEffort || undefined}
                                        options={efforts.map((effort) => ({value: effort, label: effort}))}
                                        onChange={(reasoningEffort?: ReasoningEffort) => updateItem(index, {reasoningEffort})}
                                    />
                                </Flex>
                                : <Text type="secondary" style={{fontSize: 13}}>不支持思考强度</Text>}
                            {supportsWeb && <Checkbox
                                checked={(item.tools ?? []).includes("web_search")}
                                onChange={(event) => updateItem(index, {tools: event.target.checked ? ["web_search" as ChatTool] : []})}
                            >启用 Web Search</Checkbox>}
                        </Flex>}
                    </div>
                </SortableStep>;
            })}
            </SortableContext>
            </DndContext>
        </Flex>

        <QueueTest value={value} queue={queue} onlyIndex={testIndex} onTestAll={() => setTestIndex(null)}/>
    </Flex>;
}

export function AIQueuePanel({value, selectedID, onSelect, onAdd, onChange, onDelete}: {
    value: AIPlatformConfig;
    selectedID: string | null;
    onSelect: (id: string) => void;
    onAdd: () => void;
    onChange: (id: string, patch: Partial<AIModelQueue>) => void;
    onDelete: (id: string) => void;
}) {
    const {token} = theme.useToken();
    const selected = value.queues.find((queue) => queue.id === selectedID) ?? value.queues[0];

    return <div className="settings-split">
        <Card styles={{body: {padding: 6}}}>
            <Flex vertical gap={2}>
                {value.queues.map((queue) => {
                    const count = queueBusinesses(value, queue.id).length;
                    const active = queue.id === selected?.id;
                    return <button
                        type="button"
                        key={queue.id}
                        className="settings-list-item"
                        style={{background: active ? token.controlItemBgActive : undefined, borderRadius: token.borderRadius}}
                        onClick={() => onSelect(queue.id)}
                    >
                        <Flex justify="space-between" gap={6}>
                            <Text strong style={{overflowWrap: "anywhere"}}>{queue.name || "未命名策略"}</Text>
                            {queue.items.length === 0 && <Tag color="error" style={{marginInlineEnd: 0}}>空</Tag>}
                        </Flex>
                        <Text type="secondary" style={{fontSize: 12}}>
                            {modelTypeLabel(queue.type)} · {queue.items.length} 个模型 · {count > 0 ? `用于 ${count} 个业务` : "未使用"}
                        </Text>
                    </button>;
                })}
                <Button type="dashed" icon={<PlusOutlined/>} onClick={onAdd} style={{marginTop: 4}}>新建策略</Button>
            </Flex>
        </Card>
        <Card>
            {selected
                ? <QueueEditor
                    key={selected.id}
                    value={value}
                    queue={selected}
                    onChange={(patch) => onChange(selected.id, patch)}
                    onDelete={() => onDelete(selected.id)}
                />
                : <Empty description="还没有调用策略"/>}
        </Card>
    </div>;
}
