import config from "../config.json";

// One WebSocket connection to /misc/ai/transcribe/realtime, i.e. one upstream
// DashScope task. A voice session chains several of these when the network or
// the upstream drops; a retry of saved audio replays through one of them.

export const REALTIME_SAMPLE_RATE = 8000;
export const PCM_BYTES_PER_MS = REALTIME_SAMPLE_RATE * 2 / 1000;
const CONNECT_TIMEOUT_MS = 10000;

export type RealtimeTaskState = "connecting" | "ready" | "finishing" | "done" | "failed";

export interface RealtimeTaskReady {
    sampleRate: number;
    providerID: string;
    modelID: string;
    model: string;
    taskID: string;
}

export interface RealtimeTaskHandlers {
    onReady?: (ready: RealtimeTaskReady) => void;
    onPartial?: (text: string) => void;
    onFinal?: (sentenceID: number, text: string, endTimeMs: number) => void;
    onCompleted?: (text: string) => void;
    onFailure?: (message: string, code: string) => void;
}

interface ServerEvent {
    type: "ready" | "partial" | "final" | "completed" | "error";
    text?: string;
    message?: string;
    code?: string;
    sentenceID?: number;
    endTime?: number;
    sampleRate?: number;
    providerID?: string;
    modelID?: string;
    model?: string;
    taskID?: string;
}

function realtimeTranscriptionURL(): string {
    const base = config.api_base_url.replace(/\/$/, "");
    const url = new URL(`${base}/misc/ai/transcribe/realtime`, window.location.href);
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    return url.toString();
}

export class RealtimeTask {
    state: RealtimeTaskState = "connecting";
    private socket: WebSocket | null;
    private connectTimer: number | null;
    private handlers: RealtimeTaskHandlers;

    constructor(handlers: RealtimeTaskHandlers) {
        this.handlers = handlers;
        const socket = new WebSocket(realtimeTranscriptionURL());
        socket.binaryType = "arraybuffer";
        this.socket = socket;
        this.connectTimer = window.setTimeout(() => {
            this.fail("实时转写服务连接超时", "connect_timeout");
        }, CONNECT_TIMEOUT_MS);
        socket.onmessage = (messageEvent) => this.handleMessage(messageEvent);
        socket.onerror = () => this.fail("无法连接实时转写服务", "socket_error");
        socket.onclose = () => {
            if (this.state !== "done") {
                this.fail("实时转写连接已关闭", "socket_closed");
            }
        };
    }

    send(frame: ArrayBuffer): boolean {
        if (this.state !== "ready" || this.socket?.readyState !== WebSocket.OPEN) {
            return false;
        }
        this.socket.send(frame);
        return true;
    }

    finish() {
        if (this.state !== "ready") {
            return;
        }
        this.state = "finishing";
        this.socket?.send(JSON.stringify({type: "finish"}));
    }

    cancel() {
        if (this.state === "done" || this.state === "failed") {
            return;
        }
        this.state = "failed";
        if (this.socket?.readyState === WebSocket.OPEN) {
            this.socket.send(JSON.stringify({type: "cancel"}));
        }
        this.close();
    }

    private handleMessage(messageEvent: MessageEvent) {
        let event: ServerEvent;
        try {
            event = JSON.parse(String(messageEvent.data)) as ServerEvent;
        } catch {
            return;
        }
        if (this.state === "done" || this.state === "failed") {
            return;
        }
        switch (event.type) {
        case "ready":
            this.clearConnectTimer();
            this.state = "ready";
            this.handlers.onReady?.({
                sampleRate: event.sampleRate || REALTIME_SAMPLE_RATE,
                providerID: event.providerID || "",
                modelID: event.modelID || "",
                model: event.model || "",
                taskID: event.taskID || "",
            });
            break;
        case "partial":
            this.handlers.onPartial?.(event.text || "");
            break;
        case "final":
            this.handlers.onFinal?.(event.sentenceID ?? 0, event.text || "", event.endTime || 0);
            break;
        case "completed":
            this.state = "done";
            this.close();
            this.handlers.onCompleted?.(event.text?.trim() || "");
            break;
        case "error":
            this.fail(event.message || event.code || "实时转写失败", event.code || "error");
            break;
        }
    }

