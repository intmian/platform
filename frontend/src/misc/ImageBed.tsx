import React, { useCallback, useEffect, useRef, useState } from "react";
import { Button, Card, Col, Input, message, Modal, Row, Spin, Tooltip } from "antd";
import { UploadOutlined, CopyOutlined, DeleteOutlined, FileAddOutlined } from "@ant-design/icons";
import { UploadFile, FileShow } from "../common/newSendHttp"; // 保持和原组件相同的第三方函数引用
import { useImageUpload } from "../common/useImageUpload";

// 本地缓存 key
const LOCAL_STORAGE_KEY = "imagebed.list.v1";
// 最大图片数量
const MAX_IMAGES = 20;

// 图片项结构（与 FileShow 兼容，但我们在本地存储时保持独立类型）
interface ImageItem {
    name: string;
    size: number;
    publishUrl: string; // 最终可访问的 URL（UploadFile 返回的 publishUrl）
    isImage?: boolean;
    uploadedAt: number; // 时间戳，便于排序
}

// 辅助：根据文件生成一个简单签名（用于去重判断）
// 使用 name + size，避免重复上传同一文件。若你需要更严格的判断，可改为 hash。
function fileSignature(file: File) {
    return `${file.name}_${file.size}`;
}

function loadFromDisk(): ImageItem[] {
    try {
        const s = localStorage.getItem(LOCAL_STORAGE_KEY);
        if (!s) return [];
        const parsed = JSON.parse(s) as ImageItem[];
        // 转换并按 uploadedAt 降序（最新在前）
        parsed.sort((a, b) => b.uploadedAt - a.uploadedAt);
        return parsed;
    } catch (e) {
        console.error("读取图床缓存失败", e);
        return [];
    }
}

function saveToDisk(list: ImageItem[]) {
    try {
        // 保证按时间降序并只保留前 MAX_IMAGES 个
        const sorted = [...list].sort((a, b) => b.uploadedAt - a.uploadedAt).slice(0, MAX_IMAGES);
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(sorted));
    } catch (e) {
        console.error("保存图床缓存失败", e);
    }
}

