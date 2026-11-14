import {useEffect, useState} from "react";
import {transcribeAudio} from "./aiGateway";
import {pcmToWav, transcribePcmRealtime} from "./realtimeTask";

// Audio that could not be transcribed (network down, upstream failing). Kept in
// IndexedDB so a refresh or closed tab does not lose it; retried by hand later.

export interface PendingVoiceClip {
    id: string;
    createdAt: number;
    durationMs: number;
    // pcm8k: raw 8 kHz 16-bit mono PCM from the realtime path.
    // file: an encoded recording from the file-upload path.
    kind: "pcm8k" | "file";
    data: Blob;
    fileName?: string;
}

const DB_NAME = "platform-voice";
const STORE = "pending";
const memoryFallback = new Map<string, PendingVoiceClip>();
const listeners = new Set<() => void>();
let dbPromise: Promise<IDBDatabase | null> | null = null;

function openDb(): Promise<IDBDatabase | null> {
    if (!dbPromise) {
        dbPromise = new Promise((resolve) => {
            try {
                const request = window.indexedDB.open(DB_NAME, 1);
                request.onupgradeneeded = () => {
                    request.result.createObjectStore(STORE, {keyPath: "id"});
                };
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => resolve(null);
                request.onblocked = () => resolve(null);
            } catch {
                resolve(null);
            }
        });
    }
    return dbPromise;
}

function run<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T | null> {
    return openDb().then((db) => new Promise((resolve) => {
        if (!db) {
            resolve(null);
            return;
        }
        try {
            const request = action(db.transaction(STORE, mode).objectStore(STORE));
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => resolve(null);
        } catch {
            resolve(null);
        }
    }));
}

function notify() {
    listeners.forEach((listener) => listener());
}

export async function listPendingVoiceClips(): Promise<PendingVoiceClip[]> {
    const stored = await run("readonly", (store) => store.getAll() as IDBRequest<PendingVoiceClip[]>);
    const all = [...(stored || []), ...Array.from(memoryFallback.values())];
    return all.sort((left, right) => left.createdAt - right.createdAt);
}

export async function addPendingVoiceClip(clip: Omit<PendingVoiceClip, "id" | "createdAt">): Promise<void> {
    const next: PendingVoiceClip = {
        ...clip,
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        createdAt: Date.now(),
    };
    const saved = await run("readwrite", (store) => store.put(next));
    if (saved === null) {
        memoryFallback.set(next.id, next);
    }
    notify();
}

export async function removePendingVoiceClip(id: string): Promise<void> {
    memoryFallback.delete(id);
    await run("readwrite", (store) => store.delete(id));
    notify();
}

export async function transcribePendingVoiceClip(clip: PendingVoiceClip, prompt: string): Promise<string> {
    if (clip.kind === "file") {
        const response = await transcribeAudio({
            file: clip.data,
            fileName: clip.fileName || "recording.webm",
            prompt,
        });
        return response?.text?.trim() || "";
    }
    const pcm = new Uint8Array(await clip.data.arrayBuffer());
    try {
        return await transcribePcmRealtime(pcm);
    } catch (realtimeError) {
        // The STT queue may also hold file models; try them before giving up.
        try {
            const response = await transcribeAudio({
                file: pcmToWav(pcm),
                fileName: `recording-${clip.createdAt}.wav`,
                prompt,
            });
            if (response?.text?.trim()) {
                return response.text.trim();
            }
        } catch {
            // Report the realtime error; it is the path this clip came from.
        }
        throw realtimeError;
    }
}

export function usePendingVoiceClips(): PendingVoiceClip[] {
    const [clips, setClips] = useState<PendingVoiceClip[]>([]);
    useEffect(() => {
        let alive = true;
        const refresh = () => {
            void listPendingVoiceClips().then((next) => {
                if (alive) setClips(next);
            });
        };
        listeners.add(refresh);
        refresh();
        return () => {
            alive = false;
            listeners.delete(refresh);
        };
    }, []);
    return clips;
}
