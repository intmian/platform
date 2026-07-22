import config from "../config.json";

export type ProviderProtocol = "OpenAI";
export type ModelType = "text" | "stt";
export type ModelCallProtocol = "OpenAIText" | "OpenAISTT" | "DashScopeQwen3ASR" | "DashScopeFunASR";
export type ReasoningEffort = "none" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max";
export type ChatTool = "web_search";

export interface AIModelConfig {
    id: string;
    name: string;
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

interface AIConfigEnvelope<T> {
    code: number;
    msg?: string;
    data: T;
}

async function postAIConfig<T>(path: string, body: object): Promise<T> {
    const response = await fetch(config.api_base_url + path, {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify(body),
    });
    if (!response.ok) {
        throw new Error("AI 配置请求失败");
    }
    const result = await response.json() as AIConfigEnvelope<T>;
    if (result.code !== 0) {
        throw new Error(result.msg || "AI 配置请求失败");
    }
    return result.data;
}

export function getAIPlatformConfig(): Promise<AIPlatformConfig> {
    return postAIConfig<AIPlatformConfig>("/misc/ai/config/get", {});
}

export async function saveAIPlatformConfig(value: AIPlatformConfig): Promise<void> {
    await postAIConfig<null>("/misc/ai/config/set", value);
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

    const response = await fetch(config.api_base_url + "/misc/ai/config/queue/test", {
        method: "POST",
        body: form,
    });
    if (!response.ok) {
        throw new Error("Queue 测试请求失败");
    }
    const result = await response.json() as AIConfigEnvelope<AIQueueTestResult>;
    if (result.code !== 0) {
        throw new Error(result.msg || "Queue 测试请求失败");
    }
    return result.data;
}
