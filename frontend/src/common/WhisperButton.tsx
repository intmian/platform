import {AudioOutlined, LoadingOutlined} from "@ant-design/icons";
import {Button, Input, InputNumber, message, Modal, Select, Space, Tooltip, Typography} from "antd";
import type {ButtonProps} from "antd";
import {useCallback, useEffect, useMemo, useRef, useState} from "react";
import {transcribeAudio} from "./aiGateway";
import type {AiTranscribeResp} from "./aiProtocol";
import {useAudioRecorder} from "./useAudioRecorder";

const STORAGE_KEY = "platform.ai.transcribe.settings.v1";
const LONG_PRESS_MS = 900;
const LONG_PRESS_PROGRESS_DELAY_MS = 300;
const DEFAULT_LANGUAGE = "zh";
const DEFAULT_MAX_DURATION_SECONDS = 120;
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
    onRecordingChange?: (recording: boolean) => void;
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

function RecordingWave({durationMs}: {durationMs: number}) {
    return <span
        aria-hidden={true}
        style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 2,
            height: 16,
        }}
    >
        {[0, 1, 2, 3, 4].map((index) => {
            const phase = (durationMs / 180) + index * 1.35;
            const height = 4 + Math.round((Math.sin(phase) + 1) * 4);
            return <span
                key={index}
                style={{
                    display: "block",
                    width: 2,
                    height,
                    borderRadius: 999,
                    background: "currentColor",
                    transition: "height 180ms ease",
                }}
            />;
        })}
    </span>;
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
    onRecordingChange,
    disabled,
    children,
    icon,
    danger,
    type,
    ...buttonProps
}: WhisperButtonProps) {
    const recorder = useAudioRecorder();
    const [settings, setSettings] = useState<WhisperSettings>(() => readStoredSettings());
    const [draftSettings, setDraftSettings] = useState<WhisperSettings>(() => readStoredSettings());
    const [configOpen, setConfigOpen] = useState(false);
    const [transcribing, setTranscribing] = useState(false);
    const [holdProgress, setHoldProgress] = useState(0);
    const holdStartRef = useRef(0);
    const holdTimerRef = useRef<number | null>(null);
    const holdFrameRef = useRef<number | null>(null);
    const skipClickRef = useRef(false);
    const finishInFlightRef = useRef(false);
    const autoStopTriggeredRef = useRef(false);

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
    const maxDurationSeconds = normalizeMaxDuration(settings.maxDurationSeconds);
    const busy = transcribing || recorder.state === "stopping";
    const isDisabled = Boolean(disabled || busy);

    useEffect(() => {
        onRecordingChange?.(recorder.recording);
    }, [onRecordingChange, recorder.recording]);

    useEffect(() => {
        return () => onRecordingChange?.(false);
    }, [onRecordingChange]);

    const emitError = useCallback((nextError: string) => {
        onError?.(nextError);
        message.error(nextError).then();
    }, [onError]);

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
        if (isDisabled || recorder.recording) {
            return;
        }
        clearLongPress();
        holdStartRef.current = Date.now();
        holdFrameRef.current = window.requestAnimationFrame(animateLongPress);
        holdTimerRef.current = window.setTimeout(() => {
            clearLongPress();
            openConfig();
        }, LONG_PRESS_MS);
    }, [animateLongPress, clearLongPress, isDisabled, openConfig, recorder.recording]);

    const finishRecording = useCallback(async () => {
        if (!recorder.recording || finishInFlightRef.current) {
            return;
        }
        finishInFlightRef.current = true;
        try {
            const blob = await recorder.stop();
            if (blob.size === 0) {
                emitError("录音内容为空");
                return;
            }
            setTranscribing(true);
            const response = await transcribeAudio({
                file: blob,
                fileName: fileName || audioFileName(blob),
                prompt: requestPrompt,
            });
            if (!response?.text) {
                emitError("语音转写失败");
                return;
            }
            onText(response.text, response);
        } catch (error) {
            emitError(error instanceof Error ? error.message : "语音转写失败");
        } finally {
            setTranscribing(false);
            finishInFlightRef.current = false;
        }
    }, [emitError, fileName, onText, recorder, requestPrompt]);

    useEffect(() => {
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
        if (isDisabled) {
            return;
        }
        if (recorder.recording) {
            await finishRecording();
            return;
        }

        const started = await recorder.start();
        if (!started) {
            emitError(recorder.error || "无法开始录音");
        }
    }, [
        emitError,
        finishRecording,
        isDisabled,
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

    const progressDegrees = Math.round(holdProgress * 360);
    const defaultIcon = transcribing ? <LoadingOutlined spin/> : <AudioOutlined/>;
    const iconOnly = children == null;
    const iconOnlySize = buttonProps.size === "large" ? 40 : buttonProps.size === "small" ? 24 : 32;
    const recordingWidth = buttonProps.size === "small" ? 144 : buttonProps.size === "large" ? 184 : 164;
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
            <span aria-hidden={true} style={{fontSize: 9}}>●</span>
            <span>{formatDuration(recorder.durationMs)}</span>
        </span>
        <RecordingWave durationMs={recorder.durationMs}/>
    </span>;

    return <>
        <Tooltip title={recorder.recording ? "点击停止录音" : tooltip}>
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
                    type={type || (recorder.recording ? "primary" : "default")}
                    danger={danger || recorder.recording}
                    disabled={isDisabled}
                    loading={false}
                    icon={recorder.recording ? undefined : (icon || defaultIcon)}
                    shape={recorder.recording ? "round" : (buttonProps.shape || (iconOnly ? "circle" : undefined))}
                    aria-label={recorder.recording
                        ? `停止录音，已录音 ${formatDuration(recorder.durationMs)}`
                        : (buttonProps["aria-label"] || (iconOnly ? tooltip : undefined))}
                    onPointerDown={startLongPress}
                    onPointerUp={clearLongPress}
                    onPointerLeave={clearLongPress}
                    onPointerCancel={clearLongPress}
                    onClick={handleClick}
                    style={{
                        position: "relative",
                        zIndex: 1,
                        ...(recorder.recording ? {
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
                    {recorder.recording ? recordingContent : children}
                </Button>
            </span>
        </Tooltip>
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
