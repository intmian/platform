import {request} from "./api";
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

export async function sendAiAction<T extends AiAction>(
    action: T,
    payload: AiRequestMap[T],
): Promise<AiResponseMap[T] | null> {
    const ret = await request<AiResponseMap[T]>('/misc/ai/run', {
        action,
        payload,
    });
    return ret.ok && ret.data !== undefined ? ret.data : null;
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

    const ret = await request<AiTranscribeResp>("/misc/ai/transcribe", form);
    if (!ret.ok || !ret.data) {
        console.debug("transcribeAudio failed:", ret.code, ret.msg);
        // 网络或 HTTP 层失败、后端业务失败，提示文字和以前保持一致
        const transportFailed = ret.code < 0 || ret.code >= 400;
        throw new Error(transportFailed ? "语音转写请求失败" : (ret.msg || "语音转写失败"));
    }
    return ret.data;
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
    const ret = await request<Partial<AiTranscribeCapability>>("/misc/ai/transcribe/capability");
    if (!ret.ok || !ret.data) {
        throw new Error("无法读取语音转写模式");
    }
    const capability = ret.data;
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
