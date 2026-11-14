import {AudioOutlined, DisconnectOutlined, LoadingOutlined} from "@ant-design/icons";
import {Button, Input, InputNumber, message, Modal, Popconfirm, Popover, Select, Space, theme, Tooltip, Typography} from "antd";
import type {ButtonProps} from "antd";
import {useCallback, useEffect, useMemo, useRef, useState} from "react";
import {getTranscriptionCapability, peekTranscriptionCapability, transcribeAudio} from "./aiGateway";
import type {AiTranscribeCapability, AiTranscribeResp} from "./aiProtocol";
import {useAudioRecorder} from "./useAudioRecorder";
import {useRealtimeTranscription} from "./useRealtimeTranscription";
import {
    addPendingVoiceClip,
    PendingVoiceClip,
    removePendingVoiceClip,
    transcribePendingVoiceClip,
    usePendingVoiceClips,
} from "./voicePending";

const STORAGE_KEY = "platform.ai.transcribe.settings.v1";
const LONG_PRESS_MS = 900;
const LONG_PRESS_PROGRESS_DELAY_MS = 300;
const DEFAULT_LANGUAGE = "zh";
const DEFAULT_MAX_DURATION_SECONDS = 300;
// Stop on its own once no new words (or, offline, no voice) for this long.
const IDLE_STOP_MS = 30000;
const MIN_MAX_DURATION_SECONDS = 10;
const MAX_MAX_DURATION_SECONDS = 600;
const ZH_STYLE_PROMPT = "请使用简体中文写法和中文标点风格。";
const LANGUAGE_OPTIONS = [
    {label: "简体中文", value: "zh"},
    {label: "英文", value: "en"},
    {label: "日语", value: "ja"},
];

interface WhisperSettings {
    language?: string;
    prompt?: string;
    maxDurationSeconds?: number;
}

export interface WhisperButtonProps extends Omit<ButtonProps, "onClick" | "loading" | "onError"> {
    onText: (text: string, response: AiTranscribeResp) => void;
    onError?: (error: string) => void;
    language?: string;
    prompt?: string;
    fileName?: string;
    tooltip?: string;
    showTooltip?: boolean;
    showRealtimePreview?: boolean;
    onRecordingChange?: (recording: boolean) => void;
    onBusyChange?: (busy: boolean) => void;
    onPartialText?: (text: string) => void;
}

function normalizeLanguage(language?: string): string {
    const next = language?.trim() || DEFAULT_LANGUAGE;
    return LANGUAGE_OPTIONS.some((option) => option.value === next) ? next : DEFAULT_LANGUAGE;
}

function normalizeSettings(settings: WhisperSettings): WhisperSettings {
    return {
        language: normalizeLanguage(settings.language),
        prompt: settings.prompt?.trim() || "",
        maxDurationSeconds: normalizeMaxDuration(settings.maxDurationSeconds),
    };
}

function normalizeMaxDuration(value?: number): number {
    if (!Number.isFinite(value)) {
        return DEFAULT_MAX_DURATION_SECONDS;
    }
    return Math.min(
        MAX_MAX_DURATION_SECONDS,
        Math.max(MIN_MAX_DURATION_SECONDS, Math.round(value as number)),
    );
}

function readStoredSettings(): WhisperSettings {
    try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (!raw) {
            return normalizeSettings({});
        }
        const parsed = JSON.parse(raw) as WhisperSettings;
        return normalizeSettings({
            language: typeof parsed.language === "string" ? parsed.language : "",
            prompt: typeof parsed.prompt === "string" ? parsed.prompt : "",
            maxDurationSeconds: typeof parsed.maxDurationSeconds === "number"
                ? parsed.maxDurationSeconds
                : undefined,
        });
    } catch {
        return normalizeSettings({});
    }
}

function writeStoredSettings(settings: WhisperSettings) {
    const next = normalizeSettings(settings);
    try {
        if (
            next.language === DEFAULT_LANGUAGE
            && !next.prompt
            && next.maxDurationSeconds === DEFAULT_MAX_DURATION_SECONDS
        ) {
            window.localStorage.removeItem(STORAGE_KEY);
            return;
        }
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
        // localStorage can be unavailable in private or restricted browser modes.
    }
}