export default function ImageBed() {
    // 已上传图片列表（最新在前）
    const [images, setImages] = useState<ImageItem[]>(() => loadFromDisk());
    // 用于阻止重复上传相同文件（在单次会话中用签名缓存）
    const uploadingSignaturesRef = useRef<Set<string>>(new Set());

    // 初始化：从 localStorage 加载
    useEffect(() => {
        setImages(loadFromDisk());
    }, []);

    // 保存到 localStorage 当 images 变化时
    useEffect(() => {
        saveToDisk(images);
    }, [images]);


    const addToImages = (ret: FileShow, file: File) => {
        const newItem: ImageItem = {
            name: ret.name || file.name,
            size: file.size,
            publishUrl: ret.publishUrl || "",
            isImage: ret.isImage ?? true,
            uploadedAt: Date.now(),
        };

        // 更新 images：新上传放在最前面，并限制数量
        setImages((prev) => {
            const merged = [newItem, ...prev];
            // 去重（以 publishUrl 或 name+size 为准）
            const seen = new Set<string>();
            const deduped: ImageItem[] = [];
            for (const it of merged) {
                const key = it.publishUrl || `${it.name}_${it.size}`;
                if (!seen.has(key)) {
                    seen.add(key);
                    deduped.push(it);
                }
            }
            return deduped.slice(0, MAX_IMAGES);
        });

        message.success(`上传成功：${newItem.name}`);
    };

    // 内部：把一个 File 上传并把结果加入到 images（严格参考原组件 UploadFile）
    const customUpload = useCallback(async (file: File): Promise<FileShow | null> => {
        const sig = fileSignature(file);
        // 去重：先检查本地缓存中是否已存在相同签名
        const existsLocal = images.some((it) => it.name === file.name && it.size === file.size);
        if (existsLocal) {
            message.info("该图片已上传（本地缓存存在），已跳过上传");
            return null;
        }
        // 在会话中也避免重复上传
        if (uploadingSignaturesRef.current.has(sig)) {
            message.info("该文件正在上传中或已排队，稍后查看列表");
            return null;
        }

        try {
            uploadingSignaturesRef.current.add(sig);
            // 严格参考原组件使用 UploadFile(file) -> FileShow
            const ret = await UploadFile(file);
            
            if (!ret) {
                message.error("上传失败，请重试");
                return null;
            }
            
            addToImages(ret, file);
            return ret;
        } catch (e) {
            console.error("上传异常", e);
            message.error("上传发生错误");
            return null;
        } finally {
            // 上传完成后移除会话签名
            uploadingSignaturesRef.current.delete(sig);
        }
    }, [images]);

    const {
        uploading,
        handlePaste,
        selectLocalFile,
        checkClipboard
    } = useImageUpload(undefined, customUpload);


    // 复制链接
    const copyLink = useCallback(async (url: string) => {
        try {
            await navigator.clipboard.writeText(url);
            message.success("图片链接已复制到剪贴板");
        } catch (e) {
            // 备选：提示并展示 Modal 方便手动复制
            Modal.info({
                title: "复制失败",
                content: <div>请手动复制：<Input value={url} readOnly /></div>,
            });
        }
    }, []);

    // 删除一张图片（同时更新 localStorage）
    const deleteImage = useCallback((idx: number) => {
        Modal.confirm({
            title: "删除图片",
            content: "确定要从本地列表删除这张图片吗？（不会删除服务器上的文件）",
            onOk: () => {
                setImages((prev) => {
                    const next = [...prev];
                    next.splice(idx, 1);
                    return next;
                });
                message.success("已删除");
            },
        });
    }, []);

    // 渲染：使用 Grid 布局显示图片缩略，最多 20 张
    return (
        <Card
            title="图床"
            extra={
                <div style={{ display: "flex", gap: 8 }}>
                    <Button
                        size="small"
                        icon={<FileAddOutlined />}
                        onClick={() => checkClipboard(true)} // true: 尝试自动上传，保留与原来逻辑接近的体验
                        disabled={uploading}
                        title="从剪贴板上传或选择文件"
                    />
                    <Button
                        size="small"
                        icon={<UploadOutlined />}
                        onClick={() => selectLocalFile(true)}
                        disabled={uploading}
                        title="选择图片上传"
                    />
                    {uploading ? <Spin size="small" /> : null}
                </div>
            }
            style={{ width: 720 }}
        >
            <div
                // 绑定 paste 事件到容器，方便用户直接在该区域 Ctrl+V 粘贴图片
                onPaste={handlePaste}
                style={{
                    minHeight: 180,
                    border: "1px dashed #e9e9e9",
                    borderRadius: 6,
                    padding: 12,
                }}
            >
                <div style={{ marginBottom: 8, color: "#666" }}>
                    提示：可以点击按钮或在此区域粘贴图片上传。点击图片右上角复制链接或删除。
                </div>

                {images.length === 0 ? (
                    <div style={{ textAlign: "center", padding: 20, color: "#999" }}>
                        暂无图片
                    </div>
                ) : (
                    <Row gutter={[12, 12]}>
                        {images.map((it, idx) => (
                            <Col key={it.publishUrl || `${it.name}_${it.size}`} xs={24} sm={12} md={8} lg={6}>
                                <div style={{ position: "relative", borderRadius: 6, overflow: "hidden", background: "#fafafa" }}>
                                    <img
                                        src={it.publishUrl}
                                        alt={it.name}
                                        style={{ width: "100%", height: 140, objectFit: "cover", display: "block" }}
                                        onClick={() => {
                                            // 点击图片可以在新标签打开
                                            window.open(it.publishUrl, "_blank");
                                        }}
                                    />
                                    <div style={{
                                        position: "absolute",
                                        left: 6,
                                        right: 6,
                                        bottom: 6,
                                        display: "flex",
                                        justifyContent: "space-between",
                                        gap: 8,
                                    }}>
                                        <Tooltip title="复制图片链接">
                                            <Button
                                                size="small"
                                                icon={<CopyOutlined />}
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    copyLink(it.publishUrl);
                                                }}
                                            />
                                        </Tooltip>
                                        <div style={{ flex: 1, textAlign: "center", color: "#fff", textShadow: "0 1px 2px rgba(0,0,0,0.6)", fontSize: 12 }}>
                                            {it.name}
                                        </div>
                                        <Tooltip title="从本地列表删除">
                                            <Button
                                                size="small"
                                                danger
                                                icon={<DeleteOutlined />}
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    deleteImage(idx);
                                                }}
                                            />
                                        </Tooltip>
                                    </div>
                                </div>
                            </Col>
                        ))}
                    </Row>
                )}
            </div>
        </Card>
    );
}
