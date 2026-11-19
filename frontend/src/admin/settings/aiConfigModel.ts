import {
    AIModelConfig,
    AIModelQueue,
    AIPlatformConfig,
    AIProviderConfig,
    ModelCallProtocol,
    ModelType,
    ProviderProtocol,
    ReasoningEffort,
} from "../../common/aiConfig";

export type AIView = "overview" | "queues" | "providers";

export interface AIIssue {
    text: string;
    view: AIView;
    id: string;
}

export const MODEL_TYPE_OPTIONS: {value: ModelType, label: string}[] = [
    {value: "text", label: "文本生成"},
    {value: "stt", label: "语音转写"},
    {value: "search", label: "联网搜索"},
];

export const CALL_PROTOCOL_OPTIONS: Record<ModelType, {value: ModelCallProtocol, label: string}[]> = {
    text: [
        {value: "OpenAIText", label: "OpenAI 文字"},
        {value: "DeepSeekText", label: "DeepSeek 文字"},
    ],
    stt: [
        {value: "OpenAISTT", label: "OpenAI STT"},
        {value: "DashScopeQwen3ASR", label: "DashScope 千问3-ASR-Flash"},
        {value: "DashScopeFunASR", label: "DashScope Fun-ASR-Flash"},
        {value: "DashScopeFunASRRealtime", label: "DashScope Fun-ASR 实时（8 kHz）"},
    ],
    search: [
        {value: "DeepSeekSearch", label: "DeepSeek 搜索"},
    ],
};

export const OPENAI_REASONING: ReasoningEffort[] = ["none", "minimal", "low", "medium", "high", "xhigh", "max"];
export const DEEPSEEK_REASONING: ReasoningEffort[] = ["high", "max"];

export const BUSINESS_DEFINITIONS: {scene: string, label: string, type: ModelType}[] = [
    {scene: "rewrite", label: "重写", type: "text"},
    {scene: "summary", label: "新闻汇总", type: "text"},
    {scene: "translate", label: "翻译", type: "text"},
    {scene: "library_review_digest", label: "阅读笔记整理", type: "text"},
    {scene: "keyword_news", label: "日报关键词筛选", type: "text"},
    {scene: "transcribe", label: "语音转写", type: "stt"},
    {scene: "web_search", label: "联网搜索", type: "search"},
];

export function modelTypeLabel(type: ModelType): string {
    return MODEL_TYPE_OPTIONS.find((option) => option.value === type)?.label ?? type;
}

export function callProtocolLabel(protocol: ModelCallProtocol | undefined, type: ModelType): string | undefined {
    return CALL_PROTOCOL_OPTIONS[type].find((option) => option.value === protocol)?.label;
}

