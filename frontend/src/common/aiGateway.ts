import config from "../config.json";
import {UniPost, UniResult} from "./newSendHttp";
import {
    AiAction,
    AiRequestMap,
    AiResponseMap,
    AiTranscribeCapability,
    AiTranscribeReq,
    AiTranscribeResp,
} from "./aiProtocol";

export type {
    AiRequestMap,
    AiResponseMap,
    AiTranscribeCapability,
    AiTranscribeReq,
    AiTranscribeResp,
    LibraryReviewDigestNote,
    LibraryReviewDigestPoint,
    LibraryReviewNotesDigestReq,
    LibraryReviewNotesDigestResp,
} from "./aiProtocol";
export {AiAction} from "./aiProtocol";

interface UniEnvelope<T> {
    code: number;
    msg?: string;
    data?: T;
}

export async function sendAiAction<T extends AiAction>(
    action: T,
    payload: AiRequestMap[T],
): Promise<AiResponseMap[T] | null> {
    const res: UniResult = await UniPost(config.api_base_url + '/misc/ai/run', {
        action,
        payload,
    });
    return res.ok ? (res.data as AiResponseMap[T]) : null;
}

export async function transcribeAudio(req: AiTranscribeReq): Promise<AiTranscribeResp | null> {
    const form = new FormData();
    const fileName = req.fileName || (req.file instanceof File ? req.file.name : "audio.webm");
    form.append("file", req.file, fileName);
    if (req.language?.trim()) {
        form.append("language", req.language.trim());
    }
    if (req.prompt?.trim()) {
        form.append("prompt", req.prompt.trim());
    }

    try {
        const response = await fetch(config.api_base_url + "/misc/ai/transcribe", {
            method: "POST",
            body: form,
        });
        if (!response.ok || (response.status !== undefined && response.status !== 200)) {
            console.debug("transcribeAudio failed:", response);
            throw new Error("语音转写请求失败");
        }
        const data = await response.json() as UniEnvelope<AiTranscribeResp>;
        if (data.code !== 0 || !data.data) {
            console.debug("transcribeAudio failed:", data.msg);
            throw new Error(data.msg || "语音转写失败");
        }
        return data.data;
    } catch (error) {
        console.debug("transcribeAudio failed:", error);
        throw error instanceof Error ? error : new Error("语音转写失败");
    }
}

const CAPABILITY_STORAGE_KEY = "platform.ai.transcribe.capability.v1";
let capabilityMemo: AiTranscribeCapability | null = null;

// Last known mode, so a click can start recording without a round trip.
// Callers should refresh it in the background with getTranscriptionCapability.
export function peekTranscriptionCapability(): AiTranscribeCapability | null {
    if (capabilityMemo) {
        return capabilityMemo;
    }
    try {
        const raw = window.localStorage.getItem(CAPABILITY_STORAGE_KEY);
        const parsed = raw ? JSON.parse(raw) as Partial<AiTranscribeCapability> : null;
        if (parsed && (parsed.mode === "file" || parsed.mode === "realtime")) {
            capabilityMemo = parsed as AiTranscribeCapability;
        }
    } catch {
        // Ignore unreadable cache; the next fetch rewrites it.
    }
    return capabilityMemo;
}

export async function getTranscriptionCapability(): Promise<AiTranscribeCapability> {
    const res: UniResult = await UniPost(
        config.api_base_url + "/misc/ai/transcribe/capability",
        {},
    );
    if (!res.ok) {
        throw new Error("无法读取语音转写模式");
    }
    const capability = res.data as Partial<AiTranscribeCapability>;
    if (capability.mode !== "file" && capability.mode !== "realtime") {
        throw new Error("语音转写模式无效");
    }
    capabilityMemo = capability as AiTranscribeCapability;
    try {
        window.localStorage.setItem(CAPABILITY_STORAGE_KEY, JSON.stringify(capabilityMemo));
    } catch {
        // localStorage can be unavailable in private or restricted browser modes.
    }
    return capabilityMemo;
}
