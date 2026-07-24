import {useCallback, useEffect, useRef, useState} from "react";
import config from "../config.json";

export type RealtimeTranscriptionStatus =
    | "idle"
    | "connecting"
    | "recording"
    | "finishing"
    | "completed"
    | "error";

interface RealtimeTranscriptionEvent {
    type: "ready" | "partial" | "final" | "completed" | "error";
    text?: string;
    message?: string;
    code?: string;
    sentenceID?: number;
    sampleRate?: number;
    providerID?: string;
    modelID?: string;
    model?: string;
    taskID?: string;
}

export interface RealtimeTranscriptionReady {
    sampleRate: number;
    providerID: string;
    modelID: string;
    model: string;
    taskID: string;
}

function realtimeTranscriptionURL(): string {
    const base = config.api_base_url.replace(/\/$/, "");
    const url = new URL(`${base}/misc/ai/transcribe/realtime`, window.location.href);
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    return url.toString();
}

function aggregateSentences(sentences: Map<number, string>): string {
    return [...sentences.entries()]
        .sort(([left], [right]) => left - right)
        .map(([, text]) => text.trim())
        .filter(Boolean)
        .join("");
}

export function useRealtimeTranscription() {
    const [status, setStatus] = useState<RealtimeTranscriptionStatus>("idle");
    const [partialText, setPartialText] = useState("");
    const [finalText, setFinalText] = useState("");
    const [error, setError] = useState("");
    const [level, setLevel] = useState(0);
    const [durationMs, setDurationMs] = useState(0);
    const [ready, setReady] = useState<RealtimeTranscriptionReady | null>(null);

    const socketRef = useRef<WebSocket | null>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const contextRef = useRef<AudioContext | null>(null);
    const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
    const workletRef = useRef<AudioWorkletNode | null>(null);
    const readyTimeoutRef = useRef<number | null>(null);
    const durationTimerRef = useRef<number | null>(null);
    const recordingStartedAtRef = useRef(0);
    const streamingRef = useRef(false);
    const finishingRef = useRef(false);
    const intentionalCloseRef = useRef(false);
    const finalSentencesRef = useRef(new Map<number, string>());

    const clearReadyTimeout = useCallback(() => {
        if (readyTimeoutRef.current !== null) {
            window.clearTimeout(readyTimeoutRef.current);
            readyTimeoutRef.current = null;
        }
    }, []);

    const stopDurationTimer = useCallback(() => {
        if (durationTimerRef.current !== null) {
            window.clearInterval(durationTimerRef.current);
            durationTimerRef.current = null;
        }
    }, []);

    const startDurationTimer = useCallback(() => {
        stopDurationTimer();
        recordingStartedAtRef.current = Date.now();
        setDurationMs(0);
        durationTimerRef.current = window.setInterval(() => {
            setDurationMs(Date.now() - recordingStartedAtRef.current);
        }, 200);
    }, [stopDurationTimer]);

    const releaseAudio = useCallback(() => {
        streamingRef.current = false;
        streamRef.current?.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        sourceRef.current?.disconnect();
        sourceRef.current = null;
        workletRef.current?.disconnect();
        workletRef.current = null;
        const context = contextRef.current;
        contextRef.current = null;
        if (context) {
            void context.close();
        }
        setLevel(0);
        stopDurationTimer();
    }, [stopDurationTimer]);

    const closeSocket = useCallback(() => {
        intentionalCloseRef.current = true;
        const socket = socketRef.current;
        socketRef.current = null;
        if (socket && socket.readyState < WebSocket.CLOSING) {
            socket.onclose = null;
            socket.onerror = null;
            socket.close(1000, "done");
        }
    }, []);

    const fail = useCallback((message: string) => {
        clearReadyTimeout();
        releaseAudio();
        setError(message);
        setStatus("error");
        closeSocket();
    }, [clearReadyTimeout, closeSocket, releaseAudio]);

    const sendFinish = useCallback(() => {
        if (finishingRef.current) {
            return;
        }
        finishingRef.current = true;
        streamingRef.current = false;
        const socket = socketRef.current;
        if (socket?.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({type: "finish"}));
        } else {
            fail("实时转写连接已断开");
        }
        releaseAudio();
    }, [fail, releaseAudio]);

    const stop = useCallback(() => {
        if (status !== "recording") {
            return;
        }
        setStatus("finishing");
        streamRef.current?.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        const worklet = workletRef.current;
        if (worklet) {
            worklet.port.postMessage({type: "flush"});
        } else {
            sendFinish();
        }
    }, [sendFinish, status]);

    const cancel = useCallback(() => {
        clearReadyTimeout();
        const socket = socketRef.current;
        if (socket?.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({type: "cancel"}));
        }
        releaseAudio();
        closeSocket();
        finishingRef.current = false;
        setPartialText("");
        setStatus("idle");
    }, [clearReadyTimeout, closeSocket, releaseAudio]);

    const start = useCallback(async () => {
        if (status === "connecting" || status === "recording" || status === "finishing") {
            return;
        }
        if (!navigator.mediaDevices?.getUserMedia || typeof AudioWorkletNode === "undefined") {
            fail("当前浏览器不支持实时音频处理");
            return;
        }

        clearReadyTimeout();
        releaseAudio();
        closeSocket();
        intentionalCloseRef.current = false;
        finishingRef.current = false;
        finalSentencesRef.current = new Map();
        setPartialText("");
        setFinalText("");
        setError("");
        setReady(null);
        setDurationMs(0);
        setStatus("connecting");

        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    channelCount: 1,
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true,
                },
            });
            streamRef.current = stream;
            const context = new AudioContext();
            contextRef.current = context;
            await context.audioWorklet.addModule(
                new URL("./realtimePcm8kWorklet.js", import.meta.url),
            );
            const source = context.createMediaStreamSource(stream);
            const worklet = new AudioWorkletNode(context, "platform-realtime-pcm-8k", {
                numberOfInputs: 1,
                numberOfOutputs: 1,
                outputChannelCount: [1],
            });

            sourceRef.current = source;
            workletRef.current = worklet;
            source.connect(worklet);
            worklet.connect(context.destination);

            const socket = new WebSocket(realtimeTranscriptionURL());
            socket.binaryType = "arraybuffer";
            socketRef.current = socket;

            worklet.port.onmessage = (event: MessageEvent) => {
                if (event.data?.type === "audio") {
                    setLevel(Math.min(1, Math.sqrt(Number(event.data.peak) || 0)));
                    if (streamingRef.current && socket.readyState === WebSocket.OPEN) {
                        socket.send(event.data.buffer as ArrayBuffer);
                    }
                    return;
                }
                if (event.data?.type === "flushed") {
                    sendFinish();
                }
            };

            socket.onmessage = (messageEvent) => {
                let event: RealtimeTranscriptionEvent;
                try {
                    event = JSON.parse(String(messageEvent.data)) as RealtimeTranscriptionEvent;
                } catch {
                    return;
                }
                switch (event.type) {
                case "ready":
                    clearReadyTimeout();
                    setReady({
                        sampleRate: event.sampleRate || 8000,
                        providerID: event.providerID || "",
                        modelID: event.modelID || "",
                        model: event.model || "",
                        taskID: event.taskID || "",
                    });
                    streamingRef.current = true;
                    startDurationTimer();
                    setStatus("recording");
                    break;
                case "partial":
                    setPartialText(event.text || "");
                    break;
                case "final": {
                    const sentenceID = event.sentenceID ?? finalSentencesRef.current.size;
                    finalSentencesRef.current.set(sentenceID, event.text || "");
                    setFinalText(aggregateSentences(finalSentencesRef.current));
                    setPartialText("");
                    break;
                }
                case "completed": {
                    const text = event.text?.trim() || aggregateSentences(finalSentencesRef.current);
                    setFinalText(text);
                    setPartialText("");
                    setStatus("completed");
                    clearReadyTimeout();
                    releaseAudio();
                    closeSocket();
                    break;
                }
                case "error":
                    fail(event.message || event.code || "实时转写失败");
                    break;
                }
            };
            socket.onerror = () => {
                if (!intentionalCloseRef.current) {
                    fail("无法连接实时转写服务");
                }
            };
            socket.onclose = () => {
                socketRef.current = null;
                if (!intentionalCloseRef.current && !finishingRef.current) {
                    fail("实时转写连接已关闭");
                }
            };
            readyTimeoutRef.current = window.setTimeout(() => {
                fail("实时转写服务连接超时");
            }, 20000);
        } catch (nextError) {
            fail(nextError instanceof Error ? nextError.message : "无法启动实时录音");
        }
    }, [
        clearReadyTimeout,
        closeSocket,
        fail,
        releaseAudio,
        sendFinish,
        startDurationTimer,
        status,
    ]);

    const reset = useCallback(() => {
        cancel();
        setFinalText("");
        setError("");
        setReady(null);
        setDurationMs(0);
    }, [cancel]);

    useEffect(() => {
        return () => {
            clearReadyTimeout();
            stopDurationTimer();
            releaseAudio();
            closeSocket();
        };
    }, [clearReadyTimeout, closeSocket, releaseAudio, stopDurationTimer]);

    return {
        status,
        partialText,
        finalText,
        error,
        level,
        durationMs,
        ready,
        start,
        stop,
        cancel,
        reset,
    };
}
