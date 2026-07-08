import {AudioOutlined, LoadingOutlined} from "@ant-design/icons";
import {Button, Input, message, Modal, Space, Tooltip} from "antd";
import type {ButtonProps} from "antd";
import {useCallback, useMemo, useRef, useState} from "react";
import {transcribeAudio} from "./aiGateway";
import type {AiTranscribeResp} from "./aiProtocol";
import {useAudioRecorder} from "./useAudioRecorder";

const STORAGE_KEY = "platform.ai.transcribe.settings.v1";
const LONG_PRESS_MS = 650;

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

function readStoredSettings(): WhisperSettings {
    try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (!raw) {
            return {};
        }
        const parsed = JSON.parse(raw) as WhisperSettings;
        return {
            language: typeof parsed.language === "string" ? parsed.language : "",
            prompt: typeof parsed.prompt === "string" ? parsed.prompt : "",
        };
    } catch {
        return {};
    }
}

function writeStoredSettings(settings: WhisperSettings) {
    const next = {
        language: settings.language?.trim() || "",
        prompt: settings.prompt?.trim() || "",
    };
    try {
        if (!next.language && !next.prompt) {
            window.localStorage.removeItem(STORAGE_KEY);
            return;
        }
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
        // localStorage can be unavailable in private or restricted browser modes.
    }
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

    const effectiveLanguage = useMemo(() => language ?? settings.language ?? "", [language, settings.language]);
    const effectivePrompt = useMemo(() => prompt ?? settings.prompt ?? "", [prompt, settings.prompt]);
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
        setHoldProgress(Math.min(1, elapsed / LONG_PRESS_MS));
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
                    fileName: fileName || `recording-${Date.now()}.webm`,
                    language: effectiveLanguage,
                    prompt: effectivePrompt,
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
        effectiveLanguage,
        effectivePrompt,
        emitError,
        fileName,
        isDisabled,
        onText,
        recorder,
    ]);

    const handleSaveSettings = useCallback(() => {
        const next = {
            language: draftSettings.language?.trim() || "",
            prompt: draftSettings.prompt?.trim() || "",
        };
        writeStoredSettings(next);
        setSettings(next);
        setConfigOpen(false);
    }, [draftSettings.language, draftSettings.prompt]);

    const progressDegrees = Math.round(holdProgress * 360);
    const defaultIcon = transcribing ? <LoadingOutlined spin/> : <AudioOutlined/>;

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
                    onPointerDown={startLongPress}
                    onPointerUp={clearLongPress}
                    onPointerLeave={clearLongPress}
                    onPointerCancel={clearLongPress}
                    onClick={handleClick}
                    style={{
                        position: "relative",
                        zIndex: 1,
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
            okText="保存"
            cancelText="取消"
            onOk={handleSaveSettings}
            onCancel={() => setConfigOpen(false)}
            destroyOnClose={true}
        >
            <Space direction="vertical" size="middle" style={{width: "100%"}}>
                <Input
                    allowClear={true}
                    addonBefore="language"
                    placeholder="留空自动检测，例如 zh / en / ja"
                    value={draftSettings.language}
                    onChange={(event) => setDraftSettings((prev) => ({
                        ...prev,
                        language: event.target.value,
                    }))}
                />
                <Input.TextArea
                    allowClear={true}
                    autoSize={{minRows: 4, maxRows: 8}}
                    placeholder="prompt"
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
