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

export function Editor(props: { value: string, onChange: (value: string) => void }) {
    const [mode, setMode] = useState<EditorMode>("display");
    const [polishing, setPolishing] = useState(false);
    const editorRef = useRef<any>(null);
    const textAreaRef = useRef<TextAreaRef | null>(null);
    const isMobile = useIsMobile();
    const uploadOptions = useMemo(() => ({accept: ""}), []);

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
        const files = Array.from(event.clipboardData?.files ?? []);
        if (files.length === 0) {
            return;
        }
        event.preventDefault();
        files.forEach((file) => {
            void uploadSingle(file);
        });
    }, [uploadSingle]);

    useEffect(() => {
        if (mode !== "markdown" || !editorRef.current) {
            return;
        }
        editorRef.current.setView({menu: true, md: true, html: false});
        const input = editorRef.current.getMdElement() as HTMLTextAreaElement | undefined;
        if (!input) {
            return;
        }
        const onPaste = (event: ClipboardEvent) => handleFilePaste(event);
        input.addEventListener("paste", onPaste);
        return () => input.removeEventListener("paste", onPaste);
    }, [handleFilePaste, mode]);

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
                onText={(text) => insertText(text)}
            />
            {actionButton("AI润色", <FontColorsOutlined/>, () => void polish(), {
                loading: polishing,
                disabled: !props.value.trim(),
            })}
            {actionButton("上传文件", <FileAddOutlined/>, () => selectLocalFile(true), {
                loading: uploading,
            })}
            {mode === "markdown"
                ? actionButton("简单编辑", <EditOutlined/>, () => setMode("simple"))
                : actionButton("MD编辑", <CodeOutlined/>, () => setMode("markdown"))}
            {actionButton("退出编辑", <CloseOutlined/>, () => setMode("display"))}
        </Flex>;

    return <div className={`task-detail-editor-shell task-detail-editor-shell--${mode}`}>
        {mode === "display" ? <div
            className="task-detail-markdown-display custom-html-style"
            dangerouslySetInnerHTML={{__html: mdParser.render(props.value)}}
        /> : null}

        {mode === "simple" ? <Input.TextArea
            ref={textAreaRef}
            className="task-detail-simple-editor"
            value={props.value}
            onChange={(event) => props.onChange(event.target.value)}
            onPaste={handleFilePaste}
            placeholder="任务备注"
            autoSize={false}
        /> : null}

        {mode === "markdown" ? <MdEditor
            ref={editorRef}
            className="task-detail-md-editor"
            value={props.value}
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