function formatDuration(durationMs: number): string {
    const totalSeconds = Math.max(0, Math.floor(durationMs / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function RecordingWave({waveform}: {waveform: number[]}) {
    return <span
        aria-hidden={true}
        style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 2,
            height: 16,
        }}
    >
        {waveform.map((level, index) => {
            const height = Math.max(2, Math.round(level * 16));
            return <span
                key={index}
                style={{
                    display: "block",
                    width: 1.5,
                    height,
                    borderRadius: 999,
                    background: "currentColor",
                    opacity: level > 0.02 ? 1 : 0.45,
                    transition: "height 80ms linear, opacity 80ms linear",
                }}
            />;
        })}
    </span>;
}

function formatClipTime(timestamp: number): string {
    const date = new Date(timestamp);
    const time = `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
    return date.toDateString() === new Date().toDateString()
        ? time
        : `${date.getMonth() + 1}/${date.getDate()} ${time}`;
}

function audioFileName(blob: Blob): string {
    const type = blob.type.toLowerCase();
    if (type.includes("mp4")) {
        return `recording-${Date.now()}.mp4`;
    }
    if (type.includes("ogg")) {
        return `recording-${Date.now()}.ogg`;
    }
    if (type.includes("wav")) {
        return `recording-${Date.now()}.wav`;
    }
    return `recording-${Date.now()}.webm`;
}

export function WhisperButton({
    onText,
    onError,
    language,
    prompt,
    fileName,
    tooltip = "语音输入",
    showTooltip = true,
    showRealtimePreview = true,
    onRecordingChange,
    onBusyChange,
    onPartialText,
    disabled,
    children,
    icon,
    danger,
    type,
    ...buttonProps
}: WhisperButtonProps) {
    const recorder = useAudioRecorder();
    const [settings, setSettings] = useState<WhisperSettings>(() => readStoredSettings());
    const maxDurationSeconds = normalizeMaxDuration(settings.maxDurationSeconds);
    const realtime = useRealtimeTranscription({
        maxDurationMs: maxDurationSeconds * 1000,
        idleStopMs: IDLE_STOP_MS,
    });
    const {token} = theme.useToken();
    const pendingClips = usePendingVoiceClips();
    const [pendingOpen, setPendingOpen] = useState(false);
    const [retryingClipID, setRetryingClipID] = useState("");
    const [draftSettings, setDraftSettings] = useState<WhisperSettings>(() => readStoredSettings());
    const [configOpen, setConfigOpen] = useState(false);
    const [transcribing, setTranscribing] = useState(false);
    const [resolvingMode, setResolvingMode] = useState(false);
    const [holdProgress, setHoldProgress] = useState(0);
    const holdStartRef = useRef(0);
    const holdTimerRef = useRef<number | null>(null);
    const holdFrameRef = useRef<number | null>(null);
    const skipClickRef = useRef(false);
    const finishInFlightRef = useRef(false);
    const autoStopTriggeredRef = useRef(false);
    const lastRealtimeResultRef = useRef(0);
    const lastRealtimeErrorRef = useRef("");
    const onRecordingChangeRef = useRef(onRecordingChange);
    const onBusyChangeRef = useRef(onBusyChange);
    onBusyChangeRef.current = onBusyChange;
    const mountedRef = useRef(true);
    useEffect(() => {
        mountedRef.current = true;
        return () => { mountedRef.current = false; };
    }, []);

    const effectiveLanguage = useMemo(
        () => normalizeLanguage(language ?? settings.language),
        [language, settings.language],
    );
    const effectivePrompt = useMemo(() => prompt ?? settings.prompt ?? "", [prompt, settings.prompt]);
    const requestPrompt = useMemo(() => {
        const nextPrompt = effectivePrompt.trim();
        return [
            effectiveLanguage === DEFAULT_LANGUAGE ? ZH_STYLE_PROMPT : "",
            nextPrompt,
        ].filter(Boolean).join("\n");
    }, [effectiveLanguage, effectivePrompt]);
    const realtimeRecording = realtime.status === "recording";
    const realtimeActive = ["starting", "recording", "finishing"].includes(realtime.status);
    const realtimePreview = realtime.previewText;
    const retrying = Boolean(retryingClipID);
    const recording = recorder.recording || realtimeActive;
    const busy = transcribing
        || resolvingMode
        || retrying
        || recorder.state === "stopping"
        || realtime.status === "starting"
        || realtime.status === "finishing";
    const isDisabled = Boolean(disabled || busy);
    const sessionBusy = recording || busy;

    useEffect(() => {
        onBusyChangeRef.current?.(sessionBusy);
    }, [sessionBusy]);

    useEffect(() => () => onBusyChangeRef.current?.(false), []);

    useEffect(() => {
        onRecordingChangeRef.current = onRecordingChange;
    }, [onRecordingChange]);

    // A retry inserts text like a recording does, so callers that remember the
    // cursor on recording start need to see it as one.
    const insertingVoice = recording || retrying;
    useEffect(() => {
        onRecordingChangeRef.current?.(insertingVoice);
    }, [insertingVoice]);

    useEffect(() => {
        return () => onRecordingChangeRef.current?.(false);
    }, []);

    const emitError = useCallback((nextError: string) => {
        onError?.(nextError);
        message.error(nextError).then();
    }, [onError]);

    useEffect(() => {
        onPartialText?.(realtimeActive ? realtimePreview : "");
    }, [onPartialText, realtimeActive, realtimePreview]);

    useEffect(() => {
        if (realtime.status !== "error" || !realtime.error) {
            return;
        }
        if (lastRealtimeErrorRef.current === realtime.error) {
            return;
        }
        lastRealtimeErrorRef.current = realtime.error;
        emitError(realtime.error);
    }, [emitError, realtime.error, realtime.status]);

    useEffect(() => {
        const result = realtime.result;
        if (!result || lastRealtimeResultRef.current === result.id) {
            return;
        }
        lastRealtimeResultRef.current = result.id;
        const text = result.text.trim();
        if (text) {
            onText(text, {text, language: "zh", duration: result.durationMs / 1000});
        }
        if (result.failedAudio) {
            void addPendingVoiceClip({
                kind: "pcm8k",
                data: result.failedAudio,
                durationMs: result.failedDurationMs,
            });
            const seconds = Math.max(1, Math.round(result.failedDurationMs / 1000));
            message.warning({
                content: `${text ? "最后" : ""}有 ${seconds} 秒语音没能转写（${result.failedReason || "网络异常"}），录音已保存，可稍后点按钮旁的「重试」`,
                duration: 6,
            }).then();
        } else if (!text) {
            message.info("未检测到有效语音").then();
        }
    }, [onText, realtime.result]);

    const clearLongPress = useCallback(() => {
        if (holdTimerRef.current !== null) {
            window.clearTimeout(holdTimerRef.current);
            holdTimerRef.current = null;
        }
        if (holdFrameRef.current !== null) {
            window.cancelAnimationFrame(holdFrameRef.current);
            holdFrameRef.current = null;
        }
        setHoldProgress(0);
    }, []);

    const openConfig = useCallback(() => {
        skipClickRef.current = true;
        setDraftSettings(readStoredSettings());
        setConfigOpen(true);
    }, []);

    const animateLongPress = useCallback(() => {
        const elapsed = Date.now() - holdStartRef.current;
        const visibleElapsed = Math.max(0, elapsed - LONG_PRESS_PROGRESS_DELAY_MS);
        const visibleDuration = LONG_PRESS_MS - LONG_PRESS_PROGRESS_DELAY_MS;
        setHoldProgress(Math.min(1, visibleElapsed / visibleDuration));
        if (elapsed < LONG_PRESS_MS) {
            holdFrameRef.current = window.requestAnimationFrame(animateLongPress);
        }
    }, []);

    const startLongPress = useCallback(() => {
        if (isDisabled || recording) {
            return;
        }
        clearLongPress();
        holdStartRef.current = Date.now();
        holdFrameRef.current = window.requestAnimationFrame(animateLongPress);
        holdTimerRef.current = window.setTimeout(() => {
            clearLongPress();
            openConfig();
        }, LONG_PRESS_MS);
    }, [animateLongPress, clearLongPress, isDisabled, openConfig, recording]);

    const finishRecording = useCallback(async () => {
        if (!recorder.recording || finishInFlightRef.current) {
            return;
        }
        finishInFlightRef.current = true;
        let failedBlob: Blob | null = null;
        try {
            const recording = await recorder.stop();
            if (!mountedRef.current) return;
            if (!recording.hasVoice || !recording.blob) {
                message.info("未检测到有效语音").then();
                return;
            }
            const blob = recording.blob;
            if (blob.size === 0) {
                emitError("录音内容为空");
                return;
            }
            setTranscribing(true);
            failedBlob = blob;
            const response = await transcribeAudio({
                file: blob,
                fileName: fileName || audioFileName(blob),
                prompt: requestPrompt,
            });
            if (!mountedRef.current) return;
            if (!response?.text) {
                emitError("语音转写失败");
                return;
            }
            onText(response.text, response);
        } catch (error) {
            if (failedBlob) {
                void addPendingVoiceClip({
                    kind: "file",
                    data: failedBlob,
                    fileName: fileName || audioFileName(failedBlob),
                    durationMs: recorder.durationMs,
                });
                message.warning({
                    content: `语音转写失败（${error instanceof Error ? error.message : "网络异常"}），录音已保存，可稍后点按钮旁的「重试」`,
                    duration: 6,
                }).then();
            } else {
                emitError(error instanceof Error ? error.message : "语音转写失败");
            }
        } finally {
            setTranscribing(false);
            finishInFlightRef.current = false;
        }
    }, [emitError, fileName, onText, recorder, requestPrompt]);

    useEffect(() => {
        // The realtime session stops itself (idle + max duration); this covers
        // the file-upload recorder.
        if (!recorder.recording) {
            autoStopTriggeredRef.current = false;
            return;
        }
        if (
            recorder.durationMs >= maxDurationSeconds * 1000
            && !autoStopTriggeredRef.current
        ) {
            autoStopTriggeredRef.current = true;
            void finishRecording();
        }
    }, [finishRecording, maxDurationSeconds, recorder.durationMs, recorder.recording]);

    const handleClick = useCallback(async () => {
        if (skipClickRef.current) {
            skipClickRef.current = false;
            return;
        }
        if (realtimeRecording) {
            realtime.stop();
            return;
        }
        if (recorder.recording) {
            await finishRecording();
            return;
        }
        if (isDisabled) {
            return;
        }

        // Clear the previous terminal state before re-arming its result/error handlers.
        // Capability lookup can re-render the caller before the next recorder starts.
        realtime.reset();
        lastRealtimeErrorRef.current = "";
        const cached = peekTranscriptionCapability();
        if (!cached) {
            setResolvingMode(true);
        }
        try {
            let capability: AiTranscribeCapability;
            if (cached) {
                capability = cached;
                // Pick up mode changes for next time without delaying this start.
                void getTranscriptionCapability().catch(() => undefined);
            } else {
                capability = await getTranscriptionCapability();
            }
            if (!mountedRef.current) return;
            if (capability.mode === "realtime") {
                await realtime.start();
                if (!mountedRef.current) realtime.cancel();
                return;
            }
            const started = await recorder.start();
            if (!mountedRef.current) {
                recorder.cancel();
                return;
            }
            if (!started) {
                emitError(recorder.error || "无法开始录音");
            }
        } catch (error) {
            emitError(error instanceof Error ? error.message : "无法开始录音");
        } finally {
            setResolvingMode(false);
        }
    }, [
        emitError,
        finishRecording,
        isDisabled,
        realtime,
        realtimeRecording,
        recorder,
    ]);

    const handleSaveSettings = useCallback(() => {
        const next = {
            language: normalizeLanguage(draftSettings.language),
            prompt: draftSettings.prompt?.trim() || "",
            maxDurationSeconds: normalizeMaxDuration(draftSettings.maxDurationSeconds),
        };
        writeStoredSettings(next);
        setSettings(next);
        setConfigOpen(false);
    }, [draftSettings.language, draftSettings.maxDurationSeconds, draftSettings.prompt]);

    const retryClip = useCallback(async (clip: PendingVoiceClip) => {
        if (retryingClipID || recording) {
            return;
        }
        setRetryingClipID(clip.id);
        try {
            const text = await transcribePendingVoiceClip(clip, requestPrompt);
            if (!mountedRef.current) return;
            if (text) {
                onText(text, {text, language: "zh", duration: clip.durationMs / 1000});
                message.success("已补上这段录音的文字").then();
            } else {
                message.info("这段录音没有识别出文字").then();
            }
            await removePendingVoiceClip(clip.id);
        } catch (error) {
            emitError(`重试失败：${error instanceof Error ? error.message : "语音转写失败"}，录音仍保留`);
        } finally {
            if (mountedRef.current) setRetryingClipID("");
        }
    }, [emitError, onText, recording, requestPrompt, retryingClipID]);

    useEffect(() => {
        if (pendingClips.length === 0) setPendingOpen(false);
    }, [pendingClips.length]);

    const progressDegrees = Math.round(holdProgress * 360);
    const loading = transcribing
        || resolvingMode
        || retrying
        || realtime.status === "starting"
        || realtime.status === "finishing";
    const defaultIcon = loading ? <LoadingOutlined spin/> : <AudioOutlined/>;
    const iconOnly = children == null;
    const iconOnlySize = buttonProps.size === "large" ? 40 : buttonProps.size === "small" ? 24 : 32;
    const recordingWidth = buttonProps.size === "small" ? 144 : buttonProps.size === "large" ? 184 : 164;
    const recordingDurationMs = realtimeRecording ? realtime.durationMs : recorder.durationMs;
    const recordingWaveform = realtimeRecording ? realtime.waveform : recorder.waveform;
    const realtimeOffline = realtimeRecording && !realtime.online;
    const idleCountdown = realtimeRecording && realtime.idleRemainingMs !== null
        ? Math.ceil(realtime.idleRemainingMs / 1000)
        : null;
    const recordingContent = <span
        style={{
            width: "100%",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            fontVariantNumeric: "tabular-nums",
        }}
    >
        <span style={{display: "inline-flex", alignItems: "center", gap: 7}}>
            {realtimeOffline
                ? <DisconnectOutlined aria-label="网络中断，录音继续" style={{fontSize: 11}}/>
                : <span aria-hidden={true} style={{fontSize: 9}}>●</span>}
            <span>{formatDuration(recordingDurationMs)}</span>
        </span>
        {idleCountdown !== null
            ? <span style={{fontSize: 12, opacity: 0.9}}>{idleCountdown}s 后结束</span>
            : <RecordingWave waveform={recordingWaveform}/>}
    </span>;
    const pendingContent = <div style={{width: 280, maxWidth: "70vw"}}>
        <Typography.Paragraph type="secondary" style={{fontSize: 12, marginBottom: 8}}>
            这些录音当时没能转写，录音还在。网络恢复后点「转写」，文字会插到当前输入位置。
        </Typography.Paragraph>
        <Space direction="vertical" size={6} style={{width: "100%"}}>
            {pendingClips.map((clip) => <div
                key={clip.id}
                style={{display: "flex", alignItems: "center", gap: 8}}
            >
                <span style={{flex: 1, fontVariantNumeric: "tabular-nums"}}>
                    {formatDuration(clip.durationMs)} 录音
                    <Typography.Text type="secondary" style={{marginLeft: 6, fontSize: 12}}>
                        {formatClipTime(clip.createdAt)}
                    </Typography.Text>
                </span>
                <Button
                    size="small"
                    type="primary"
                    loading={retryingClipID === clip.id}
                    disabled={Boolean(disabled) || recording || (retrying && retryingClipID !== clip.id)}
                    onClick={() => void retryClip(clip)}
                >
                    转写
                </Button>
                <Popconfirm
                    title="放弃这段录音？"
                    description="录音会被删除，无法找回。"
                    okText="放弃"
                    okButtonProps={{danger: true}}
                    cancelText="保留"
                    onConfirm={() => void removePendingVoiceClip(clip.id)}
                >
                    <Button size="small" type="text" danger disabled={retryingClipID === clip.id}>放弃</Button>
                </Popconfirm>
            </div>)}
        </Space>
    </div>;
    const showPendingBadge = pendingClips.length > 0 && !recording;

    return <>
        <Popover
            open={showRealtimePreview && realtimeActive}
            placement="top"
            title="实时转写"
            content={<Typography.Text
                style={{
                    display: "block",
                    width: 320,
                    maxWidth: "70vw",
                    maxHeight: 180,
                    overflowY: "auto",
                    whiteSpace: "pre-wrap",
                }}
            >
                {realtimePreview || "正在聆听…"}
            </Typography.Text>}
        >
            <Tooltip
                open={showTooltip && !pendingOpen ? undefined : false}
                title={realtimeOffline
                    ? "网络中断，录音继续，恢复后自动补转；点击停止"
                    : realtimeRecording ? "点击停止实时识别" : recorder.recording ? "点击停止录音" : tooltip}
            >
                <span
                    style={{
                        position: "relative",
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                    }}
                >
                <span
                    aria-hidden={true}
                    style={{
                        position: "absolute",
                        inset: -4,
                        borderRadius: 999,
                        opacity: holdProgress > 0 ? 1 : 0,
                        background: `conic-gradient(#1677ff ${progressDegrees}deg, rgba(22, 119, 255, 0.14) 0deg)`,
                        transition: holdProgress === 0 ? "opacity 160ms ease" : undefined,
                    }}
                />
                    <Button
                        {...buttonProps}
                        type={type || (recording ? "primary" : "default")}
                        danger={danger || recording}
                        disabled={isDisabled}
                        loading={false}
                        icon={recording ? undefined : (icon || defaultIcon)}
                        shape={recording ? "round" : (buttonProps.shape || (iconOnly ? "circle" : undefined))}
                        aria-label={recording
                            ? `停止录音，已录音 ${formatDuration(recordingDurationMs)}`
                            : (buttonProps["aria-label"] || (iconOnly ? tooltip : undefined))}
                        onPointerDown={startLongPress}
                        onPointerUp={clearLongPress}
                        onPointerLeave={clearLongPress}
                        onPointerCancel={clearLongPress}
                        onClick={handleClick}
                        style={{
                            position: "relative",
                            zIndex: 1,
                            ...(recording ? {
                                width: recordingWidth,
                                minWidth: recordingWidth,
                                paddingInline: 14,
                                transition: "width 180ms ease, min-width 180ms ease",
                            } : iconOnly ? {
                                width: iconOnlySize,
                                height: iconOnlySize,
                                minWidth: iconOnlySize,
                            } : {}),
                            ...buttonProps.style,
                        }}
                    >
                        {recording ? recordingContent : children}
                    </Button>
                    {showPendingBadge && <Popover
                        open={pendingOpen}
                        onOpenChange={setPendingOpen}
                        trigger="click"
                        placement="topRight"
                        title="待重试的录音"
                        content={pendingContent}
                    >
                        <button
                            type="button"
                            aria-label={`${pendingClips.length} 段录音待重试`}
                            onClick={(event) => event.stopPropagation()}
                            style={{
                                position: "absolute",
                                top: -6,
                                right: -6,
                                zIndex: 2,
                                minWidth: 16,
                                height: 16,
                                padding: "0 4px",
                                border: `1.5px solid ${token.colorBgContainer}`,
                                borderRadius: 999,
                                background: token.colorError,
                                color: token.colorTextLightSolid,
                                fontSize: 10,
                                lineHeight: "13px",
                                fontWeight: 600,
                                cursor: "pointer",
                                boxShadow: token.boxShadowTertiary,
                            }}
                        >
                            {retrying ? "…" : pendingClips.length}
                        </button>
                    </Popover>}
                </span>
            </Tooltip>
        </Popover>
        <Modal
            title="语音转写设置"
            open={configOpen}
            width={480}
            okText="保存"
            cancelText="取消"
            onOk={handleSaveSettings}
            onCancel={() => setConfigOpen(false)}
            destroyOnClose={true}
        >
            <Space direction="vertical" size="middle" style={{width: "100%"}}>
                <Space direction="vertical" size={4} style={{width: "100%"}}>
                    <Typography.Text type="secondary">语言</Typography.Text>
                    <Select
                        aria-label="语言"
                        value={normalizeLanguage(draftSettings.language)}
                        options={LANGUAGE_OPTIONS}
                        onChange={(value) => setDraftSettings((prev) => ({
                            ...prev,
                            language: value,
                        }))}
                        style={{width: "100%"}}
                    />
                </Space>
                <Input.TextArea
                    allowClear={true}
                    autoSize={{minRows: 3, maxRows: 5}}
                    placeholder="prompt（可补充专有名词、上下文或上一段转写）"
                    value={draftSettings.prompt}
                    onChange={(event) => setDraftSettings((prev) => ({
                        ...prev,
                        prompt: event.target.value,
                    }))}
                />
                <Space direction="vertical" size={4} style={{width: "100%"}}>
                    <Typography.Text type="secondary">最长录音时长</Typography.Text>
                    <InputNumber
                        aria-label="最长录音时长"
                        min={MIN_MAX_DURATION_SECONDS}
                        max={MAX_MAX_DURATION_SECONDS}
                        step={10}
                        addonAfter="秒"
                        value={normalizeMaxDuration(draftSettings.maxDurationSeconds)}
                        onChange={(value) => setDraftSettings((prev) => ({
                            ...prev,
                            maxDurationSeconds: typeof value === "number" ? value : DEFAULT_MAX_DURATION_SECONDS,
                        }))}
                        style={{width: "100%"}}
                    />
                </Space>
            </Space>
        </Modal>
    </>;
}
