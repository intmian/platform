import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
    AutoComplete,
    Button,
    Card,
    Col,
    Collapse,
    DatePicker,
    Descriptions,
    Divider,
    Drawer,
    Flex,
    Form,
    Input,
    InputNumber,
    message,
    Modal,
    Popover,
    Popconfirm,
    Radio,
    Row,
    Select,
    Space,
    Switch,
    Tag,
    Timeline,
    Tooltip,
    Typography,
} from 'antd';
import dayjs from 'dayjs';
import {
    CheckOutlined,
    ClockCircleOutlined,
    DeleteOutlined,
    DownloadOutlined,
    EditOutlined,
    EyeOutlined,
    PauseOutlined,
    PlayCircleOutlined,
    PlusOutlined,
    ReloadOutlined,
    ShareAltOutlined,
    StarFilled,
    StarOutlined,
    StopOutlined,
    UploadOutlined,
} from '@ant-design/icons';
import {
    LibraryExtra,
    LibraryItemFull,
    LibraryItemStatus,
    LibraryLogEntry,
    LibraryLogType,
    LibraryRound,
    LibraryScoreData,
    LibraryStatusColors,
    LibraryStatusNames,
} from './net/protocal';
import {
    addNoteLog,
    addScoreLog,
    addStatusLog,
    addTimelineCutoffLog,
    buildLibraryTitleCoverDataUrl,
    canUpdateReasonOnSameStatus,
    getCurrentStatus,
    getCurrentTodoReason,
    getComplexScoreSnapshot,
    formatDateTime,
    getDisplayStatusInfo,
    getLatestWaitReason,
    getLibraryCoverPaletteByTitle,
    getLibraryDetailCoverUrl,
    getLogTypeText,
    getMainScore,
    getLibraryPreviewCoverUrl,
    getScoreDisplay,
    getScoreStarColor,
    getScoreText,
    isUpdatedAtDrivenLogType,
    LIBRARY_WAIT_EXPIRED_RULE_TEXT,
    normalizeMainScoreSelection,
    setMainScore,
    startNewRound,
    syncLibraryUpdatedAtFromLatestLog,
    touchLibraryUpdatedAt,
} from './libraryUtil';
import {useIsMobile} from '../common/hooksv2';
import TextRate from '../library/TextRate';
import LibraryShareCard from './LibraryShareCard';
import LibraryScorePopover from './LibraryScorePopover';
import {useImageUpload} from '../common/useImageUpload';
import {prepareLibraryCoverFiles} from '../common/imageCrop';
import {FileShow, UploadFile} from '../common/newSendHttp';

const {Text, Paragraph} = Typography;
const {TextArea} = Input;

// 评分序列
const SCORE_SEQ = ["零", "差", "合", "优", "满"];
const SCORE_OBJ_SEQ = ["垃圾", "低劣", "普通", "优秀", "传奇"];
const SCORE_SUB_SEQ = ["折磨", "负面", "消磨", "享受", "极致"];
const SCORE_INNOVATE_SEQ = ["抄袭", "模仿", "沿袭", "创新", "革命"];
const LIBRARY_PLACEHOLDER_TEXT_WIDTH_RATIO = 0.1;
const LIBRARY_PLACEHOLDER_PADDING_WIDTH_RATIO = 0.086;
const LIBRARY_PREVIEW_WIDTH = 480;
type DetailLogFilter = 'all' | 'withoutNote';

function scoreDataToText(seq: string[], score?: LibraryScoreData): string {
    if (!score) {
        return seq[2];
    }
    const idx = Math.max(1, Math.min(5, score.value || 3)) - 1;
    const base = seq[idx] || seq[2];
    if (score.plus) {
        return `${base}+`;
    }
    if (score.sub) {
        return `${base}-`;
    }
    return base;
}

async function waitForImagesLoaded(container: HTMLElement): Promise<void> {
    const images = Array.from(container.querySelectorAll('img'));
    const pending = images.filter((img) => !img.complete);
    if (pending.length === 0) {
        return;
    }

    await Promise.race([
        Promise.all(
            pending.map((img) => new Promise<void>((resolve) => {
                img.addEventListener('load', () => resolve(), {once: true});
                img.addEventListener('error', () => resolve(), {once: true});
            }))
        ),
        new Promise<void>((resolve) => {
            window.setTimeout(resolve, 3000);
        }),
    ]);
}

function blobToDataUrl(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(reader.error || new Error('read blob failed'));
        reader.readAsDataURL(blob);
    });
}

function getImageFetchCredentials(src: string): RequestCredentials {
    try {
        const url = new URL(src, window.location.href);
        return url.origin === window.location.origin ? 'include' : 'omit';
    } catch {
        return 'omit';
    }
}

async function inlineExportImages(container: HTMLElement): Promise<void> {
    const imgs = Array.from(container.querySelectorAll('img'));
    await Promise.all(imgs.map(async (img) => {
        const src = img.getAttribute('src') || '';
        if (!src || src.startsWith('data:') || src.startsWith('blob:')) {
            return;
        }
        try {
            const response = await fetch(src, {credentials: getImageFetchCredentials(src)});
            if (!response.ok) {
                throw new Error(`fetch image failed: ${response.status}`);
            }
            const blob = await response.blob();
            const dataUrl = await blobToDataUrl(blob);
            if (dataUrl) {
                img.setAttribute('src', dataUrl);
            }
        } catch {
            const fallback = buildLibraryTitleCoverDataUrl((img.getAttribute('alt') || '').trim() || '未命名');
            if (fallback) {
                img.setAttribute('src', fallback);
            } else {
                (img as HTMLImageElement).style.display = 'none';
            }
        }
    }));
}

interface LibraryDetailProps {
    visible: boolean;
    item: LibraryItemFull | null;
    subGroupId: number;
    categories?: string[];
    todoReasonOptions?: string[];
    onClose: () => void;
    onSave: (item: LibraryItemFull) => void;
    onToggleFavorite?: (item: LibraryItemFull) => void;
    onDelete?: (item: LibraryItemFull) => void;
}

