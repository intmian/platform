import config from "../config.json";
import {UniPost, UniResult} from "./newSendHttp";

export enum AiAction {
    LibraryReviewNotesDigest = 'library.reviewNotesDigest',
}

export interface LibraryReviewDigestNote {
    time: string;
    content: string;
}

export interface LibraryReviewNotesDigestReq {
    title: string;
    category?: string;
    author?: string;
    roundName: string;
    notes: LibraryReviewDigestNote[];
}

export interface LibraryReviewDigestPoint {
    point: string;
    evidence?: string;
}

export interface LibraryReviewDigestDraftPhrases {
    main: string[];
    objective?: string[];
    subjective?: string[];
    innovation?: string[];
}

export interface LibraryReviewNotesDigestResp {
    positives: LibraryReviewDigestPoint[];
    negatives: LibraryReviewDigestPoint[];
    records: LibraryReviewDigestPoint[];
    draftPhrases: LibraryReviewDigestDraftPhrases;
}

export interface AiRequestMap {
    [AiAction.LibraryReviewNotesDigest]: LibraryReviewNotesDigestReq;
}

export interface AiResponseMap {
    [AiAction.LibraryReviewNotesDigest]: LibraryReviewNotesDigestResp;
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