    private fail(message: string, code: string) {
        if (this.state === "done" || this.state === "failed") {
            return;
        }
        this.state = "failed";
        this.close();
        this.handlers.onFailure?.(message, code);
    }

    private clearConnectTimer() {
        if (this.connectTimer !== null) {
            window.clearTimeout(this.connectTimer);
            this.connectTimer = null;
        }
    }

    private close() {
        this.clearConnectTimer();
        const socket = this.socket;
        this.socket = null;
        if (!socket) {
            return;
        }
        socket.onmessage = null;
        socket.onerror = null;
        socket.onclose = null;
        if (socket.readyState < WebSocket.CLOSING) {
            socket.close(1000, "done");
        }
    }
}

export function concatPcm(chunks: ArrayBuffer[]): Uint8Array {
    const total = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
    const out = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
        out.set(new Uint8Array(chunk), offset);
        offset += chunk.byteLength;
    }
    return out;
}

// Splits PCM into 100 ms frames so a replay looks like live capture upstream.
export function splitPcmFrames(pcm: Uint8Array, frameBytes = 1600): ArrayBuffer[] {
    const frames: ArrayBuffer[] = [];
    for (let offset = 0; offset < pcm.byteLength; offset += frameBytes) {
        frames.push(pcm.slice(offset, Math.min(pcm.byteLength, offset + frameBytes)).buffer);
    }
    return frames;
}

// Rough "is anyone talking" check for 8 kHz 16-bit PCM: needs at least ~300 ms
// of 20 ms windows whose RMS is above -45 dBFS.
export function pcmHasVoice(pcm: Uint8Array): boolean {
    const samples = new Int16Array(pcm.buffer, pcm.byteOffset, Math.floor(pcm.byteLength / 2));
    const windowSize = REALTIME_SAMPLE_RATE / 50;
    const threshold = 32768 * Math.pow(10, -45 / 20);
    let voicedWindows = 0;
    for (let start = 0; start + windowSize <= samples.length; start += windowSize) {
        let sum = 0;
        for (let index = start; index < start + windowSize; index++) {
            sum += samples[index] * samples[index];
        }
        if (Math.sqrt(sum / windowSize) > threshold) {
            voicedWindows++;
            if (voicedWindows >= 15) {
                return true;
            }
        }
    }
    return false;
}

export function pcmToWav(pcm: Uint8Array, sampleRate = REALTIME_SAMPLE_RATE): Blob {
    const header = new ArrayBuffer(44);
    const view = new DataView(header);
    const writeText = (offset: number, text: string) => {
        for (let index = 0; index < text.length; index++) {
            view.setUint8(offset + index, text.charCodeAt(index));
        }
    };
    writeText(0, "RIFF");
    view.setUint32(4, 36 + pcm.byteLength, true);
    writeText(8, "WAVE");
    writeText(12, "fmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    writeText(36, "data");
    view.setUint32(40, pcm.byteLength, true);
    return new Blob([header, pcm], {type: "audio/wav"});
}

// Replays saved PCM through a single realtime task and resolves with its text.
export function transcribePcmRealtime(pcm: Uint8Array, timeoutMs = 120000): Promise<string> {
    return new Promise((resolve, reject) => {
        const finals = new Map<number, string>();
        let settled = false;
        const timer = window.setTimeout(() => {
            settle(() => reject(new Error("实时转写超时")));
            task.cancel();
        }, timeoutMs);
        const settle = (fn: () => void) => {
            if (settled) return;
            settled = true;
            window.clearTimeout(timer);
            fn();
        };
        const task: RealtimeTask = new RealtimeTask({
            onReady: () => {
                splitPcmFrames(pcm).forEach((frame) => task.send(frame));
                task.finish();
            },
            onFinal: (sentenceID, text) => {
                finals.set(sentenceID, text);
            },
            onCompleted: (text) => {
                const joined = text || Array.from(finals.entries())
                    .sort(([left], [right]) => left - right)
                    .map(([, value]) => value.trim())
                    .join("");
                settle(() => resolve(joined));
            },
            onFailure: (message) => settle(() => reject(new Error(message))),
        });
    });
}
