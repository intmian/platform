import {useCallback, useEffect, useMemo, useRef, useState} from "react";
import {Button, Flex, Input, message, Tooltip} from "antd";
import {
    CloseOutlined,
    CodeOutlined,
    EditOutlined,
    FileAddOutlined,
    FontColorsOutlined,
} from "@ant-design/icons";
import MarkdownIt from "markdown-it";
import MdEditor from "react-markdown-editor-lite";
import 'react-markdown-editor-lite/lib/index.css';
import {useIsMobile} from "../common/hooksv2";
import {useImageUpload} from "../common/useImageUpload";
import {sendGptRewrite} from "../common/newSendHttp";
import {WhisperButton} from "../common/WhisperButton";
import type {TextAreaRef} from "antd/es/input/TextArea";
import "./TaskDetailEditor.css";

const mdParser = new MarkdownIt();

type EditorMode = "display" | "simple" | "markdown";

interface TextSelection {
    start: number;
    end: number;
}

function insertAtSelection(value: string, text: string, selection: TextSelection): string {
    return value.slice(0, selection.start) + text + value.slice(selection.end);
}

export function Editor(props: { value: string, onChange: (value: string) => void }) {
    const [mode, setMode] = useState<EditorMode>("display");
    const [polishing, setPolishing] = useState(false);
    const [voiceRecording, setVoiceRecording] = useState(false);
    const [voicePreview, setVoicePreview] = useState("");
    const editorRef = useRef<any>(null);
    const textAreaRef = useRef<TextAreaRef | null>(null);
    const voiceBaseValueRef = useRef(props.value);
    const voiceSelectionRef = useRef<TextSelection>({start: props.value.length, end: props.value.length});
    const isMobile = useIsMobile();
    const uploadOptions = useMemo(() => ({accept: ""}), []);

    const getEditorInput = useCallback((): HTMLTextAreaElement | null => {
        if (mode === "markdown") {
            return editorRef.current?.getMdElement?.() ?? null;
        }
        return textAreaRef.current?.resizableTextArea?.textArea ?? null;
    }, [mode]);

    const handleVoiceRecordingChange = useCallback((recording: boolean) => {
        setVoiceRecording(recording);
        if (!recording) {
            setVoicePreview("");
            return;
        }
        const input = getEditorInput();
        voiceBaseValueRef.current = props.value;
        voiceSelectionRef.current = {
            start: input?.selectionStart ?? props.value.length,
            end: input?.selectionEnd ?? props.value.length,
        };
    }, [getEditorInput, props.value]);

    const handleVoiceText = useCallback((text: string) => {
        if (!text) {
            return;
        }
        const selection = voiceSelectionRef.current;
        const next = insertAtSelection(voiceBaseValueRef.current, text, selection);
        props.onChange(next);
        setVoicePreview("");
        window.requestAnimationFrame(() => {
            const input = getEditorInput();
            const cursor = selection.start + text.length;
            input?.focus();
            input?.setSelectionRange(cursor, cursor);
        });
    }, [getEditorInput, props]);

    const insertText = useCallback((text: string) => {
        if (!text) {
            return;
        }
        if (mode === "markdown" && editorRef.current) {
            editorRef.current.insertText(text);
            return;
        }

        const input = textAreaRef.current?.resizableTextArea?.textArea;
        if (mode === "simple" && input) {
            const start = input.selectionStart ?? props.value.length;
            const end = input.selectionEnd ?? start;
            const next = props.value.slice(0, start) + text + props.value.slice(end);
            props.onChange(next);
            window.requestAnimationFrame(() => {
                input.focus();
                input.setSelectionRange(start + text.length, start + text.length);
            });
            return;
        }

        props.onChange(props.value + text);
    }, [mode, props]);

    const {uploading, selectLocalFile, uploadSingle} = useImageUpload((fileShow) => {
        const markdown = fileShow.isImage
            ? `![${fileShow.name}](${fileShow.publishUrl})`
            : `[${fileShow.name}](${fileShow.publishUrl})`;
        insertText(markdown);
        message.success(`文件 ${fileShow.name} 已上传`).then();
    }, undefined, uploadOptions);

    const handleFilePaste = useCallback((event: ClipboardEvent | React.ClipboardEvent) => {
        if (voiceRecording) {
            event.preventDefault();
            return;
        }
        const files = Array.from(event.clipboardData?.files ?? []);
        if (files.length === 0) {
            return;
        }
        event.preventDefault();
        files.forEach((file) => {
            void uploadSingle(file);
        });
    }, [uploadSingle, voiceRecording]);

    useEffect(() => {
        if (mode !== "markdown" || !editorRef.current) {
            return;
        }
        editorRef.current.setView({menu: !voiceRecording, md: true, html: false});
        const input = editorRef.current.getMdElement() as HTMLTextAreaElement | undefined;
        if (!input) {
            return;
        }
        const onPaste = (event: ClipboardEvent) => handleFilePaste(event);
        input.addEventListener("paste", onPaste);
        return () => input.removeEventListener("paste", onPaste);
    }, [handleFilePaste, mode, voiceRecording]);

    const polish = useCallback(async () => {
        if (!props.value.trim() || polishing) {
            return;
        }
        setPolishing(true);
        try {
            const rewritten = await sendGptRewrite(props.value);
            if (!rewritten) {
                message.error("AI润色失败，已保留原文").then();
                return;
            }
            props.onChange(rewritten);
            message.success("AI润色完成").then();
        } catch (error) {
            console.error(error);
            message.error("AI润色失败，已保留原文").then();
        } finally {
            setPolishing(false);
        }
    }, [polishing, props]);

    const actionButton = (title: string, icon: React.ReactNode, onClick: () => void, options?: {
        loading?: boolean;
        disabled?: boolean;
    }) => <Tooltip title={title}>
        <Button
            size="small"
            shape="circle"
            aria-label={title}
            icon={icon}
            onClick={onClick}
            loading={options?.loading}
            disabled={options?.disabled}
        />
    </Tooltip>;

    const controls = mode === "display"
        ? actionButton("简单编辑", <EditOutlined/>, () => setMode("simple"))
        : <Flex gap={6} align="center">
            <WhisperButton
                size="small"
                tooltip="语音输入"
                disabled={polishing || uploading}
                showRealtimePreview={false}
                onRecordingChange={handleVoiceRecordingChange}
                onPartialText={setVoicePreview}
                onText={handleVoiceText}
                onError={() => setVoicePreview("")}
            />
            {actionButton("AI润色", <FontColorsOutlined/>, () => void polish(), {
                loading: polishing,
                disabled: voiceRecording || !props.value.trim(),
            })}
            {actionButton("上传文件", <FileAddOutlined/>, () => selectLocalFile(true), {
                loading: uploading,
                disabled: voiceRecording,
            })}
            {mode === "markdown"
                ? actionButton("简单编辑", <EditOutlined/>, () => setMode("simple"), {disabled: voiceRecording})
                : actionButton("MD编辑", <CodeOutlined/>, () => setMode("markdown"), {disabled: voiceRecording})}
            {actionButton("退出编辑", <CloseOutlined/>, () => setMode("display"), {disabled: voiceRecording})}
        </Flex>;

    const editorValue = voicePreview
        ? insertAtSelection(voiceBaseValueRef.current, voicePreview, voiceSelectionRef.current)
        : props.value;

    return <div className={`task-detail-editor-shell task-detail-editor-shell--${mode}`}>
        {mode === "display" ? <div
            className="task-detail-markdown-display custom-html-style"
            dangerouslySetInnerHTML={{__html: mdParser.render(props.value)}}
        /> : null}

        {mode === "simple" ? <Input.TextArea
            ref={textAreaRef}
            className="task-detail-simple-editor"
            value={editorValue}
            readOnly={voiceRecording}
            onChange={(event) => props.onChange(event.target.value)}
            onPaste={handleFilePaste}
            placeholder="任务备注"
            autoSize={false}
        /> : null}

        {mode === "markdown" ? <MdEditor
            ref={editorRef}
            className="task-detail-md-editor"
            value={editorValue}
            readOnly={voiceRecording}
            style={{
                height: "100%",
                fontSize: isMobile ? "16px" : undefined,
            }}
            renderHTML={(text) => mdParser.render(text)}
            onChange={({text}) => props.onChange(text)}
            placeholder="任务备注"
            config={{
                view: {menu: true, md: true, html: false},
                shortcuts: true,
            }}
        /> : null}

        <div className="task-detail-editor-controls">
            {controls}
        </div>
    </div>;
}
