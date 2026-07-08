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

export interface LibraryReviewNotesDigestResp {
    positives: LibraryReviewDigestPoint[];
    negatives: LibraryReviewDigestPoint[];
    records: LibraryReviewDigestPoint[];
}

export interface AiRequestMap {
    [AiAction.LibraryReviewNotesDigest]: LibraryReviewNotesDigestReq;
}

export interface AiResponseMap {
    [AiAction.LibraryReviewNotesDigest]: LibraryReviewNotesDigestResp;
}

export interface AiTranscribeReq {
    file: Blob;
    fileName?: string;
    language?: string;
    prompt?: string;
}

export interface AiTranscribeResp {
    text: string;
    language?: string;
    duration?: number;
}
