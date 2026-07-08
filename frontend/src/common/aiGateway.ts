import config from "../config.json";
import {UniPost, UniResult} from "./newSendHttp";
import {AiAction, AiRequestMap, AiResponseMap, AiTranscribeReq, AiTranscribeResp} from "./aiProtocol";

export type {
    AiRequestMap,
    AiResponseMap,
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
            return null;
        }
        const data = await response.json() as UniEnvelope<AiTranscribeResp>;
        if (data.code !== 0 || !data.data) {
            console.debug("transcribeAudio failed:", data.msg);
            return null;
        }
        return data.data;
    } catch (error) {
        console.debug("transcribeAudio failed:", error);
        return null;
    }
}
