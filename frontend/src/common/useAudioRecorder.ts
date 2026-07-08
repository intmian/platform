import {useCallback, useEffect, useRef, useState} from "react";

export type AudioRecorderState = "idle" | "recording" | "stopping" | "error";

const AUDIO_MIME_TYPES = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
    "audio/ogg;codecs=opus",
];

function getSupportedMimeType(): string | undefined {
    if (typeof MediaRecorder === "undefined" || typeof MediaRecorder.isTypeSupported !== "function") {
        return undefined;
    }
    return AUDIO_MIME_TYPES.find((type) => MediaRecorder.isTypeSupported(type));
}

function canRecordAudio(): boolean {
    return typeof navigator !== "undefined"
        && Boolean(navigator.mediaDevices?.getUserMedia)
        && typeof MediaRecorder !== "undefined";
}

export function useAudioRecorder() {
    const [state, setState] = useState<AudioRecorderState>("idle");
    const [durationMs, setDurationMs] = useState(0);
    const [error, setError] = useState<string>("");
    const recorderRef = useRef<MediaRecorder | null>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const chunksRef = useRef<Blob[]>([]);
    const startedAtRef = useRef(0);
    const timerRef = useRef<number | null>(null);
    const stopResolveRef = useRef<((blob: Blob) => void) | null>(null);
    const stopRejectRef = useRef<((error: Error) => void) | null>(null);

    const clearTimer = useCallback(() => {
        if (timerRef.current !== null) {
            window.clearInterval(timerRef.current);
            timerRef.current = null;
        }
    }, []);

    const releaseStream = useCallback(() => {
        streamRef.current?.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
    }, []);

    const resetRecorder = useCallback(() => {
        clearTimer();
        releaseStream();
        recorderRef.current = null;
        chunksRef.current = [];
        stopResolveRef.current = null;
        stopRejectRef.current = null;
    }, [clearTimer, releaseStream]);

    const start = useCallback(async () => {
        if (!canRecordAudio()) {
            setState("error");
            setError("当前浏览器不支持录音");
            return false;
        }
        if (recorderRef.current?.state === "recording") {
            return true;
        }

        try {
            setError("");
            const stream = await navigator.mediaDevices.getUserMedia({audio: true});
            const mimeType = getSupportedMimeType();
            const recorder = mimeType ? new MediaRecorder(stream, {mimeType}) : new MediaRecorder(stream);
            streamRef.current = stream;
            recorderRef.current = recorder;
            chunksRef.current = [];

            recorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    chunksRef.current.push(event.data);
                }
            };
            recorder.onerror = () => {
                const nextError = new Error("录音失败");
                setError(nextError.message);
                setState("error");
                stopRejectRef.current?.(nextError);
                resetRecorder();
            };
            recorder.onstop = () => {
                const blob = new Blob(chunksRef.current, {type: recorder.mimeType || "audio/webm"});
                stopResolveRef.current?.(blob);
                setState("idle");
                resetRecorder();
            };

            recorder.start();
            startedAtRef.current = Date.now();
            setDurationMs(0);
            timerRef.current = window.setInterval(() => {
                setDurationMs(Date.now() - startedAtRef.current);
            }, 250);
            setState("recording");
            return true;
        } catch {
            setState("error");
            setError("无法访问麦克风");
            resetRecorder();
            return false;
        }
    }, [resetRecorder]);

    const stop = useCallback((): Promise<Blob> => {
        const recorder = recorderRef.current;
        if (!recorder || recorder.state !== "recording") {
            return Promise.reject(new Error("当前没有正在录音的任务"));
        }

        setState("stopping");
        clearTimer();
        setDurationMs(Date.now() - startedAtRef.current);
        return new Promise((resolve, reject) => {
            stopResolveRef.current = resolve;
            stopRejectRef.current = reject;
            recorder.stop();
        });
    }, [clearTimer]);

    const cancel = useCallback(() => {
        const recorder = recorderRef.current;
        if (recorder && recorder.state !== "inactive") {
            recorder.onstop = () => {
                setState("idle");
                resetRecorder();
            };
            recorder.stop();
            return;
        }
        setState("idle");
        resetRecorder();
    }, [resetRecorder]);

    useEffect(() => {
        return () => {
            resetRecorder();
        };
    }, [resetRecorder]);

    return {
        state,
        recording: state === "recording",
        durationMs,
        error,
        isSupported: canRecordAudio(),
        start,
        stop,
        cancel,
    };
}
