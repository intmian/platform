import {useCallback, useEffect, useRef, useState} from "react";
import {
    concatPcm,
    PCM_BYTES_PER_MS,
    pcmHasVoice,
    RealtimeTask,
    splitPcmFrames,
} from "./realtimeTask";

// A realtime voice session. The microphone starts right away and audio is kept
// locally; upstream tasks (RealtimeTask) are chained behind it:
// - audio captured before a task is ready is sent once it is;
// - when a task drops, sentences it already finalized are kept, audio after the
//   last finalized sentence is carried into the next task, and reconnects keep
//   going while you speak;
// - if nothing works by the end, the untranscribed tail is handed back as
//   failedAudio so the caller can save it for a later retry.

export type RealtimeTranscriptionStatus =
    | "idle"
    | "starting"
    | "recording"
    | "finishing"
    | "completed"
    | "error";

export interface RealtimeTranscriptionResult {
    id: number;
    text: string;
    durationMs: number;
    failedAudio: Blob | null;
    failedDurationMs: number;
    failedReason: string;
}

export interface RealtimeTranscriptionOptions {
    maxDurationMs: number;
    idleStopMs: number;
}

const WAVEFORM_BAR_COUNT = 16;
const EMPTY_WAVEFORM = Array.from({length: WAVEFORM_BAR_COUNT}, () => 0);
const RECONNECT_DELAYS_MS = [0, 1000, 2000, 4000, 5000];
const STOP_RECONNECT_DELAYS_MS = [300, 1500];
const FINISH_TIMEOUT_MS = 20000;
const IDLE_WARNING_MS = 10000;
const VOICE_PEAK_THRESHOLD = 0.08;

interface Segment {
    chunks: ArrayBuffer[];
    sent: number;
    finals: Map<number, {text: string; endTimeMs: number}>;
    partial: string;
    task: RealtimeTask | null;
    finishSent: boolean;
}

function newSegment(chunks: ArrayBuffer[] = []): Segment {
    return {chunks, sent: 0, finals: new Map(), partial: "", task: null, finishSent: false};
}

function finalsText(segment: Segment): string {
    return Array.from(segment.finals.entries())
        .sort(([left], [right]) => left - right)
        .map(([, sentence]) => sentence.text.trim())
        .filter(Boolean)
        .join("");
}

function normalizeWaveform(value: unknown): number[] {
    if (!Array.isArray(value)) {
        return EMPTY_WAVEFORM;
    }
    return Array.from({length: WAVEFORM_BAR_COUNT}, (_, index) => {
        const level = Number(value[index]) || 0;
        return Math.min(1, Math.sqrt(Math.max(0, level)));
    });
}

function clearTimer(ref: {current: number | null}, interval = false) {
    if (ref.current !== null) {
        if (interval) {
            window.clearInterval(ref.current);
        } else {
            window.clearTimeout(ref.current);
        }
        ref.current = null;
    }
}

