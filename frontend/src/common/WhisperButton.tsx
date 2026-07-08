import {AudioOutlined, LoadingOutlined} from "@ant-design/icons";
import {Button, Input, message, Modal, Select, Space, Tooltip, Typography} from "antd";
import type {ButtonProps} from "antd";
import {useCallback, useMemo, useRef, useState} from "react";
import {transcribeAudio} from "./aiGateway";
import type {AiTranscribeResp} from "./aiProtocol";
import {useAudioRecorder} from "./useAudioRecorder";

const STORAGE_KEY = "platform.ai.transcribe.settings.v1";
const LONG_PRESS_MS = 900;
const LONG_PRESS_PROGRESS_DELAY_MS = 300;
const DEFAULT_LANGUAGE = "zh";
const ZH_STYLE_PROMPT = "请使用简体中文写法和中文标点风格。";
const LANGUAGE_OPTIONS = [
    {label: "简体中文", value: "zh"},
    {label: "英文", value: "en"},
    {label: "日语", value: "ja"},
];

interface WhisperSettings {
    language?: string;
    prompt?: string;
}

export interface WhisperButtonProps extends Omit<ButtonProps, "onClick" | "loading"> {
    onText: (text: string, response: AiTranscribeResp) => void;
    onError?: (error: string) => void;
    language?: string;
    prompt?: string;
    fileName?: string;
    tooltip?: string;
}

function normalizeLanguage(language?: string): string {
    const next = language?.trim() || DEFAULT_LANGUAGE;
    return LANGUAGE_OPTIONS.some((option) => option.value === next) ? next : DEFAULT_LANGUAGE;
}

function normalizeSettings(settings: WhisperSettings): WhisperSettings {
    return {
        language: normalizeLanguage(settings.language),
        prompt: settings.prompt?.trim() || "",
    };
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
        });
    } catch {
        return normalizeSettings({});
    }
}

function writeStoredSettings(settings: WhisperSettings) {
    const next = normalizeSettings(settings);
    try {
        if (next.language === DEFAULT_LANGUAGE && !next.prompt) {
            window.localStorage.removeItem(STORAGE_KEY);
            return;
        }
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
        // localStorage can be unavailable in private or restricted browser modes.
    }
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
    const busy = transcribing || recorder.state === "stopping";
    const isDisabled = Boolean(disabled || busy);

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
        if (isDisabled) {
            return;
        }
        clearLongPress();
        holdStartRef.current = Date.now();
        holdFrameRef.current = window.requestAnimationFrame(animateLongPress);
        holdTimerRef.current = window.setTimeout(() => {
            clearLongPress();
            openConfig();
        }, LONG_PRESS_MS);
    }, [animateLongPress, clearLongPress, isDisabled, openConfig]);

    const handleClick = useCallback(async () => {
        if (skipClickRef.current) {
            skipClickRef.current = false;
            return;
        }
        if (isDisabled) {
            return;
        }
        if (recorder.recording) {
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
            }
            return;
        }

        const started = await recorder.start();
        if (!started) {
            emitError(recorder.error || "无法开始录音");
        }
    }, [
        emitError,
        fileName,
        isDisabled,
        onText,
        recorder,
        requestPrompt,
    ]);

    const handleSaveSettings = useCallback(() => {
        const next = {
            language: normalizeLanguage(draftSettings.language),
            prompt: draftSettings.prompt?.trim() || "",
        };
        writeStoredSettings(next);
        setSettings(next);
        setConfigOpen(false);
    }, [draftSettings.language, draftSettings.prompt]);

    const progressDegrees = Math.round(holdProgress * 360);
    const defaultIcon = transcribing ? <LoadingOutlined spin/> : <AudioOutlined/>;
    const iconOnly = children == null;
    const iconOnlySize = buttonProps.size === "large" ? 40 : buttonProps.size === "small" ? 24 : 32;

    return <>
        <Tooltip title={tooltip}>
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
                    icon={icon || defaultIcon}
                    shape={buttonProps.shape || (iconOnly ? "circle" : undefined)}
                    aria-label={buttonProps["aria-label"] || (iconOnly ? tooltip : undefined)}
                    onPointerDown={startLongPress}
                    onPointerUp={clearLongPress}
                    onPointerLeave={clearLongPress}
                    onPointerCancel={clearLongPress}
                    onClick={handleClick}
                    style={{
                        position: "relative",
                        zIndex: 1,
                        ...(iconOnly ? {
                            width: iconOnlySize,
                            height: iconOnlySize,
                            minWidth: iconOnlySize,
                        } : {}),
                        ...buttonProps.style,
                    }}
                >
                    {children}
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
            </Space>
        </Modal>
    </>;
}
