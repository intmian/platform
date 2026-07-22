import {useCallback, useEffect, useRef, useState} from "react";
import {trimSilentPcm} from "./audioSilenceTrimmer";

export type AudioRecorderState = "idle" | "recording" | "stopping" | "error";

interface WebAudioRecorder {
    context: AudioContext;
    source: MediaStreamAudioSourceNode;
    processor: ScriptProcessorNode;
    chunks: Float32Array[];
    sampleRate: number;
}

export interface AudioRecordingResult {
    blob: Blob | null;
    hasVoice: boolean;
    originalDurationMs: number;
    outputDurationMs: number;
    trimmingApplied: boolean;
}

const WAVEFORM_BAR_COUNT = 16;
const EMPTY_WAVEFORM = Array.from({length: WAVEFORM_BAR_COUNT}, () => 0);

function sampleWaveform(samples: Float32Array): number[] {
    const bucketSize = Math.max(1, Math.floor(samples.length / WAVEFORM_BAR_COUNT));
    return EMPTY_WAVEFORM.map((_, index) => {
        const start = index * bucketSize;
        const end = index === WAVEFORM_BAR_COUNT - 1
            ? samples.length
            : Math.min(samples.length, start + bucketSize);
        let peak = 0;
        for (let sampleIndex = start; sampleIndex < end; sampleIndex += 1) {
            peak = Math.max(peak, Math.abs(samples[sampleIndex]));
        }
        // Lift normal speech while retaining a zero baseline for actual silence.
        return Math.min(1, Math.sqrt(peak));
    });
}

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
        && (typeof MediaRecorder !== "undefined" || Boolean(getAudioContextCtor()));
}

function getAudioContextCtor(): typeof AudioContext | undefined {
    if (typeof window === "undefined") {
        return undefined;
    }
    const audioWindow = window as Window & {
        webkitAudioContext?: typeof AudioContext;
    };
    return audioWindow.AudioContext || audioWindow.webkitAudioContext;
}

function mergeFloat32Chunks(chunks: Float32Array[]): Float32Array {
    const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const samples = new Float32Array(totalLength);
    let offset = 0;
    chunks.forEach((chunk) => {
        samples.set(chunk, offset);
        offset += chunk.length;
    });
    return samples;
}

function writeAscii(view: DataView, offset: number, value: string) {
    for (let i = 0; i < value.length; i += 1) {
        view.setUint8(offset + i, value.charCodeAt(i));
    }
}

function encodeWav(samples: Float32Array, sampleRate: number): Blob {
    const bytesPerSample = 2;
    const blockAlign = bytesPerSample;
    const buffer = new ArrayBuffer(44 + samples.length * bytesPerSample);
    const view = new DataView(buffer);

    writeAscii(view, 0, "RIFF");
    view.setUint32(4, 36 + samples.length * bytesPerSample, true);
    writeAscii(view, 8, "WAVE");
    writeAscii(view, 12, "fmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * blockAlign, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, 16, true);
    writeAscii(view, 36, "data");
    view.setUint32(40, samples.length * bytesPerSample, true);

    let offset = 44;
    for (let i = 0; i < samples.length; i += 1) {
        const sample = Math.max(-1, Math.min(1, samples[i]));
        view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
        offset += bytesPerSample;
    }

    return new Blob([view], {type: "audio/wav"});
}

export function useAudioRecorder() {
    const [state, setState] = useState<AudioRecorderState>("idle");
    const [durationMs, setDurationMs] = useState(0);
    const [error, setError] = useState<string>("");
    const [waveform, setWaveform] = useState<number[]>(EMPTY_WAVEFORM);
    const recorderRef = useRef<MediaRecorder | null>(null);
    const webAudioRecorderRef = useRef<WebAudioRecorder | null>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const chunksRef = useRef<Blob[]>([]);
    const startedAtRef = useRef(0);
    const timerRef = useRef<number | null>(null);
    const stopResolveRef = useRef<((result: AudioRecordingResult) => void) | null>(null);
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

    const releaseWebAudioRecorder = useCallback(() => {
        const webAudioRecorder = webAudioRecorderRef.current;
        if (!webAudioRecorder) {
            return;
        }
        webAudioRecorder.processor.disconnect();
        webAudioRecorder.source.disconnect();
        void webAudioRecorder.context.close();
        webAudioRecorderRef.current = null;
    }, []);

    const resetRecorder = useCallback(() => {
        clearTimer();
        releaseWebAudioRecorder();
        releaseStream();
        recorderRef.current = null;
        chunksRef.current = [];
        stopResolveRef.current = null;
        stopRejectRef.current = null;
    }, [clearTimer, releaseStream, releaseWebAudioRecorder]);

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
            streamRef.current = stream;

            const AudioContextCtor = getAudioContextCtor();
            if (AudioContextCtor) {
                const context = new AudioContextCtor();
                const source = context.createMediaStreamSource(stream);
                const processor = context.createScriptProcessor(4096, 1, 1);
                const chunks: Float32Array[] = [];
                processor.onaudioprocess = (event) => {
                    const samples = new Float32Array(event.inputBuffer.getChannelData(0));
                    chunks.push(samples);
                    setWaveform(sampleWaveform(samples));
                    event.outputBuffer.getChannelData(0).fill(0);
                };
                source.connect(processor);
                processor.connect(context.destination);
                webAudioRecorderRef.current = {
                    context,
                    source,
                    processor,
                    chunks,
                    sampleRate: context.sampleRate,
                };
            } else {
                const mimeType = getSupportedMimeType();
                const recorder = mimeType ? new MediaRecorder(stream, {mimeType}) : new MediaRecorder(stream);
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
                    const recordedDurationMs = Math.max(0, Date.now() - startedAtRef.current);
                    stopResolveRef.current?.({
                        blob,
                        hasVoice: blob.size > 0,
                        originalDurationMs: recordedDurationMs,
                        outputDurationMs: recordedDurationMs,
                        trimmingApplied: false,
                    });
                    setState("idle");
                    resetRecorder();
                };

                recorder.start();
            }
            startedAtRef.current = Date.now();
            setDurationMs(0);
            setWaveform(EMPTY_WAVEFORM);
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

    const stop = useCallback((): Promise<AudioRecordingResult> => {
        const webAudioRecorder = webAudioRecorderRef.current;
        if (webAudioRecorder) {
            setState("stopping");
            clearTimer();
            setDurationMs(Date.now() - startedAtRef.current);
            const samples = mergeFloat32Chunks(webAudioRecorder.chunks);
            const trimmed = trimSilentPcm(samples, webAudioRecorder.sampleRate);
            const result: AudioRecordingResult = {
                blob: trimmed.hasVoice ? encodeWav(trimmed.samples, webAudioRecorder.sampleRate) : null,
                hasVoice: trimmed.hasVoice,
                originalDurationMs: trimmed.originalDurationMs,
                outputDurationMs: trimmed.outputDurationMs,
                trimmingApplied: true,
            };
            setState("idle");
            resetRecorder();
            return Promise.resolve(result);
        }

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
    }, [clearTimer, resetRecorder]);

    const cancel = useCallback(() => {
        if (webAudioRecorderRef.current) {
            setState("idle");
            resetRecorder();
            return;
        }

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
        waveform,
        error,
        isSupported: canRecordAudio(),
        start,
        stop,
        cancel,
    };
}