export function nextID(prefix: string): string {
    return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

export function modelDisplayName(model: AIModelConfig): string {
    return model.alias?.trim() || model.name;
}

export function findProvider(config: AIPlatformConfig, providerID: string): AIProviderConfig | undefined {
    return config.providers.find((provider) => provider.id === providerID);
}

export function findModel(config: AIPlatformConfig, providerID: string, modelID: string): AIModelConfig | undefined {
    return findProvider(config, providerID)?.models.find((model) => model.id === modelID);
}

export function queueBusinesses(config: AIPlatformConfig, queueID: string) {
    return BUSINESS_DEFINITIONS.filter((definition) => (
        config.businesses.some((binding) => binding.scene === definition.scene && binding.queueID === queueID)
    ));
}

export function queuesUsingModel(config: AIPlatformConfig, providerID: string, modelID: string): AIModelQueue[] {
    return config.queues.filter((queue) => queue.items.some((item) => item.providerID === providerID && item.modelID === modelID));
}

function inheritedCallProtocol(protocol: ProviderProtocol, type: ModelType): ModelCallProtocol | undefined {
    if (protocol === "OpenAI") {
        return type === "text" ? "OpenAIText" : type === "stt" ? "OpenAISTT" : undefined;
    }
    return type === "text" ? "DeepSeekText" : type === "search" ? "DeepSeekSearch" : undefined;
}

export function inheritedCallProtocolLabel(protocol: ProviderProtocol, type: ModelType): string {
    return callProtocolLabel(inheritedCallProtocol(protocol, type), type) ?? "无默认协议";
}

export function resolvedCallProtocol(provider: AIProviderConfig, model: AIModelConfig): ModelCallProtocol | undefined {
    return model.callProtocol || inheritedCallProtocol(provider.protocol, model.type);
}

export function isDeepSeekText(provider: AIProviderConfig, model: AIModelConfig): boolean {
    return resolvedCallProtocol(provider, model) === "DeepSeekText";
}

// DeepSeek 文字模型不支持工具，思考强度只有 high、max
export function fitModelToProtocol(provider: AIProviderConfig, model: AIModelConfig): AIModelConfig {
    if (!isDeepSeekText(provider, model)) {
        return model;
    }
    return {
        ...model,
        reasoning: (model.reasoning ?? []).filter((effort) => DEEPSEEK_REASONING.includes(effort)),
        tools: [],
    };
}

// 修改模型或策略后调用：清掉已经失效的引用，避免到保存时才报错
export function reconcileConfig(config: AIPlatformConfig): AIPlatformConfig {
    const queues = config.queues.map((queue) => ({
        ...queue,
        items: queue.items.flatMap((item) => {
            const provider = findProvider(config, item.providerID);
            const model = findModel(config, item.providerID, item.modelID);
            if (!provider || !model || model.type !== queue.type) {
                return [];
            }
            const deepSeek = isDeepSeekText(provider, model);
            const effortValid = !item.reasoningEffort
                || (model.reasoning ?? []).includes(item.reasoningEffort)
                || (deepSeek && item.reasoningEffort === "none");
            return [{
                ...item,
                reasoningEffort: effortValid ? item.reasoningEffort : (deepSeek ? "none" as const : undefined),
                tools: item.tools?.filter((tool) => (model.tools ?? []).includes(tool)),
            }];
        }),
    }));
    const businesses = config.businesses.map((binding) => {
        const queue = queues.find((candidate) => candidate.id === binding.queueID);
        return queue && queue.type === binding.type ? binding : {...binding, queueID: ""};
    });
    return {...config, queues, businesses};
}

export function collectIssues(config: AIPlatformConfig): AIIssue[] {
    const issues: AIIssue[] = [];
    for (const provider of config.providers) {
        const label = provider.name || "未命名供应商";
        if (provider.protocol === "DeepSeek" && !provider.baseURL.trim()) {
            issues.push({text: `供应商「${label}」要填 Base URL`, view: "providers", id: provider.id});
        }
        if (provider.proxyURL?.trim() && !/^https?:\/\/\S+$/.test(provider.proxyURL.trim())) {
            issues.push({text: `供应商「${label}」的转发地址无效`, view: "providers", id: provider.id});
        }
        const names = new Set<string>();
        for (const model of provider.models) {
            const name = modelDisplayName(model).trim();
            if (!model.name.trim()) {
                issues.push({text: `供应商「${label}」有模型没填上游模型 ID`, view: "providers", id: provider.id});
            } else if (!resolvedCallProtocol(provider, model)) {
                issues.push({text: `模型 ${name} 要选调用协议`, view: "providers", id: provider.id});
            }
            if (name && names.has(name)) {
                issues.push({text: `供应商「${label}」有两个模型都叫 ${name}，改一个别名`, view: "providers", id: provider.id});
            }
            names.add(name);
        }
    }
    for (const queue of config.queues) {
        if (queue.items.length === 0) {
            issues.push({text: `策略「${queue.name || "未命名策略"}」还没有模型`, view: "queues", id: queue.id});
        }
    }
    return issues;
}

export function collectChanges(saved: AIPlatformConfig, current: AIPlatformConfig): string[] {
    const changes: string[] = [];
    const queueName = (config: AIPlatformConfig, id: string) => config.queues.find((queue) => queue.id === id)?.name || "未配置";

    for (const definition of BUSINESS_DEFINITIONS) {
        const before = saved.businesses.find((binding) => binding.scene === definition.scene)?.queueID ?? "";
        const after = current.businesses.find((binding) => binding.scene === definition.scene)?.queueID ?? "";
        if (before !== after) {
            changes.push(`业务「${definition.label}」：${queueName(saved, before)} → ${queueName(current, after)}`);
        }
    }
    for (const queue of current.queues) {
        const before = saved.queues.find((candidate) => candidate.id === queue.id);
        if (!before) {
            changes.push(`新建策略「${queue.name}」`);
        } else if (JSON.stringify(before) !== JSON.stringify(queue)) {
            changes.push(`修改策略「${queue.name}」`);
        }
    }
    for (const queue of saved.queues) {
        if (!current.queues.some((candidate) => candidate.id === queue.id)) {
            changes.push(`删除策略「${queue.name}」`);
        }
    }
    for (const provider of current.providers) {
        const before = saved.providers.find((candidate) => candidate.id === provider.id);
        if (!before) {
            changes.push(`新增供应商「${provider.name}」`);
            continue;
        }
        const {models: modelsAfter, ...connectionAfter} = provider;
        const {models: modelsBefore, ...connectionBefore} = before;
        if (JSON.stringify(connectionBefore) !== JSON.stringify(connectionAfter)) {
            changes.push(`修改供应商「${provider.name}」的连接信息`);
        }
        for (const model of modelsAfter) {
            const modelBefore = modelsBefore.find((candidate) => candidate.id === model.id);
            if (!modelBefore) {
                changes.push(`「${provider.name}」新增模型 ${modelDisplayName(model) || "未命名"}`);
            } else if (JSON.stringify(modelBefore) !== JSON.stringify(model)) {
                changes.push(`「${provider.name}」修改模型 ${modelDisplayName(model)}`);
            }
        }
        for (const model of modelsBefore) {
            if (!modelsAfter.some((candidate) => candidate.id === model.id)) {
                changes.push(`「${provider.name}」删除模型 ${modelDisplayName(model)}`);
            }
        }
    }
    for (const provider of saved.providers) {
        if (!current.providers.some((candidate) => candidate.id === provider.id)) {
            changes.push(`删除供应商「${provider.name}」`);
        }
    }
    return changes;
}

// 测试只带上这条策略用到的模型：其他地方没填完不影响测试
export function buildQueueTestConfig(config: AIPlatformConfig, queue: AIModelQueue, onlyIndex: number | null): {
    config: AIPlatformConfig,
    queue: AIModelQueue,
} {
    const items = onlyIndex === null ? queue.items : [queue.items[onlyIndex]];
    const testQueue = {...queue, items};
    const providers = config.providers
        .filter((provider) => items.some((item) => item.providerID === provider.id))
        .map((provider) => ({
            ...provider,
            models: provider.models.filter((model) => (
                items.some((item) => item.providerID === provider.id && item.modelID === model.id)
            )),
        }));
    return {config: {version: 2, providers, queues: [testQueue], businesses: []}, queue: testQueue};
}

// 删除模型后，这些策略里只剩它的话就会变空
export function queuesEmptiedBy(config: AIPlatformConfig, matches: (providerID: string, modelID: string) => boolean): AIModelQueue[] {
    return config.queues.filter((queue) => (
        queue.items.length > 0 && queue.items.every((item) => matches(item.providerID, item.modelID))
    ));
}