export function useRealtimeTranscription(options: RealtimeTranscriptionOptions) {
    const [status, setStatus] = useState<RealtimeTranscriptionStatus>("idle");
    const [previewText, setPreviewText] = useState("");
    const [online, setOnline] = useState(false);
    const [error, setError] = useState("");
    const [waveform, setWaveform] = useState<number[]>(EMPTY_WAVEFORM);
    const [durationMs, setDurationMs] = useState(0);
    const [idleRemainingMs, setIdleRemainingMs] = useState<number | null>(null);
    const [result, setResult] = useState<RealtimeTranscriptionResult | null>(null);

    const optionsRef = useRef(options);
    optionsRef.current = options;
    const statusRef = useRef<RealtimeTranscriptionStatus>("idle");
    const streamRef = useRef<MediaStream | null>(null);
    const contextRef = useRef<AudioContext | null>(null);
    const workletRef = useRef<AudioWorkletNode | null>(null);
    const tickTimerRef = useRef<number | null>(null);
    const reconnectTimerRef = useRef<number | null>(null);
    const finishTimerRef = useRef<number | null>(null);
    const startedAtRef = useRef(0);
    const lastActivityAtRef = useRef(0);
    const confirmedRef = useRef("");
    const segmentRef = useRef<Segment>(newSegment());
    const audioClosedRef = useRef(false);
    const failuresRef = useRef(0);
    const stopFailuresRef = useRef(0);
    const lastFailureRef = useRef("");
    const resultIdRef = useRef(0);
    const sessionRef = useRef(0);

    const updateStatus = useCallback((next: RealtimeTranscriptionStatus) => {
        statusRef.current = next;
        setStatus(next);
    }, []);

    const refreshPreview = useCallback(() => {
        const segment = segmentRef.current;
        setPreviewText(confirmedRef.current + finalsText(segment) + segment.partial.trim());
    }, []);

    const releaseAudio = useCallback(() => {
        streamRef.current?.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        workletRef.current?.disconnect();
        workletRef.current = null;
        const context = contextRef.current;
        contextRef.current = null;
        if (context) {
            void context.close();
        }
        clearTimer(tickTimerRef, true);
        setWaveform(EMPTY_WAVEFORM);
        setIdleRemainingMs(null);
    }, []);

    const teardown = useCallback(() => {
        sessionRef.current++;
        clearTimer(reconnectTimerRef);
        clearTimer(finishTimerRef);
        segmentRef.current.task?.cancel();
        segmentRef.current.task = null;
        releaseAudio();
        setOnline(false);
    }, [releaseAudio]);

    const complete = useCallback((failedPcm: Uint8Array | null) => {
        teardown();
        resultIdRef.current++;
        const failed = failedPcm && failedPcm.byteLength > 0 && pcmHasVoice(failedPcm) ? failedPcm : null;
        setResult({
            id: resultIdRef.current,
            text: confirmedRef.current,
            durationMs: Date.now() - startedAtRef.current,
            failedAudio: failed ? new Blob([failed], {type: "audio/L16;rate=8000"}) : null,
            failedDurationMs: failed ? Math.round(failed.byteLength / PCM_BYTES_PER_MS) : 0,
            failedReason: failed ? lastFailureRef.current : "",
        });
        setPreviewText(confirmedRef.current);
        updateStatus("completed");
    }, [teardown, updateStatus]);

    // Sends whatever the current task has not seen yet, and finishes the task
    // once the microphone is closed and everything has been sent.
    const pump = useCallback(() => {
        const segment = segmentRef.current;
        const task = segment.task;
        if (!task || task.state !== "ready") {
            return;
        }
        while (segment.sent < segment.chunks.length) {
            if (!task.send(segment.chunks[segment.sent])) {
                return;
            }
            segment.sent++;
        }
        if (audioClosedRef.current && !segment.finishSent) {
            segment.finishSent = true;
            task.finish();
            clearTimer(finishTimerRef);
            finishTimerRef.current = window.setTimeout(() => {
                task.cancel();
                handleFailureRef.current(task, "实时转写结束超时");
            }, FINISH_TIMEOUT_MS);
        }
    }, []);

    const connectRef = useRef<() => void>(() => undefined);
    const handleFailureRef = useRef<(task: RealtimeTask, message: string) => void>(() => undefined);

    const connect = useCallback(() => {
        const session = sessionRef.current;
        const segment = segmentRef.current;
        if (audioClosedRef.current && segment.chunks.length === 0) {
            complete(null);
            return;
        }
        if (audioClosedRef.current && !pcmHasVoice(concatPcm(segment.chunks))) {
            complete(null);
            return;
        }
        const task: RealtimeTask = new RealtimeTask({
            onReady: () => {
                if (session !== sessionRef.current || segment.task !== task) return;
                failuresRef.current = 0;
                setOnline(true);
                pump();
            },
            onPartial: (text) => {
                if (session !== sessionRef.current || segment.task !== task) return;
                if (text.trim() !== segment.partial.trim()) {
                    lastActivityAtRef.current = Date.now();
                }
                segment.partial = text;
                refreshPreview();
            },
            onFinal: (sentenceID, text, endTimeMs) => {
                if (session !== sessionRef.current || segment.task !== task) return;
                lastActivityAtRef.current = Date.now();
                segment.finals.set(sentenceID, {text, endTimeMs});
                segment.partial = "";
                refreshPreview();
            },
            onCompleted: (text) => {
                if (session !== sessionRef.current || segment.task !== task) return;
                clearTimer(finishTimerRef);
                confirmedRef.current += text || finalsText(segment);
                segment.finals.clear();
                segment.partial = "";
                complete(null);
            },
            onFailure: (message) => {
                if (session !== sessionRef.current || segment.task !== task) return;
                handleFailureRef.current(task, message);
            },
        });
        segment.task = task;
    }, [complete, pump, refreshPreview]);
    connectRef.current = connect;

    // Keeps finalized sentences, moves the audio after the last of them into a
    // fresh segment and schedules a reconnect.
    const handleFailure = useCallback((task: RealtimeTask, message: string) => {
        const segment = segmentRef.current;
        if (segment.task !== task) {
            return;
        }
        clearTimer(finishTimerRef);
        setOnline(false);
        lastFailureRef.current = message;
        confirmedRef.current += finalsText(segment);
        const confirmedUntilMs = Math.max(0, ...Array.from(segment.finals.values()).map((sentence) => sentence.endTimeMs));
        const cutBytes = Math.floor(confirmedUntilMs * PCM_BYTES_PER_MS / 2) * 2;
        const leftover = concatPcm(segment.chunks).slice(cutBytes);
        segmentRef.current = newSegment(splitPcmFrames(leftover));
        refreshPreview();

        const stopping = audioClosedRef.current || statusRef.current === "finishing";
        let delay: number;
        if (stopping) {
            if (stopFailuresRef.current >= STOP_RECONNECT_DELAYS_MS.length) {
                complete(leftover);
                return;
            }
            delay = STOP_RECONNECT_DELAYS_MS[stopFailuresRef.current++];
        } else {
            delay = RECONNECT_DELAYS_MS[Math.min(failuresRef.current, RECONNECT_DELAYS_MS.length - 1)];
            failuresRef.current++;
        }
        clearTimer(reconnectTimerRef);
        const session = sessionRef.current;
        reconnectTimerRef.current = window.setTimeout(() => {
            reconnectTimerRef.current = null;
            if (session === sessionRef.current) connectRef.current();
        }, delay);
    }, [complete, refreshPreview]);
    handleFailureRef.current = handleFailure;

    const stop = useCallback(() => {
        if (statusRef.current !== "recording") {
            return;
        }
        updateStatus("finishing");
        setIdleRemainingMs(null);
        streamRef.current?.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        clearTimer(tickTimerRef, true);
        const worklet = workletRef.current;
        const closeAudio = () => {
            audioClosedRef.current = true;
            releaseAudio();
            const segment = segmentRef.current;
            if (segment.task) {
                pump();
            } else if (reconnectTimerRef.current !== null) {
                // Waiting to reconnect: do it now instead of after the backoff.
                clearTimer(reconnectTimerRef);
                connectRef.current();
            }
        };
        if (worklet) {
            worklet.port.onmessage = (event: MessageEvent) => {
                if (event.data?.type === "audio") {
                    segmentRef.current.chunks.push(event.data.buffer as ArrayBuffer);
                } else if (event.data?.type === "flushed") {
                    closeAudio();
                }
            };
            worklet.port.postMessage({type: "flush"});
        } else {
            closeAudio();
        }
    }, [pump, releaseAudio, updateStatus]);

    const stopRef = useRef(stop);
    stopRef.current = stop;

    const cancel = useCallback(() => {
        teardown();
        audioClosedRef.current = true;
        segmentRef.current = newSegment();
        setPreviewText("");
        updateStatus("idle");
    }, [teardown, updateStatus]);

    const start = useCallback(async () => {
        if (["starting", "recording", "finishing"].includes(statusRef.current)) {
            return;
        }
        if (!navigator.mediaDevices?.getUserMedia || typeof AudioWorkletNode === "undefined") {
            setError("当前浏览器不支持实时音频处理");
            updateStatus("error");
            return;
        }
        teardown();
        const session = sessionRef.current;
        confirmedRef.current = "";
        segmentRef.current = newSegment();
        audioClosedRef.current = false;
        failuresRef.current = 0;
        stopFailuresRef.current = 0;
        lastFailureRef.current = "";
        setPreviewText("");
        setError("");
        setResult(null);
        setDurationMs(0);
        updateStatus("starting");

        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    channelCount: 1,
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true,
                },
            });
            if (session !== sessionRef.current) {
                stream.getTracks().forEach((track) => track.stop());
                return;
            }
            streamRef.current = stream;
            const context = new AudioContext();
            contextRef.current = context;
            await context.audioWorklet.addModule(new URL("./realtimePcm8kWorklet.js", import.meta.url));
            if (session !== sessionRef.current) {
                return;
            }
            const source = context.createMediaStreamSource(stream);
            const worklet = new AudioWorkletNode(context, "platform-realtime-pcm-8k", {
                numberOfInputs: 1,
                numberOfOutputs: 1,
                outputChannelCount: [1],
            });
            workletRef.current = worklet;
            source.connect(worklet);
            worklet.connect(context.destination);
            worklet.port.onmessage = (event: MessageEvent) => {
                if (event.data?.type !== "audio") {
                    return;
                }
                const segment = segmentRef.current;
                segment.chunks.push(event.data.buffer as ArrayBuffer);
                const peak = Number(event.data.peak) || 0;
                setWaveform(normalizeWaveform(event.data.waveform));
                // Online, "still talking" means new words keep arriving. Offline
                // there are no words, so fall back to the microphone level.
                if (peak > VOICE_PEAK_THRESHOLD && segment.task?.state !== "ready") {
                    lastActivityAtRef.current = Date.now();
                }
                pump();
            };
            stream.getAudioTracks().forEach((track) => {
                track.onended = () => stopRef.current();
            });

            startedAtRef.current = Date.now();
            lastActivityAtRef.current = Date.now();
            updateStatus("recording");
            tickTimerRef.current = window.setInterval(() => {
                const now = Date.now();
                const elapsed = now - startedAtRef.current;
                const idleLeft = optionsRef.current.idleStopMs - (now - lastActivityAtRef.current);
                setDurationMs(elapsed);
                setIdleRemainingMs(idleLeft <= IDLE_WARNING_MS ? Math.max(0, idleLeft) : null);
                if (elapsed >= optionsRef.current.maxDurationMs || idleLeft <= 0) {
                    stopRef.current();
                }
            }, 200);
            connectRef.current();
        } catch (nextError) {
            if (session !== sessionRef.current) {
                return;
            }
            teardown();
            setError(nextError instanceof Error ? nextError.message : "无法启动录音");
            updateStatus("error");
        }
    }, [pump, teardown, updateStatus]);

    const reset = useCallback(() => {
        cancel();
        setError("");
        setResult(null);
        setDurationMs(0);
    }, [cancel]);

    useEffect(() => () => teardown(), [teardown]);

    return {
        status,
        previewText,
        online,
        error,
        waveform,
        durationMs,
        idleRemainingMs,
        result,
        start,
        stop,
        cancel,
        reset,
    };
}
