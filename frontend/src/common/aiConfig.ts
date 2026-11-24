import {ApiResult, request} from "./api";

export type ProviderProtocol = "OpenAI" | "DeepSeek";
export type ModelType = "text" | "stt" | "search";
export type ModelCallProtocol = "OpenAIText" | "DeepSeekText" | "OpenAISTT" | "DashScopeQwen3ASR" | "DashScopeFunASR" | "DashScopeFunASRRealtime" | "DeepSeekSearch";
export type ReasoningEffort = "none" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max";
export type ChatTool = "web_search";

export interface AIModelConfig {
    id: string;
    name: string;
    // 只用于展示，区分同一个上游模型的不同配置
    alias?: string;
    type: ModelType;
    callProtocol?: ModelCallProtocol;
    reasoning?: ReasoningEffort[];
    tools?: ChatTool[];
}

export interface AIProviderConfig {
    id: string;
    name: string;
    protocol: ProviderProtocol;
    baseURL: string;
    // ai-proxy Worker 地址；填了以后后端经它转发（见 workers/ai-proxy）
    proxyURL?: string;
    token: string;
    models: AIModelConfig[];
}

export interface AIModelQueueItem {
    providerID: string;
    modelID: string;
    reasoningEffort?: ReasoningEffort;
    tools?: ChatTool[];
}

export interface AIModelQueue {
    id: string;
    name: string;
    type: ModelType;
    items: AIModelQueueItem[];
}

export interface AIBusinessConfig {
    scene: string;
    type: ModelType;
    queueID: string;
}

export interface AIPlatformConfig {
    version: 2;
    providers: AIProviderConfig[];
    queues: AIModelQueue[];
    businesses: AIBusinessConfig[];
}

export type AIModelCapabilitySource = "upstream" | "rule" | "unknown";

export interface AIDiscoveredModel {
    name: string;
    type: ModelType;
    reasoning: ReasoningEffort[];
    tools: ChatTool[];
    source: AIModelCapabilitySource;
}

export interface AIQueueTestAttempt {
    providerID: string;
    modelID: string;
    success: boolean;
    error?: string;
    durationMS: number;
}

export interface AIQueueTestResult {
    type: ModelType;
    outputText?: string;
    language?: string;
    duration?: number;
    providerID?: string;
    modelID?: string;
    attempts: AIQueueTestAttempt[];
    error?: string;
}

// 网络或 HTTP 层失败用固定提示；后端业务失败用后端给的 msg
function apiErrorMessage(ret: ApiResult<unknown>, fallback: string): string {
    if (ret.code < 0 || ret.code >= 400) return fallback;
    return ret.msg || fallback;
}

async function postAIConfig<T>(path: string, body: object): Promise<T> {
    const ret = await request<T>(path, body);
    if (!ret.ok) {
        throw new Error(apiErrorMessage(ret, "AI 配置请求失败"));
    }
    return ret.data;
}

export function getAIPlatformConfig(): Promise<AIPlatformConfig> {
    return postAIConfig<AIPlatformConfig>("/misc/ai/config/get", {});
}

export async function saveAIPlatformConfig(value: AIPlatformConfig): Promise<void> {
    await postAIConfig<null>("/misc/ai/config/set", value);
}

// 列出供应商上游可用的模型和预填能力（传编辑中的配置，不需要先保存）
export function listAIProviderModels(provider: AIProviderConfig): Promise<AIDiscoveredModel[]> {
    return postAIConfig<AIDiscoveredModel[]>("/misc/ai/config/provider/models", {provider});
}

export async function testAIQueue(value: AIPlatformConfig, queueID: string, input?: string, file?: File): Promise<AIQueueTestResult> {
    const form = new FormData();
    form.append("config", JSON.stringify(value));
    form.append("queueID", queueID);
    if (input !== undefined) {
        form.append("input", input);
    }
    if (file) {
        form.append("file", file, file.name);
    }

    const ret = await request<AIQueueTestResult>("/misc/ai/config/queue/test", form);
    if (!ret.ok) {
        throw new Error(apiErrorMessage(ret, "调用策略测试请求失败"));
    }
    return ret.data;
}
