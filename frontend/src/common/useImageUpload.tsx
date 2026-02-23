import { useCallback, useEffect, useRef, useState } from "react";
import { message, Modal } from "antd";
import { UploadFile, FileShow } from "./newSendHttp";

export interface UseImageUploadRet {
    uploading: boolean;
    /**
     * 打开文件选择框
     * @param multiple 是否多选
     */
    selectLocalFile: (multiple?: boolean) => void;
    /**
     * 检查剪切板是否有图片
     * @param autoUpload 是否自动上传（不询问）
     */
    checkClipboard: (autoUpload?: boolean) => Promise<void>;
    /**
     * 处理粘贴事件
     */
    handlePaste: (e: React.ClipboardEvent | ClipboardEvent) => void;
    /**
     * 直接上传一个文件
     */
    uploadSingle: (file: File) => Promise<FileShow | null>;
}

export type UploadHandler = (file: File) => Promise<FileShow | null>;
export type BeforeUploadHandler = (file: File) => Promise<File | null> | File | null;

export interface UseImageUploadOptions {
    beforeUpload?: BeforeUploadHandler;
}

/**
 * 统一的图片上传 Hook
 * @param onUploadSuccess 上传成功后的回调（每次成功上传一个文件都会调用）
 * @param customUpload 自定义的上传函数（可选，替换默认的 UploadFile）
 */
export function useImageUpload(
    onUploadSuccess?: (file: FileShow) => void,
    customUpload?: UploadHandler,
    options?: UseImageUploadOptions
): UseImageUploadRet {
    const [uploading, setUploading] = useState(false);
    const fileInputRef = useRef<HTMLInputElement | null>(null);

    useEffect(() => {
        return () => {
            if (fileInputRef.current) {
                fileInputRef.current.remove();
                fileInputRef.current = null;
            }
        };
    }, []);

    const uploadSingle = useCallback(async (file: File) => {
        setUploading(true);
        try {
            let processedFile = file;
            if (options?.beforeUpload) {
                const nextFile = await options.beforeUpload(file);
                if (!nextFile) {
                    return null;
                }
                processedFile = nextFile;
            }
            const uploader = customUpload || UploadFile;
            const ret = await uploader(processedFile);
            if (ret) {
                onUploadSuccess?.(ret);
                return ret;
            }
            return null;
        } catch (e) {
            console.error(e);
            message.error("上传失败，请重试");
            return null;
        } finally {
            setUploading(false);
        }
    }, [onUploadSuccess, customUpload, options]);

    const getOrCreateFileInput = useCallback(() => {
        if (!fileInputRef.current) {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = "image/*";
            input.style.display = 'none';
            document.body.appendChild(input);
            fileInputRef.current = input;
        }
        return fileInputRef.current;
    }, []);

    const selectLocalFile = useCallback((multiple: boolean = false) => {
        const input = getOrCreateFileInput();
        input.multiple = multiple;
        // reset so selecting the same file still triggers onchange consistently
        input.value = '';
        input.onchange = async (e: any) => {
            const files = e.target.files;
            if (files && files.length > 0) {
                for (let i = 0; i < files.length; i++) {
                    await uploadSingle(files[i]);
                }
            }
        };
        input.click();
    }, [getOrCreateFileInput, uploadSingle]);

    const checkClipboard = useCallback(async (autoUpload: boolean = false) => {
        if (!navigator.clipboard || !navigator.clipboard.read) {
            message.warning("当前浏览器不支持读取剪切板");
            return;
        }
        try {
            const items = await navigator.clipboard.read();
            let found = false;
            for (const item of items) {
                for (const type of item.types) {
                    if (type.startsWith('image/')) {
                        found = true;
                        const uploadLogic = () => {
                            item.getType(type).then((blob) => {
                                const file = new File([blob], `clipboard-image.${type.split('/')[1]}`, { type });
                                uploadSingle(file);
                            });
                        };

                        if (autoUpload) {
                            uploadLogic();
                        } else {
                            Modal.confirm({
                                title: '上传剪切板图片',
                                content: '检测到剪切板中有图片，是否上传？',
                                onOk: uploadLogic,
                                onCancel: () => {
                                    // 用户取消上传剪切板，则打开文件选框
                                    selectLocalFile(false);
                                }
                            });
                        }
                        return; // Found and handled
                    }
                }
            }
            if (!found) {
                message.info("剪切板中没有图片");
                selectLocalFile(false);
            }
        } catch (err) {
            console.error('Failed to read clipboard contents: ', err);
            // Fallback
            selectLocalFile(false);
        }
    }, [selectLocalFile, uploadSingle]);

    const handlePaste = useCallback((e: React.ClipboardEvent | ClipboardEvent) => {
        const items = (e as any).clipboardData?.items || (e as ClipboardEvent).clipboardData?.items;
        if (items) {
            for (let i = 0; i < items.length; i++) {
                if (items[i].type.indexOf("image") !== -1) {
                    const blob = items[i].getAsFile();
                    if (blob) {
                        uploadSingle(blob);
                        e.preventDefault();
                    }
                }
            }
        }
    }, [uploadSingle]);

    return {
        uploading,
        selectLocalFile,
        checkClipboard,
        handlePaste,
        uploadSingle
    };
}