export default function LibraryDetail({visible, item, subGroupId, categories = [], todoReasonOptions = [], onClose, onSave, onToggleFavorite, onDelete}: LibraryDetailProps) {
    const isMobile = useIsMobile();
    const [editMode, setEditMode] = useState(false);
    const [localItem, setLocalItem] = useState<LibraryItemFull | null>(null);
    
    // 弹窗状态
    const [showNewRound, setShowNewRound] = useState(false);
    const [newRoundName, setNewRoundName] = useState('');
    const [showAddScore, setShowAddScore] = useState(false);
    const [showAddNote, setShowAddNote] = useState(false);
    const [noteContent, setNoteContent] = useState('');
    const [showStatusReason, setShowStatusReason] = useState(false);
    const [statusReasonInput, setStatusReasonInput] = useState('');
    const [pendingStatus, setPendingStatus] = useState<LibraryItemStatus | null>(null);
    const [showRenameRound, setShowRenameRound] = useState(false);
    const [renameRoundIndex, setRenameRoundIndex] = useState<number | null>(null);
    const [renameRoundName, setRenameRoundName] = useState('');
    const [showEditLogTime, setShowEditLogTime] = useState(false);
    const [editingLogPos, setEditingLogPos] = useState<{roundIndex: number; logIndex: number} | null>(null);
    const [editingLogTime, setEditingLogTime] = useState('');
    const [showEditLogContent, setShowEditLogContent] = useState(false);
    const [editingContentPos, setEditingContentPos] = useState<{roundIndex: number; logIndex: number} | null>(null);
    const [editingContentType, setEditingContentType] = useState<LibraryLogType | null>(null);
    const [editingContentText, setEditingContentText] = useState('');
    const [editingScoreText, setEditingScoreText] = useState('合');
    const [editingObjScoreText, setEditingObjScoreText] = useState('普通');
    const [editingSubScoreText, setEditingSubScoreText] = useState('消磨');
    const [editingInnovateScoreText, setEditingInnovateScoreText] = useState('沿袭');
    const [editingObjComment, setEditingObjComment] = useState('');
    const [editingSubComment, setEditingSubComment] = useState('');
    const [editingInnovateComment, setEditingInnovateComment] = useState('');
    const [editingEnableObjScore, setEditingEnableObjScore] = useState(true);
    const [editingEnableSubScore, setEditingEnableSubScore] = useState(true);
    const [editingEnableInnovateScore, setEditingEnableInnovateScore] = useState(true);
    const [editingScoreMode, setEditingScoreMode] = useState<'simple' | 'complex'>('simple');
    const [showRemarkPreview, setShowRemarkPreview] = useState(false);
    const [showLogNotePreview, setShowLogNotePreview] = useState(false);
    const [logNotePreviewText, setLogNotePreviewText] = useState('');
    const [detailLogFilter, setDetailLogFilter] = useState<DetailLogFilter>('all');
    const detailCoverRef = useRef<HTMLDivElement>(null);
    const [detailCoverWidth, setDetailCoverWidth] = useState(180);

    useEffect(() => {
        const node = detailCoverRef.current;
        if (!node) {
            return;
        }

        const update = () => {
            setDetailCoverWidth(node.clientWidth || 0);
        };

        update();
        const rafId = window.requestAnimationFrame(update);
        const timer = window.setTimeout(update, 120);
        const observer = new ResizeObserver(update);
        observer.observe(node);
        return () => {
            window.cancelAnimationFrame(rafId);
            window.clearTimeout(timer);
            observer.disconnect();
        };
    }, [visible, localItem?.title, isMobile]);
    
    // 分享弹窗
    const [showShare, setShowShare] = useState(false);
    const [shareExporting, setShareExporting] = useState(false);
    const shareCardRef = useRef<HTMLDivElement | null>(null);
    const [showRawCoverModal, setShowRawCoverModal] = useState(false);
    
    // 基本信息编辑表单
    const [form] = Form.useForm();

    const clearCoverFields = useCallback((extra: LibraryExtra): LibraryExtra => ({
        ...extra,
        pictureAddress: '',
        pictureAddressDetail: '',
        picturePreview: '',
        pictureAddressPreview: '',
    }), []);

    const replaceCoverFields = useCallback((
        extra: LibraryExtra,
        next: {
            original?: string;
            detail?: string;
            preview?: string;
        },
    ): LibraryExtra => {
        const original = (next.original || '').trim();
        const detail = (next.detail || '').trim() || original;
        const preview = (next.preview || '').trim() || original;
        return {
            ...clearCoverFields(extra),
            pictureAddress: original,
            pictureAddressDetail: detail,
            picturePreview: preview,
            pictureAddressPreview: preview,
        };
    }, [clearCoverFields]);

    const uploadLibraryCover = useCallback(async (file: File): Promise<FileShow | null> => {
        try {
            const processed = await prepareLibraryCoverFiles(file, {
                previewWidth: LIBRARY_PREVIEW_WIDTH,
            });
            if (!processed) {
                return null;
            }

            const originalUploaded = await UploadFile(processed.originalFile);
            if (!originalUploaded) {
                return null;
            }

            const detailUploaded = await UploadFile(processed.detailFile);
            if (!detailUploaded) {
                message.error('详情图上传失败');
                return null;
            }

            const previewUploaded = await UploadFile(processed.previewFile);
            if (!previewUploaded) {
                message.error('预览图上传失败');
                return null;
            }

            return {
                ...originalUploaded,
                detailUrl: detailUploaded.publishUrl,
                previewUrl: previewUploaded.publishUrl,
            };
        } catch (error) {
            console.error(error);
            message.error('图片处理失败');
            return null;
        }
    }, []);

    const {uploading: coverUploading, checkClipboard: checkCoverClipboard} = useImageUpload(
        (fileShow) => {
            setLocalItem((prev: LibraryItemFull | null) => {
                if (!prev) return prev;
                return {
                    ...prev,
                    extra: replaceCoverFields(prev.extra, {
                        original: fileShow.publishUrl,
                        detail: fileShow.detailUrl || fileShow.publishUrl,
                        preview: fileShow.previewUrl || fileShow.publishUrl,
                    }),
                };
            });
            message.success('封面已上传，已生成三图');
        },
        uploadLibraryCover
    );
    const editingTitle = Form.useWatch('title', form) || '';

    // 初始化 localItem
    useEffect(() => {
        if (item) {
            setLocalItem(JSON.parse(JSON.stringify(item)));
            form.setFieldsValue({
                title: item.title,
                author: item.extra.author,
                year: item.extra.year,
                remark: item.extra.remark,
                category: item.extra.category,
            });
            setDetailLogFilter('all');
            setShowRemarkPreview(false);
            setShowLogNotePreview(false);
            setLogNotePreviewText('');
        }
    }, [item, form]);

    // 保存基本信息
    const handleSaveBasicInfo = () => {
        form.validateFields().then((values) => {
            if (!localItem) return;
            
            const title = values.title?.trim() || '';
            const normalizedCoverExtra = replaceCoverFields(localItem.extra, {
                original: localItem.extra.pictureAddress,
                detail: localItem.extra.pictureAddressDetail,
                preview: localItem.extra.picturePreview || localItem.extra.pictureAddressPreview,
            });

            const newItem: LibraryItemFull = {
                ...localItem,
                title,
                extra: {
                    ...normalizedCoverExtra,
                    author: values.author || '',
                    year: typeof values.year === 'number' ? values.year : undefined,
                    remark: values.remark?.trim() || '',
                    category: values.category || '',
                },
            };
            
            setLocalItem(newItem);
            onSave(newItem);
            setEditMode(false);
        });
    };

    // 快速状态变更
    const handleStatusChange = (newStatus: LibraryItemStatus, comment?: string) => {
        if (!localItem) return;

        const currentStatus = getCurrentStatus(localItem.extra);
        const currentRound = localItem.extra.rounds[localItem.extra.currentRound];
        const roundEnded = !!currentRound?.endTime;

        // 防止重复操作（双重开始/完成等）。
        // 注意：等待和搁置状态允许在同状态下更新原因，因此不阻止。
        if (newStatus === currentStatus && !canUpdateReasonOnSameStatus(newStatus)) {
            message.warning(`当前已经是“${LibraryStatusNames[currentStatus] || ''}”状态，无需重复操作`);
            return;
        }

        // 如果本周目已经结束，再次点击“开始”需要二次确认，并提示建议新周目
        if (roundEnded && newStatus === LibraryItemStatus.DOING) {
            Modal.confirm({
                title: '本周目已结束',
                content: (
                    <div>
                        当前周目已在 {currentRound?.endTime} 完成。
                        <br />
                        继续“开始”会在本周目上追加日志，建议先通过“新周目”按钮创建新周目。
                        <br />
                        确定要继续在本周目内开始吗？
                    </div>
                ),
                onOk: () => {
                    const newExtra = addStatusLog({...localItem.extra}, newStatus, comment);
                    const newItem = {...localItem, extra: newExtra};
                    setLocalItem(newItem);
                    onSave(newItem);
                },
            });
            return;
        }

        // 正常更新状态
        const newExtra = addStatusLog({...localItem.extra}, newStatus, comment);
        const newItem = {...localItem, extra: newExtra};
        setLocalItem(newItem);
        onSave(newItem);
    };

    const openStatusReason = (status: LibraryItemStatus) => {
        if (!localItem) return;
        setPendingStatus(status);
        if (status === LibraryItemStatus.TODO) {
            setStatusReasonInput(getCurrentTodoReason(localItem.extra));
        } else {
            setStatusReasonInput(getLatestWaitReason(localItem.extra));
        }
        setShowStatusReason(true);
    };

    const handleRefreshUpdatedAt = () => {
        if (!localItem) return;
        const newExtra = touchLibraryUpdatedAt({...localItem.extra});
        const newItem = {...localItem, extra: newExtra};
        setLocalItem(newItem);
        onSave(newItem);
    };

    const openRenameRound = (roundIndex: number) => {
        if (!localItem) return;
        const round = localItem.extra.rounds[roundIndex];
        if (!round) {
            return;
        }
        setRenameRoundIndex(roundIndex);
        setRenameRoundName(round.name || '');
        setShowRenameRound(true);
    };

    const handleRenameRound = () => {
        if (!localItem || renameRoundIndex === null) {
            return;
        }
        const finalName = renameRoundName.trim();
        if (!finalName) {
            message.warning('请输入周目名称');
            return;
        }

        const newExtra: LibraryExtra = {
            ...localItem.extra,
            rounds: localItem.extra.rounds.map((round, index) => (
                index === renameRoundIndex
                    ? {...round, name: finalName}
                    : round
                )),
        };

        const newItem = {...localItem, extra: newExtra};
        setLocalItem(newItem);
        onSave(newItem);
        setShowRenameRound(false);
        setRenameRoundIndex(null);
        setRenameRoundName('');
        message.success('周目名称已更新');
    };

    const handleSetStatusWithReason = () => {
        if (pendingStatus === null) return;
        const reason = statusReasonInput.trim();
        if (pendingStatus === LibraryItemStatus.TODO && !reason) {
            message.warning('请输入原因');
            return;
        }
        handleStatusChange(pendingStatus, reason);
        setShowStatusReason(false);
        setStatusReasonInput('');
        setPendingStatus(null);
    };

    // 开始新周目
    const handleStartNewRound = () => {
        if (!localItem || !newRoundName.trim()) {
            message.warning('请输入周目名称');
            return;
        }
        
        const newExtra = startNewRound({...localItem.extra}, newRoundName.trim());
        const newItem = {...localItem, extra: newExtra};
        setLocalItem(newItem);
        onSave(newItem);
        setShowNewRound(false);
        setNewRoundName('');
        message.success(`开始${newRoundName}`);
    };

    // 添加评分
    const handleAddScore = (payload: AddScorePayload) => {
        if (!localItem) return;

        const scoreLogComment = payload.comment?.trim() || '';

        const newExtra = addScoreLog(
            {...localItem.extra},
            payload.mainScore.value,
            payload.mainScore.plus,
            payload.mainScore.sub,
            scoreLogComment,
            {
                mode: payload.mode,
                objScore: payload.objScore,
                subScore: payload.subScore,
                innovateScore: payload.innovateScore,
            }
        );
        // 已废弃字段：仅保底读取，不再持久化维护（复杂评分改为写入评分日志）。
        delete newExtra.scoreMode;
        delete newExtra.objScore;
        delete newExtra.subScore;
        delete newExtra.innovateScore;
        delete newExtra.mainScore;
        delete newExtra.comment;

        const newItem = {...localItem, extra: newExtra};
        setLocalItem(newItem);
        onSave(newItem);
        setShowAddScore(false);
    };

    const handleExportShareImage = async () => {
        if (!shareCardRef.current || !localItem) {
            message.warning('暂无可导出的分享内容');
            return;
        }
        let wrapper: HTMLDivElement | null = null;
        try {
            setShareExporting(true);
            const html2canvas = (await import('html2canvas')).default;
            const source = shareCardRef.current;
            const sourceWidth = Math.max(source.scrollWidth, source.clientWidth, 1);
            wrapper = document.createElement('div');
            wrapper.style.position = 'fixed';
            wrapper.style.left = '-100000px';
            wrapper.style.top = '0';
            wrapper.style.zIndex = '-1';
            wrapper.style.pointerEvents = 'none';
            wrapper.style.width = `${sourceWidth}px`;
            wrapper.style.background = '#ffffff';
            const target = source.cloneNode(true) as HTMLDivElement;
            target.style.maxHeight = 'none';
            target.style.overflow = 'visible';
            target.style.height = 'auto';
            wrapper.appendChild(target);
            document.body.appendChild(wrapper);
            await inlineExportImages(target);
            await waitForImagesLoaded(target);
            const width = Math.max(target.scrollWidth, target.clientWidth, 1);
            const height = Math.max(target.scrollHeight, target.clientHeight, 1);
            const canvas = await html2canvas(target, {
                scale: 2,
                useCORS: true,
                backgroundColor: '#ffffff',
                width,
                height,
                windowWidth: width,
                windowHeight: height,
                scrollX: 0,
                scrollY: 0,
            });
            const dataUrl = canvas.toDataURL('image/png');
            const link = document.createElement('a');
            link.href = dataUrl;
            link.download = `${localItem.title || 'library-share'}.png`;
            link.click();
            message.success('已导出分享图片');
        } catch (error) {
            console.error(error);
            message.error('导出失败，请稍后重试');
        } finally {
            if (wrapper && wrapper.parentNode) {
                wrapper.parentNode.removeChild(wrapper);
            }
            setShareExporting(false);
        }
    };

    // 添加备注
    const handleAddNote = () => {
        if (!localItem || !noteContent.trim()) {
            message.warning('请输入备注内容');
            return;
        }
        
        const newExtra = addNoteLog({...localItem.extra}, noteContent.trim());
        const newItem = {...localItem, extra: newExtra};
        setLocalItem(newItem);
        onSave(newItem);
        setShowAddNote(false);
        setNoteContent('');
    };

    // 设置主评分
    const handleSetMainScore = (roundIndex: number, logIndex: number) => {
        if (!localItem) return;
        
        const newExtra = setMainScore({...localItem.extra}, roundIndex, logIndex);
        const newItem = {...localItem, extra: newExtra};
        setLocalItem(newItem);
        onSave(newItem);
        message.success('已设为主评分');
    };

    const getSortedLogEntries = (round: LibraryRound) => {
        return round.logs
            .map((log, index) => ({log, index}))
            .filter(({log}) => detailLogFilter !== 'withoutNote' || log.type !== LibraryLogType.note)
            .sort((a, b) => new Date(a.log.time).getTime() - new Date(b.log.time).getTime());
    };

    const resetEditingContentState = () => {
        setShowEditLogContent(false);
        setEditingContentPos(null);
        setEditingContentType(null);
        setEditingContentText('');
        setEditingScoreText('合');
        setEditingObjScoreText('普通');
        setEditingSubScoreText('消磨');
        setEditingInnovateScoreText('沿袭');
        setEditingObjComment('');
        setEditingSubComment('');
        setEditingInnovateComment('');
        setEditingEnableObjScore(true);
        setEditingEnableSubScore(true);
        setEditingEnableInnovateScore(true);
        setEditingScoreMode('simple');
    };

    const openLogTimeEditor = (roundIndex: number, logIndex: number, time: string) => {
        setEditingLogPos({roundIndex, logIndex});
        setEditingLogTime(time);
        setShowEditLogTime(true);
    };

    const openLogContentEditor = (roundIndex: number, logIndex: number, log: LibraryLogEntry) => {
        setEditingContentPos({roundIndex, logIndex});
        setEditingContentType(log.type);
        if (log.type === LibraryLogType.score) {
            setEditingScoreText(getScoreText(log.score || 0, log.scorePlus, log.scoreSub));
            setEditingContentText(log.comment || '');
            const scoreSnapshot = localItem ? getComplexScoreSnapshot(localItem.extra, log) : {mode: 'simple' as const};
            const isComplexScore = scoreSnapshot.mode === 'complex';
            setEditingScoreMode(scoreSnapshot.mode);
            if (isComplexScore && localItem) {
                const objScore = scoreSnapshot.objScore;
                const subScore = scoreSnapshot.subScore;
                const innovateScore = scoreSnapshot.innovateScore;

                setEditingEnableObjScore(!!objScore);
                setEditingEnableSubScore(!!subScore);
                setEditingEnableInnovateScore(!!innovateScore);

                setEditingObjScoreText(scoreDataToText(SCORE_OBJ_SEQ, objScore));
                setEditingSubScoreText(scoreDataToText(SCORE_SUB_SEQ, subScore));
                setEditingInnovateScoreText(scoreDataToText(SCORE_INNOVATE_SEQ, innovateScore));

                setEditingObjComment(objScore?.comment || '');
                setEditingSubComment(subScore?.comment || '');
                setEditingInnovateComment(innovateScore?.comment || '');

                // 兼容历史数据：旧版本可能仅存了 extra.comment。
                if (!log.comment && localItem.extra.comment) {
                    setEditingContentText(localItem.extra.comment);
                }
            } else {
                setEditingEnableObjScore(false);
                setEditingEnableSubScore(false);
                setEditingEnableInnovateScore(false);
            }
        } else {
            setEditingContentText(log.comment || '');
        }
        setShowEditLogContent(true);
    };

    const parseRateTextToData = (seq: string[], text: string, scoreComment: string): LibraryScoreData | null => {
        const trimmed = text.trim();
        if (!trimmed) {
            return null;
        }
        let sign: '' | '+' | '-' = '';
        if (trimmed.endsWith('+')) sign = '+';
        if (trimmed.endsWith('-')) sign = '-';
        const label = sign ? trimmed.slice(0, -1) : trimmed;
        const idx = seq.findIndex((s) => s === label);
        if (idx < 0) {
            return null;
        }
        return {
            value: idx + 1,
            plus: sign === '+',
            sub: sign === '-',
            comment: scoreComment.trim(),
        };
    };

    const parseScoreTextToData = (text: string): {score: number; plus: boolean; sub: boolean} | null => {
        const trimmed = text.trim();
        if (!trimmed) {
            return null;
        }
        const plus = trimmed.endsWith('+');
        const sub = trimmed.endsWith('-');
        const base = plus || sub ? trimmed.slice(0, -1) : trimmed;
        const index = SCORE_SEQ.findIndex((name) => name === base);
        if (index < 0) {
            return null;
        }
        return {
            score: index + 1,
            plus,
            sub,
        };
    };

    const handleSaveLogContent = () => {
        if (!localItem || !editingContentPos || !editingContentType) {
            resetEditingContentState();
            return;
        }

        const newItem: LibraryItemFull = JSON.parse(JSON.stringify(localItem));
        const targetRound = newItem.extra.rounds[editingContentPos.roundIndex];
        const targetLog = targetRound?.logs[editingContentPos.logIndex];
        if (!targetLog || targetLog.type !== editingContentType) {
            resetEditingContentState();
            return;
        }

        if (editingContentType === LibraryLogType.score) {
            const parsedScore = parseScoreTextToData(editingScoreText);
            if (!parsedScore) {
                message.warning('评分格式无效');
                return;
            }
            targetLog.score = parsedScore.score;
            targetLog.scorePlus = parsedScore.plus;
            targetLog.scoreSub = parsedScore.sub;
            const trimmed = editingContentText.trim();
            targetLog.comment = trimmed || undefined;

            if (editingScoreMode === 'complex') {
                targetLog.scoreMode = 'complex';
                if (editingEnableObjScore) {
                    const objData = parseRateTextToData(SCORE_OBJ_SEQ, editingObjScoreText, editingObjComment);
                    if (!objData) {
                        message.warning('客观评分格式无效');
                        return;
                    }
                    targetLog.objScore = objData;
                } else {
                    delete targetLog.objScore;
                }

                if (editingEnableSubScore) {
                    const subData = parseRateTextToData(SCORE_SUB_SEQ, editingSubScoreText, editingSubComment);
                    if (!subData) {
                        message.warning('主观评分格式无效');
                        return;
                    }
                    targetLog.subScore = subData;
                } else {
                    delete targetLog.subScore;
                }

                if (editingEnableInnovateScore) {
                    const innovateData = parseRateTextToData(SCORE_INNOVATE_SEQ, editingInnovateScoreText, editingInnovateComment);
                    if (!innovateData) {
                        message.warning('创新评分格式无效');
                        return;
                    }
                    targetLog.innovateScore = innovateData;
                } else {
                    delete targetLog.innovateScore;
                }
            } else {
                targetLog.scoreMode = 'simple';
                delete targetLog.objScore;
                delete targetLog.subScore;
                delete targetLog.innovateScore;
            }
            // 已废弃字段：仅保底读取，不再持久化维护。
            delete newItem.extra.scoreMode;
            delete newItem.extra.objScore;
            delete newItem.extra.subScore;
            delete newItem.extra.innovateScore;
            delete newItem.extra.mainScore;
            delete newItem.extra.comment;
        } else if (editingContentType === LibraryLogType.note) {
            targetLog.comment = editingContentText;
        }

        if (isUpdatedAtDrivenLogType(targetLog.type)) {
            syncLibraryUpdatedAtFromLatestLog(newItem.extra);
        }
        setLocalItem(newItem);
        onSave(newItem);

        resetEditingContentState();
        message.success('内容已更新');
    };

    const handleSaveLogTime = () => {
        if (!localItem || !editingLogPos || !editingLogTime) {
            setShowEditLogTime(false);
            setEditingLogPos(null);
            setEditingLogTime('');
            return;
        }

        const newItem: LibraryItemFull = JSON.parse(JSON.stringify(localItem));
        const targetRound = newItem.extra.rounds[editingLogPos.roundIndex];
        const targetLog = targetRound?.logs[editingLogPos.logIndex];
        if (!targetLog) {
            setShowEditLogTime(false);
            setEditingLogPos(null);
            setEditingLogTime('');
            return;
        }

        targetLog.time = editingLogTime;
        if (isUpdatedAtDrivenLogType(targetLog.type)) {
            syncLibraryUpdatedAtFromLatestLog(newItem.extra);
        }

        setLocalItem(newItem);
        onSave(newItem);
        setShowEditLogTime(false);
        setEditingLogPos(null);
        setEditingLogTime('');
    };

    const handleDeleteLog = (roundIndex: number, logIndex: number) => {
        if (!localItem) return;

        const newItem: LibraryItemFull = JSON.parse(JSON.stringify(localItem));
        const targetRound = newItem.extra.rounds[roundIndex];
        if (!targetRound || !targetRound.logs[logIndex]) {
            return;
        }

        const removedLogType = targetRound.logs[logIndex].type;
        targetRound.logs.splice(logIndex, 1);
        normalizeMainScoreSelection(newItem.extra);
        if (isUpdatedAtDrivenLogType(removedLogType)) {
            syncLibraryUpdatedAtFromLatestLog(newItem.extra);
        }

        setLocalItem(newItem);
        onSave(newItem);
        message.success('日志已删除');
    };

    const handleSetTimelineCutoff = () => {
        if (!localItem) return;
        const newExtra = addTimelineCutoffLog({...localItem.extra});
        const newItem = {...localItem, extra: newExtra};
        setLocalItem(newItem);
        onSave(newItem);
        message.success('已设置时间线断点（此前历史不计入总时间线）');
    };

    // 渲染状态快捷按钮
    const renderStatusButtons = () => {
        if (!localItem) return null;
        const currentStatus = getCurrentStatus(localItem.extra);

        // helper for deciding whether a status button should be disabled
        const isStatusButtonDisabled = (btnStatus: LibraryItemStatus): boolean => {
            if (btnStatus === currentStatus) {
                return !canUpdateReasonOnSameStatus(btnStatus);
            }
            return false;
        };

        const buttons = [
            {status: LibraryItemStatus.TODO, icon: <ClockCircleOutlined/>, label: '等待'},
            {status: LibraryItemStatus.DOING, icon: <PlayCircleOutlined/>, label: '开始'},
            {status: LibraryItemStatus.WAIT, icon: <PauseOutlined/>, label: '搁置'},
            {status: LibraryItemStatus.GIVE_UP, icon: <StopOutlined/>, label: '放弃'},
            {status: LibraryItemStatus.DONE, icon: <CheckOutlined/>, label: '完成'},
            {status: LibraryItemStatus.ARCHIVED, icon: <StopOutlined/>, label: '归档'},
        ];
        
        return (
            <Space wrap>
                {buttons.map(btn => {
                    const disabled = isStatusButtonDisabled(btn.status);
                    return (
                        <Button
                            key={btn.status}
                            disabled={disabled}
                            type={currentStatus === btn.status ? 'primary' : 'default'}
                            icon={btn.icon}
                            onClick={() => {
                                if (btn.status === LibraryItemStatus.WAIT || btn.status === LibraryItemStatus.TODO) {
                                    openStatusReason(btn.status);
                                    return;
                                }
                                handleStatusChange(btn.status);
                            }}
                            size="small"
                        >
                            {btn.label}
                        </Button>
                    );
                })}
                <Button
                    icon={<PlusOutlined/>}
                    onClick={() => setShowNewRound(true)}
                    size="small"
                >
                    新周目
                </Button>
            </Space>
        );
    };

    // 渲染日志项
    const renderLogItem = (log: LibraryLogEntry, roundIndex: number, logIndex: number) => {
        const isMainScore = localItem?.extra.mainScoreRoundIndex === roundIndex &&
            localItem?.extra.mainScoreLogIndex === logIndex;
        
        let content: React.ReactNode = null;
        let color = 'gray';
        
        switch (log.type) {
            case LibraryLogType.changeStatus:
                color = log.status !== undefined ? LibraryStatusColors[log.status] : 'gray';
                content = (
                    <Space direction="vertical" size={0}>
                        <Text>{getLogTypeText(log.type, log.status)}</Text>
                        {log.comment && <Text type="secondary" style={{fontSize: 12}}>{log.comment}</Text>}
                    </Space>
                );
                break;
            case LibraryLogType.timelineCutoff:
                color = '#8c8c8c';
                content = (
                    <Space direction="vertical" size={0}>
                        <Text strong>时间线断点</Text>
                        <Text type="secondary" style={{fontSize: 12}}>{log.comment || '此前历史不计入总时间线'}</Text>
                    </Space>
                );
                break;
            case LibraryLogType.addToLibrary:
                color = '#722ed1';
                content = (
                    <Space direction="vertical" size={0}>
                        <Text strong>添加到库</Text>
                    </Space>
                );
                break;
            case LibraryLogType.score:
                color = '#faad14';
                const isComplexScore = localItem ? getComplexScoreSnapshot(localItem.extra, log).mode === 'complex' : false;
                const scoreStarColor = getScoreStarColor(log.score || 0);
                const scoreContent = (
                    <Space>
                        <StarFilled style={{color: scoreStarColor}}/>
                        <Text strong>
                            {getScoreText(log.score || 0, log.scorePlus, log.scoreSub)}
                        </Text>
                        <Text type="secondary">({getScoreDisplay(log.score || 0, log.scorePlus, log.scoreSub)})</Text>
                        {isMainScore && <Tag color="gold">主评分</Tag>}
                        {!isMainScore && log.type === LibraryLogType.score && (
                            <Tooltip title="设为主评分">
                                <Button
                                    type="text"
                                    size="small"
                                    icon={<StarOutlined/>}
                                    onClick={() => handleSetMainScore(roundIndex, logIndex)}
                                />
                            </Tooltip>
                        )}
                    </Space>
                );
                content = (
                    <Space direction="vertical" size={0}>
                        {isComplexScore ? (
                            <Popover
                                placement="topLeft"
                                trigger="click"
                                content={<LibraryScorePopover extra={localItem!.extra} mainScoreOverride={log} />}
                            >
                                {scoreContent}
                            </Popover>
                        ) : scoreContent}
                        {log.comment && <Text type="secondary" style={{fontSize: 12}}>{log.comment}</Text>}
                    </Space>
                );
                break;
            case LibraryLogType.note:
                color = '#1890ff';
                const noteText = (log.comment || '').trim();
                content = (
                    <Space direction="vertical" size={0} style={{width: '100%'}}>
                        <Text type="secondary" style={{fontSize: 12}}>备注</Text>
                        <div
                            style={{
                                margin: 0,
                                maxWidth: '100%',
                                display: '-webkit-box',
                                WebkitLineClamp: '2',
                                WebkitBoxOrient: 'vertical',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                wordBreak: 'break-word',
                                overflowWrap: 'anywhere',
                                cursor: noteText ? 'pointer' : 'default',
                            }}
                            onClick={() => {
                                if (!noteText) {
                                    return;
                                }
                                setLogNotePreviewText(noteText);
                                setShowLogNotePreview(true);
                            }}
                            title={noteText ? '点击查看完整备注' : undefined}
                        >
                            {noteText || '-'}
                        </div>
                    </Space>
                );
                break;
        }
        
        return (
            <Timeline.Item key={`${roundIndex}-${logIndex}`} color={color}>
                <Flex justify="space-between" align="flex-start">
                    <div style={{flex: 1, minWidth: 0}}>
                        {content}
                    </div>
                    <Space size={2}>
                        {(log.type === LibraryLogType.score || log.type === LibraryLogType.note) ? (
                            <Button
                                type="text"
                                size="small"
                                icon={<EditOutlined/>}
                                onClick={() => openLogContentEditor(roundIndex, logIndex, log)}
                            />
                        ) : null}
                        <Popconfirm
                            title="删除该日志？"
                            description="删除后不可恢复"
                            onConfirm={() => handleDeleteLog(roundIndex, logIndex)}
                            okText="删除"
                            cancelText="取消"
                            okButtonProps={{danger: true}}
                        >
                            <Button
                                type="text"
                                size="small"
                                danger
                                icon={<DeleteOutlined/>}
                            />
                        </Popconfirm>
                        <Button
                            type="text"
                            size="small"
                            icon={<ClockCircleOutlined/>}
                            onClick={() => openLogTimeEditor(roundIndex, logIndex, log.time)}
                        />
                        <Text type="secondary" style={{fontSize: 11, whiteSpace: 'nowrap'}}>
                            {formatDateTime(log.time)}
                        </Text>
                    </Space>
                </Flex>
            </Timeline.Item>
        );
    };

    // 渲染周目
    const renderRound = (round: LibraryRound, roundIndex: number) => {
        const isCurrentRound = roundIndex === localItem?.extra.currentRound;
        
        return (
            <Collapse.Panel
                key={roundIndex}
                header={
                    <Space>
                        <Text strong>{round.name}</Text>
                        <Button
                            type="text"
                            size="small"
                            icon={<EditOutlined/>}
                            onClick={(event) => {
                                event.stopPropagation();
                                openRenameRound(roundIndex);
                            }}
                        >
                            重命名
                        </Button>
                        {isCurrentRound && <Tag color="blue">当前</Tag>}
                        <Text type="secondary" style={{fontSize: 12}}>
                            {formatDateTime(round.startTime)}
                            {round.endTime && ` - ${formatDateTime(round.endTime)}`}
                        </Text>
                    </Space>
                }
            >
                <Timeline>
                    {getSortedLogEntries(round).map(({log, index}) => renderLogItem(log, roundIndex, index))}
                </Timeline>
                
                {isCurrentRound && (
                    <Flex style={{marginTop: 8}} gap={8} wrap="wrap">
                        <Button
                            size="small"
                            icon={<StarOutlined/>}
                            onClick={() => setShowAddScore(true)}
                            style={isMobile ? {flex: '1 1 calc(50% - 4px)'} : undefined}
                        >
                            添加评分
                        </Button>
                        <Button
                            size="small"
                            icon={<EditOutlined/>}
                            onClick={() => setShowAddNote(true)}
                            style={isMobile ? {flex: '1 1 calc(50% - 4px)'} : undefined}
                        >
                            添加备注
                        </Button>
                        <Button
                            size="small"
                            onClick={handleSetTimelineCutoff}
                            style={isMobile ? {flex: '1 1 100%'} : undefined}
                        >
                            不加入时间线（断点）
                        </Button>
                    </Flex>
                )}
            </Collapse.Panel>
        );
    };

    // 主评分显示
    const mainScoreEntry = localItem ? getMainScore(localItem.extra) : null;
    const mainScoreSnapshot = localItem ? getComplexScoreSnapshot(localItem.extra, mainScoreEntry) : {mode: 'simple' as const};

    if (!localItem) return null;
    const displayTitle = editMode ? (editingTitle.trim() || localItem.title) : localItem.title;
    const originalCoverUrl = localItem.extra.pictureAddress?.trim() || '';
    const detailCoverUrl = getLibraryDetailCoverUrl(localItem.extra);
    const previewCoverUrl = getLibraryPreviewCoverUrl(localItem.extra);
    const realCoverUrl = detailCoverUrl || originalCoverUrl || previewCoverUrl;
    const coverPalette = getLibraryCoverPaletteByTitle(displayTitle || '未命名');
    const placeholderFontSize = Math.round(detailCoverWidth * LIBRARY_PLACEHOLDER_TEXT_WIDTH_RATIO);
    const placeholderPadding = Math.round(detailCoverWidth * LIBRARY_PLACEHOLDER_PADDING_WIDTH_RATIO);
    const displayStatus = getDisplayStatusInfo(localItem.extra);
    const actionButtonSize = isMobile ? 'small' : 'middle';
    const useMobileSplitLayout = isMobile && !editMode;
    const remarkText = (localItem.extra.remark || '').trim();
    const showRemarkClamp = remarkText.length > 0;
    const drawerActions = (
        <Space size={8} wrap>
            {onToggleFavorite ? (
                <Button
                    size={actionButtonSize}
                    icon={localItem.extra.isFavorite ? <StarFilled/> : <StarOutlined/>}
                    onClick={() => onToggleFavorite(localItem)}
                >
                    {localItem.extra.isFavorite ? '已收藏' : '收藏'}
                </Button>
            ) : null}
            <Button
                size={actionButtonSize}
                icon={<ReloadOutlined/>}
                onClick={handleRefreshUpdatedAt}
            >
                刷新
            </Button>
            <Button
                size={actionButtonSize}
                icon={<ShareAltOutlined/>}
                onClick={() => setShowShare(true)}
            >
                分享
            </Button>
            <Button
                size={actionButtonSize}
                icon={<EyeOutlined/>}
                onClick={() => setShowRawCoverModal(true)}
            >
                三图原图
            </Button>
            {editMode ? (
                <>
                    <Button size={actionButtonSize} onClick={() => setEditMode(false)}>取消</Button>
                    <Button size={actionButtonSize} type="primary" onClick={handleSaveBasicInfo}>保存</Button>
                </>
            ) : (
                <Button size={actionButtonSize} icon={<EditOutlined/>} onClick={() => setEditMode(true)}>编辑</Button>
            )}
        </Space>
    );

    return (
        <Drawer
            className="library-detail-drawer"
            title={
                <span className="library-detail-drawer-title" title={displayTitle || '未命名'}>
                    {displayTitle || '未命名'}
                </span>
            }
            placement="right"
            width={isMobile ? '100%' : 600}
            styles={isMobile ? {header: {paddingInline: 12}, body: {paddingInline: 12}} : undefined}
            destroyOnClose
            afterOpenChange={(open) => {
                if (!open) {
                    return;
                }
                const measure = () => {
                    const width = detailCoverRef.current?.clientWidth || 0;
                    if (width > 0) {
                        setDetailCoverWidth(width);
                    }
                };
                window.requestAnimationFrame(measure);
                window.setTimeout(measure, 80);
                window.setTimeout(measure, 180);
            }}
            onClose={onClose}
            open={visible}
            extra={isMobile ? undefined : drawerActions}
            footer={
                onDelete && (
                    <Flex justify="flex-start">
                        <Popconfirm
                            title="确认删除"
                            description="删除后无法恢复，确定要删除吗？"
                            onConfirm={() => localItem && onDelete(localItem)}
                            okText="删除"
                            cancelText="取消"
                            okButtonProps={{danger: true}}
                        >
                            <Button danger>删除此条目</Button>
                        </Popconfirm>
                    </Flex>
                )
            }
        >
            {isMobile ? (
                <div style={{marginBottom: 12, overflowX: 'auto'}}>
                    <Space size={8} wrap={false} style={{paddingBottom: 2}}>
                        {drawerActions}
                    </Space>
                </div>
            ) : null}
            {/* 封面和基本信息 */}
            <Row gutter={16} wrap={!useMobileSplitLayout}>
                <Col span={useMobileSplitLayout ? 10 : (isMobile ? 24 : 8)}>
                    <div
                        ref={detailCoverRef}
                        style={{
                            position: 'relative',
                            width: useMobileSplitLayout ? '100%' : (isMobile ? 'min(42vw, 170px)' : '100%'),
                            margin: isMobile ? '0 auto' : undefined,
                            aspectRatio: '2 / 3',
                            borderRadius: 8,
                            overflow: 'hidden',
                            background: '#f5f5f5',
                            border: '1px solid #d9d9d9',
                        }}
                    >
                        {realCoverUrl ? (
                            <img
                                src={realCoverUrl}
                                alt={displayTitle}
                                style={{
                                    position: 'absolute',
                                    inset: 0,
                                    width: '100%',
                                    height: '100%',
                                    objectFit: 'cover',
                                    objectPosition: 'center',
                                }}
                                onError={(e) => {
                                    (e.target as HTMLImageElement).style.display = 'none';
                                    const parent = (e.target as HTMLImageElement).parentElement;
                                    if (parent) {
                                        const placeholder = parent.querySelector('.library-detail-cover-placeholder') as HTMLElement;
                                        if (placeholder) {
                                            placeholder.style.display = 'flex';
                                        }
                                    }
                                }}
                            />
                        ) : null}
                        <div
                            className="library-detail-cover-placeholder"
                            style={{
                                position: 'absolute',
                                inset: 0,
                                display: realCoverUrl ? 'none' : 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                padding: placeholderPadding,
                                boxSizing: 'border-box',
                                textAlign: 'center',
                                wordBreak: 'normal',
                                overflowWrap: 'anywhere',
                                whiteSpace: 'normal',
                                overflow: 'hidden',
                                background: `linear-gradient(140deg, ${coverPalette.bg} 0%, #ffffff 100%)`,
                                color: coverPalette.text,
                                fontWeight: 600,
                                fontSize: placeholderFontSize,
                                lineHeight: 1.35,
                            }}
                        >
                            {displayTitle || '未命名'}
                        </div>
                    </div>
                </Col>
                <Col span={useMobileSplitLayout ? 14 : (isMobile ? 24 : 16)} style={{marginTop: useMobileSplitLayout ? 0 : (isMobile ? 12 : 0)}}>
                    {editMode ? (
                        <Form form={form} layout="vertical" size="small">
                            <Form.Item name="title" label="名称" rules={[{required: true}]}>
                                <Input/>
                            </Form.Item>
                            <Form.Item name="author" label="作者/制作方">
                                <Input/>
                            </Form.Item>
                            <Form.Item name="year" label="年份">
                                <InputNumber min={1900} max={3000} style={{width: '100%'}} placeholder="例如：2024"/>
                            </Form.Item>
                            <Form.Item name="remark" label="备注">
                                <TextArea rows={2} placeholder="作品备注（如国家、版本、平台等）"/>
                            </Form.Item>
                            <Form.Item name="category" label="分类">
                                <Select
                                    showSearch
                                    allowClear
                                    placeholder="选择或输入新分类"
                                    options={categories.map(cat => ({value: cat, label: cat}))}
                                    mode={undefined}
                                    filterOption={(input, option) =>
                                        (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
                                    }
                                />
                            </Form.Item>
                            <Form.Item label="封面">
                                <Space>
                                    <Button
                                        icon={<UploadOutlined/>}
                                        loading={coverUploading}
                                        onClick={() => checkCoverClipboard(false)}
                                    >
                                        上传（先读剪贴板）
                                    </Button>
                                    <Button
                                        danger
                                        icon={<DeleteOutlined/>}
                                        disabled={!(localItem.extra.pictureAddress?.trim() || localItem.extra.pictureAddressDetail?.trim() || localItem.extra.picturePreview?.trim() || localItem.extra.pictureAddressPreview?.trim())}
                                        onClick={() => {
                                            const nextItem: LibraryItemFull = {
                                                ...localItem,
                                                extra: clearCoverFields(localItem.extra),
                                            };
                                            setLocalItem(nextItem);
                                            message.success('已删除封面，恢复默认占位图');
                                        }}
                                    >
                                        删除封面
                                    </Button>
                                </Space>
                                <Space style={{marginTop: 8}}>
                                    <Text type="secondary">检测到剪贴板图片会先询问使用，取消后可自行选择本地图片</Text>
                                </Space>
                            </Form.Item>
                        </Form>
                    ) : (
                        <Descriptions column={1} size="small">
                            <Descriptions.Item label="状态">
                                <Tag color={displayStatus.color}>
                                    {displayStatus.name}
                                </Tag>
                            </Descriptions.Item>
                            <Descriptions.Item label="作者">{localItem.extra.author || '-'}</Descriptions.Item>
                            <Descriptions.Item label="分类">{localItem.extra.category || '-'}</Descriptions.Item>
                            <Descriptions.Item label="添加时间">{formatDateTime(localItem.extra.createdAt)}</Descriptions.Item>
                            <Descriptions.Item label="年份">{localItem.extra.year || '-'}</Descriptions.Item>
                            <Descriptions.Item label="备注">
                                {showRemarkClamp ? (
                                    <div
                                        style={{
                                            marginBottom: 0,
                                            maxWidth: '100%',
                                            display: '-webkit-box',
                                            WebkitLineClamp: '1',
                                            WebkitBoxOrient: 'vertical',
                                            overflow: 'hidden',
                                            textOverflow: 'ellipsis',
                                            wordBreak: 'break-word',
                                            overflowWrap: 'anywhere',
                                            cursor: 'pointer',
                                        }}
                                        onClick={() => setShowRemarkPreview(true)}
                                        title="点击查看完整备注"
                                    >
                                        {remarkText}
                                    </div>
                                ) : (remarkText || '-')}
                            </Descriptions.Item>
                            {getCurrentStatus(localItem.extra) === LibraryItemStatus.TODO && (
                                <Descriptions.Item label="等待原因">{getCurrentTodoReason(localItem.extra) || '-'}</Descriptions.Item>
                            )}
                            {getCurrentStatus(localItem.extra) === LibraryItemStatus.WAIT && (
                                <Descriptions.Item label="搁置原因">{getLatestWaitReason(localItem.extra) || '-'}</Descriptions.Item>
                            )}
                            <Descriptions.Item label="主评分">
                                {mainScoreEntry ? (
                                    <div style={{display: 'inline-flex', alignItems: 'center'}}>
                                        <TextRate
                                            sequence={SCORE_SEQ}
                                            editable={false}
                                            initialValue={getScoreText(mainScoreEntry.score || 0, mainScoreEntry.scorePlus, mainScoreEntry.scoreSub)}
                                            fontSize={20}
                                            fontSize2={13}
                                        />
                                    </div>
                                ) : (
                                    <Text type="secondary">暂无评分</Text>
                                )}
                            </Descriptions.Item>
                        </Descriptions>
                    )}
                </Col>
            </Row>
            
            <Divider/>
            
            {/* 状态操作 */}
            <div style={{marginBottom: 16}}>
                <Text strong>操作</Text>
                <div style={{marginTop: 8}}>
                    {renderStatusButtons()}
                </div>
            </div>
            
            <Divider/>
            
            {/* 周目和日志 */}
            <div>
                <Flex justify="space-between" align="center" style={{marginBottom: 8}}>
                    <Text strong>体验记录</Text>
                    <Space size={8} wrap>
                        <Text type="secondary">{localItem.extra.rounds.length} 个周目</Text>
                        <Space size={4}>
                            <Text type="secondary" style={{fontSize: 12}}>隐藏备注</Text>
                            <Switch
                                size="small"
                                checked={detailLogFilter === 'withoutNote'}
                                onChange={(checked) => setDetailLogFilter(checked ? 'withoutNote' : 'all')}
                            />
                        </Space>
                    </Space>
                </Flex>
                
                <Collapse
                    defaultActiveKey={[localItem.extra.currentRound]}
                    accordion
                >
                    {localItem.extra.rounds.map((round, index) => renderRound(round, index))}
                </Collapse>
            </div>
            
            {/* 新周目弹窗 */}
            <Modal
                title="开始新周目"
                open={showNewRound}
                onOk={handleStartNewRound}
                onCancel={() => {
                    setShowNewRound(false);
                    setNewRoundName('');
                }}
            >
                <Input
                    placeholder="请输入周目名称，如：二周目、DLC1、重温等"
                    value={newRoundName}
                    onChange={(e) => setNewRoundName(e.target.value)}
                />
            </Modal>

            <Modal
                title="重命名周目"
                open={showRenameRound}
                onOk={handleRenameRound}
                onCancel={() => {
                    setShowRenameRound(false);
                    setRenameRoundIndex(null);
                    setRenameRoundName('');
                }}
            >
                <Input
                    placeholder="请输入新的周目名称"
                    value={renameRoundName}
                    onChange={(e) => setRenameRoundName(e.target.value)}
                />
            </Modal>
            
            {/* 添加评分弹窗 */}
            <AddScoreModal
                visible={showAddScore}
                onOk={handleAddScore}
                onCancel={() => setShowAddScore(false)}
                initialMode={mainScoreSnapshot.mode}
            />
            
            {/* 添加备注弹窗 */}
            <Modal
                title="添加备注"
                open={showAddNote}
                onOk={handleAddNote}
                onCancel={() => {
                    setShowAddNote(false);
                    setNoteContent('');
                }}
            >
                <TextArea
                    rows={4}
                    placeholder="请输入备注内容..."
                    value={noteContent}
                    onChange={(e) => setNoteContent(e.target.value)}
                />
            </Modal>

            <Modal
                title={pendingStatus === LibraryItemStatus.TODO ? '等待原因（等待二级状态）' : '搁置原因'}
                open={showStatusReason}
                onOk={handleSetStatusWithReason}
                onCancel={() => {
                    setShowStatusReason(false);
                    setStatusReasonInput('');
                    setPendingStatus(null);
                }}
            >
                {pendingStatus === LibraryItemStatus.TODO ? (
                    <AutoComplete
                        style={{width: '100%'}}
                        value={statusReasonInput}
                        options={todoReasonOptions.map(reason => ({value: reason}))}
                        onChange={setStatusReasonInput}
                        filterOption={(inputValue, option) =>
                            option?.value.toLowerCase().includes(inputValue.toLowerCase()) || false
                        }
                    >
                        <Input placeholder="请输入或选择等待原因（例如：等字幕、等朋友、片源问题）" />
                    </AutoComplete>
                ) : (
                    <Input
                        value={statusReasonInput}
                        onChange={(e) => setStatusReasonInput(e.target.value)}
                        placeholder={LIBRARY_WAIT_EXPIRED_RULE_TEXT}
                    />
                )}
            </Modal>

            <Modal
                title="编辑历史时间"
                open={showEditLogTime}
                onOk={handleSaveLogTime}
                onCancel={() => {
                    setShowEditLogTime(false);
                    setEditingLogPos(null);
                    setEditingLogTime('');
                }}
            >
                <DatePicker
                    showTime
                    value={editingLogTime ? dayjs(editingLogTime) : null}
                    onChange={(value) => setEditingLogTime(value ? value.toISOString() : '')}
                    style={{width: '100%'}}
                />
            </Modal>

            <Modal
                title={editingContentType === LibraryLogType.score ? '编辑评分内容' : '编辑备注内容'}
                open={showEditLogContent}
                onOk={handleSaveLogContent}
                onCancel={resetEditingContentState}
            >
                {editingContentType === LibraryLogType.score ? (
                    <Space direction="vertical" style={{width: '100%'}}>
                        <div>
                            <Text>{editingScoreMode === 'complex' ? '主评分' : '评分'}</Text>
                            <div style={{marginTop: 8}}>
                                <TextRate
                                    sequence={SCORE_SEQ}
                                    editable={true}
                                    initialValue={editingScoreText}
                                    onChange={setEditingScoreText}
                                    fontSize={24}
                                    fontSize2={16}
                                />
                            </div>
                        </div>
                        {editingScoreMode === 'complex' ? (
                            <>
                                <div>
                                    <Flex justify="space-between" align="center">
                                        <Text>客观好坏：</Text>
                                        <Switch
                                            size="small"
                                            checked={editingEnableObjScore}
                                            onChange={setEditingEnableObjScore}
                                            checkedChildren="启用"
                                            unCheckedChildren="关闭"
                                        />
                                    </Flex>
                                    {editingEnableObjScore ? (
                                        <>
                                            <div style={{marginTop: 8}}>
                                                <TextRate
                                                    sequence={SCORE_OBJ_SEQ}
                                                    editable={true}
                                                    initialValue={editingObjScoreText}
                                                    onChange={setEditingObjScoreText}
                                                    fontSize={20}
                                                    fontSize2={14}
                                                />
                                            </div>
                                            <TextArea
                                                rows={2}
                                                placeholder="客观维度评价（可选）"
                                                value={editingObjComment}
                                                onChange={(e) => setEditingObjComment(e.target.value)}
                                                style={{marginTop: 8}}
                                            />
                                        </>
                                    ) : null}
                                </div>

                                <div>
                                    <Flex justify="space-between" align="center">
                                        <Text>主观感受：</Text>
                                        <Switch
                                            size="small"
                                            checked={editingEnableSubScore}
                                            onChange={setEditingEnableSubScore}
                                            checkedChildren="启用"
                                            unCheckedChildren="关闭"
                                        />
                                    </Flex>
                                    {editingEnableSubScore ? (
                                        <>
                                            <div style={{marginTop: 8}}>
                                                <TextRate
                                                    sequence={SCORE_SUB_SEQ}
                                                    editable={true}
                                                    initialValue={editingSubScoreText}
                                                    onChange={setEditingSubScoreText}
                                                    fontSize={20}
                                                    fontSize2={14}
                                                />
                                            </div>
                                            <TextArea
                                                rows={2}
                                                placeholder="主观维度评价（可选）"
                                                value={editingSubComment}
                                                onChange={(e) => setEditingSubComment(e.target.value)}
                                                style={{marginTop: 8}}
                                            />
                                        </>
                                    ) : null}
                                </div>

                                <div>
                                    <Flex justify="space-between" align="center">
                                        <Text>艺术创新：</Text>
                                        <Switch
                                            size="small"
                                            checked={editingEnableInnovateScore}
                                            onChange={setEditingEnableInnovateScore}
                                            checkedChildren="启用"
                                            unCheckedChildren="关闭"
                                        />
                                    </Flex>
                                    {editingEnableInnovateScore ? (
                                        <>
                                            <div style={{marginTop: 8}}>
                                                <TextRate
                                                    sequence={SCORE_INNOVATE_SEQ}
                                                    editable={true}
                                                    initialValue={editingInnovateScoreText}
                                                    onChange={setEditingInnovateScoreText}
                                                    fontSize={20}
                                                    fontSize2={14}
                                                />
                                            </div>
                                            <TextArea
                                                rows={2}
                                                placeholder="创新维度评价（可选）"
                                                value={editingInnovateComment}
                                                onChange={(e) => setEditingInnovateComment(e.target.value)}
                                                style={{marginTop: 8}}
                                            />
                                        </>
                                    ) : null}
                                </div>
                            </>
                        ) : null}
                        <div>
                            <Text>{editingScoreMode === 'complex' ? '主评分评价（可选）' : '评价内容（可选）'}</Text>
                            <TextArea
                                rows={3}
                                value={editingContentText}
                                onChange={(e) => setEditingContentText(e.target.value)}
                                placeholder="请输入评分说明"
                                style={{marginTop: 8}}
                            />
                        </div>
                    </Space>
                ) : (
                    <TextArea
                        rows={4}
                        value={editingContentText}
                        onChange={(e) => setEditingContentText(e.target.value)}
                        placeholder="请输入备注内容"
                    />
                )}
            </Modal>

            <Modal
                title="完整备注"
                open={showRemarkPreview}
                onCancel={() => setShowRemarkPreview(false)}
                footer={[
                    <Button key="close" onClick={() => setShowRemarkPreview(false)}>
                        关闭
                    </Button>,
                ]}
                width={isMobile ? 'calc(100vw - 24px)' : 520}
            >
                <Paragraph style={{marginBottom: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word'}}>
                    {remarkText || '-'}
                </Paragraph>
            </Modal>

            <Modal
                title="记录备注"
                open={showLogNotePreview}
                onCancel={() => setShowLogNotePreview(false)}
                footer={[
                    <Button key="close" onClick={() => setShowLogNotePreview(false)}>
                        关闭
                    </Button>,
                ]}
                width={isMobile ? 'calc(100vw - 24px)' : 520}
            >
                <Paragraph style={{marginBottom: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word'}}>
                    {logNotePreviewText || '-'}
                </Paragraph>
            </Modal>

            <Modal
                title="三图原图"
                open={showRawCoverModal}
                onCancel={() => setShowRawCoverModal(false)}
                footer={[
                    <Button key="close" onClick={() => setShowRawCoverModal(false)}>
                        关闭
                    </Button>,
                ]}
                width={isMobile ? 'calc(100vw - 24px)' : 560}
            >
                {[
                    {label: 'pictureAddress', url: originalCoverUrl},
                    {label: 'pictureAddressDetail', url: detailCoverUrl},
                    {label: 'picturePreview', url: previewCoverUrl},
                ].map((entry) => (
                    <div key={entry.label} style={{marginBottom: 14}}>
                        <Text strong>{entry.label}</Text>
                        <div style={{marginTop: 6, marginBottom: 6, wordBreak: 'break-all'}}>
                            {entry.url ? (
                                <a href={entry.url} target="_blank" rel="noreferrer">{entry.url}</a>
                            ) : (
                                <Text type="secondary">无</Text>
                            )}
                        </div>
                        {entry.url ? (
                            <img
                                src={entry.url}
                                alt={entry.label}
                                style={{width: 120, aspectRatio: '2 / 3', objectFit: 'cover', objectPosition: 'center', borderRadius: 6, border: '1px solid #f0f0f0'}}
                            />
                        ) : null}
                    </div>
                ))}
            </Modal>
            
            {/* 分享弹窗 */}
            <Modal
                title="分享预览"
                open={showShare}
                onCancel={() => {
                    setShowShare(false);
                }}
                footer={
                    <Space>
                        <Button onClick={() => {
                            setShowShare(false);
                        }}>
                            关闭
                        </Button>
                        <Button
                            icon={<DownloadOutlined/>}
                            type="primary"
                            loading={shareExporting}
                            onClick={handleExportShareImage}
                        >
                            导出图片
                        </Button>
                    </Space>
                }
                styles={{
                    footer: {
                        borderTop: '1px solid #f0f0f0',
                        paddingTop: 12,
                        marginTop: 0,
                    },
                }}
                width={isMobile ? '100%' : 650}
                style={{top: 20}}
            >
                <div style={{maxHeight: '70vh', overflowY: 'auto', background: '#fff', paddingBottom: 8}}>
                    <div ref={shareCardRef}>
                        <LibraryShareCard
                            title={localItem.title}
                            extra={localItem.extra}
                            editable={false}
                        />
                    </div>
                </div>
            </Modal>
        </Drawer>
    );
}

// 添加评分弹窗组件
interface AddScoreModalProps {
    visible: boolean;
    onOk: (payload: AddScorePayload) => void;
    onCancel: () => void;
    initialMode?: 'simple' | 'complex';
}

interface AddScorePayload {
    mode: 'simple' | 'complex';
    mainScore: LibraryScoreData;
    objScore?: LibraryScoreData;
    subScore?: LibraryScoreData;
    innovateScore?: LibraryScoreData;
    objComment?: string;
    subComment?: string;
    innovateComment?: string;
    comment?: string;
}

function AddScoreModal({visible, onOk, onCancel, initialMode = 'simple'}: AddScoreModalProps) {
    const [mode, setMode] = useState<'simple' | 'complex'>(initialMode);
    const [mainScoreText, setMainScoreText] = useState('合');
    const [enableObjScore, setEnableObjScore] = useState(true);
    const [enableSubScore, setEnableSubScore] = useState(true);
    const [enableInnovateScore, setEnableInnovateScore] = useState(true);
    const [objScoreText, setObjScoreText] = useState('普通');
    const [subScoreText, setSubScoreText] = useState('消磨');
    const [innovateScoreText, setInnovateScoreText] = useState('沿袭');
    const [objComment, setObjComment] = useState('');
    const [subComment, setSubComment] = useState('');
    const [innovateComment, setInnovateComment] = useState('');
    const [comment, setComment] = useState('');

    useEffect(() => {
        if (visible) {
            setMode(initialMode);
        }
    }, [initialMode, visible]);

    const parseRate = (seq: string[], text: string, scoreComment: string): LibraryScoreData => {
        let sign: '' | '+' | '-' = '';
        if (text.endsWith('+')) sign = '+';
        if (text.endsWith('-')) sign = '-';
        const label = sign ? text.slice(0, -1) : text;
        const idx = seq.findIndex((s) => s === label);
        return {
            value: idx >= 0 ? idx + 1 : 3,
            plus: sign === '+',
            sub: sign === '-',
            comment: scoreComment.trim(),
        };
    };

    const resetForm = () => {
        setMainScoreText('合');
        setEnableObjScore(true);
        setEnableSubScore(true);
        setEnableInnovateScore(true);
        setObjScoreText('普通');
        setSubScoreText('消磨');
        setInnovateScoreText('沿袭');
        setObjComment('');
        setSubComment('');
        setInnovateComment('');
        setComment('');
    };

    const handleOk = () => {
        const payload: AddScorePayload = {
            mode,
            mainScore: parseRate(["零", "差", "合", "优", "满"], mainScoreText, ''),
            comment,
        };

        if (mode === 'complex') {
            if (enableObjScore) {
                payload.objScore = parseRate(["垃圾", "低劣", "普通", "优秀", "传奇"], objScoreText, objComment);
                payload.objComment = objComment;
            }
            if (enableSubScore) {
                payload.subScore = parseRate(["折磨", "负面", "消磨", "享受", "极致"], subScoreText, subComment);
                payload.subComment = subComment;
            }
            if (enableInnovateScore) {
                payload.innovateScore = parseRate(["抄袭", "模仿", "沿袭", "创新", "革命"], innovateScoreText, innovateComment);
                payload.innovateComment = innovateComment;
            }
        }

        onOk(payload);
        resetForm();
    };

    const handleCancel = () => {
        onCancel();
        resetForm();
    };

    return (
        <Modal
            title="添加评分"
            open={visible}
            onOk={handleOk}
            onCancel={handleCancel}
        >
            <Space direction="vertical" style={{width: '100%'}}>
                <Radio.Group value={mode} onChange={(e) => setMode(e.target.value)}>
                    <Radio.Button value="simple">简单评分</Radio.Button>
                    <Radio.Button value="complex">复杂评分</Radio.Button>
                </Radio.Group>

                <div>
                    <Text>{mode === 'complex' ? '主评分：' : '评分：'}</Text>
                    <div style={{marginTop: 8}}>
                        <TextRate
                            sequence={["零", "差", "合", "优", "满"]}
                            editable={true}
                            initialValue={mainScoreText}
                            onChange={setMainScoreText}
                            fontSize={24}
                            fontSize2={16}
                        />
                    </div>
                </div>

                {mode === 'complex' && (
                    <>
                        <div>
                            <Flex justify="space-between" align="center">
                                <Text>客观好坏：</Text>
                                <Switch size="small" checked={enableObjScore} onChange={setEnableObjScore} checkedChildren="启用" unCheckedChildren="关闭"/>
                            </Flex>
                            {enableObjScore ? (
                                <>
                                    <div style={{marginTop: 8}}>
                                        <TextRate
                                            sequence={["垃圾", "低劣", "普通", "优秀", "传奇"]}
                                            editable={true}
                                            initialValue={objScoreText}
                                            onChange={setObjScoreText}
                                            fontSize={20}
                                            fontSize2={14}
                                        />
                                    </div>
                                    <TextArea
                                        rows={2}
                                        placeholder="客观维度评价（可选）"
                                        value={objComment}
                                        onChange={(e) => setObjComment(e.target.value)}
                                        style={{marginTop: 8}}
                                    />
                                </>
                            ) : null}
                        </div>
                        <div>
                            <Flex justify="space-between" align="center">
                                <Text>主观感受：</Text>
                                <Switch size="small" checked={enableSubScore} onChange={setEnableSubScore} checkedChildren="启用" unCheckedChildren="关闭"/>
                            </Flex>
                            {enableSubScore ? (
                                <>
                                    <div style={{marginTop: 8}}>
                                        <TextRate
                                            sequence={["折磨", "负面", "消磨", "享受", "极致"]}
                                            editable={true}
                                            initialValue={subScoreText}
                                            onChange={setSubScoreText}
                                            fontSize={20}
                                            fontSize2={14}
                                        />
                                    </div>
                                    <TextArea
                                        rows={2}
                                        placeholder="主观维度评价（可选）"
                                        value={subComment}
                                        onChange={(e) => setSubComment(e.target.value)}
                                        style={{marginTop: 8}}
                                    />
                                </>
                            ) : null}
                        </div>
                        <div>
                            <Flex justify="space-between" align="center">
                                <Text>艺术创新：</Text>
                                <Switch size="small" checked={enableInnovateScore} onChange={setEnableInnovateScore} checkedChildren="启用" unCheckedChildren="关闭"/>
                            </Flex>
                            {enableInnovateScore ? (
                                <>
                                    <div style={{marginTop: 8}}>
                                        <TextRate
                                            sequence={["抄袭", "模仿", "沿袭", "创新", "革命"]}
                                            editable={true}
                                            initialValue={innovateScoreText}
                                            onChange={setInnovateScoreText}
                                            fontSize={20}
                                            fontSize2={14}
                                        />
                                    </div>
                                    <TextArea
                                        rows={2}
                                        placeholder="创新维度评价（可选）"
                                        value={innovateComment}
                                        onChange={(e) => setInnovateComment(e.target.value)}
                                        style={{marginTop: 8}}
                                    />
                                </>
                            ) : null}
                        </div>
                    </>
                )}
                
                <div>
                    <Text>{mode === 'complex' ? '主评分评价（可选）：' : '评价（可选）：'}</Text>
                    <TextArea
                        rows={3}
                        placeholder="请输入评价内容..."
                        value={comment}
                        onChange={(e) => setComment(e.target.value)}
                        style={{marginTop: 8}}
                    />
                </div>
            </Space>
        </Modal>
    );
}
