import React, {useEffect, useMemo, useRef, useState} from 'react';
import {
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
    DownloadOutlined,
    EditOutlined,
    PauseOutlined,
    PictureOutlined,
    PlayCircleOutlined,
    PlusOutlined,
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
    formatDateTime,
    getDisplayStatusInfo,
    getLibraryCoverDisplayUrl,
    getLogTypeText,
    getMainScore,
    getScoreDisplay,
    getScoreStarColor,
    getScoreText,
    setMainScore,
    startNewRound,
} from './libraryUtil';
import {useIsMobile} from '../common/hooksv2';
import TextRate from '../library/TextRate';
import LibraryShareCard from './LibraryShareCard';
import LibraryScorePopover from './LibraryScorePopover';
import {useImageUpload} from '../common/useImageUpload';
import {cropImageToAspectRatio} from '../common/imageCrop';

const {Text, Paragraph} = Typography;
const {TextArea} = Input;

// 评分序列
const SCORE_SEQ = ["零", "差", "合", "优", "满"];

interface LibraryDetailProps {
    visible: boolean;
    item: LibraryItemFull | null;
    subGroupId: number;
    categories?: string[];
    onClose: () => void;
    onSave: (item: LibraryItemFull) => void;
    onDelete?: (item: LibraryItemFull) => void;
}

export default function LibraryDetail({visible, item, subGroupId, categories = [], onClose, onSave, onDelete}: LibraryDetailProps) {
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
    const [showEditLogTime, setShowEditLogTime] = useState(false);
    const [editingLogPos, setEditingLogPos] = useState<{roundIndex: number; logIndex: number} | null>(null);
    const [editingLogTime, setEditingLogTime] = useState('');
    
    // 分享弹窗
    const [showShare, setShowShare] = useState(false);
    const shareCardRef = useRef<HTMLDivElement | null>(null);
    
    // 基本信息编辑表单
    const [form] = Form.useForm();

    const {uploading: coverUploading, checkClipboard: checkCoverClipboard} = useImageUpload(
        (fileShow) => {
            setLocalItem((prev: LibraryItemFull | null) => {
                if (!prev) return prev;
                return {
                    ...prev,
                    extra: {
                        ...prev.extra,
                        pictureAddress: fileShow.publishUrl,
                    },
                };
            });
            message.success('封面已上传并裁剪为 3:4');
        },
        undefined,
        {
            beforeUpload: async (file) => {
                try {
                    return await cropImageToAspectRatio(file, 3, 4);
                } catch (error) {
                    console.error(error);
                    message.error('图片裁剪失败');
                    return null;
                }
            },
        }
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
        }
    }, [item, form]);

    // 保存基本信息
    const handleSaveBasicInfo = () => {
        form.validateFields().then((values) => {
            if (!localItem) return;
            
            const title = values.title?.trim() || '';
            const pictureAddress = localItem.extra.pictureAddress?.trim() || '';

            const newItem: LibraryItemFull = {
                ...localItem,
                title,
                extra: {
                    ...localItem.extra,
                    pictureAddress,
                    author: values.author || '',
                    year: typeof values.year === 'number' ? values.year : undefined,
                    remark: values.remark?.trim() || '',
                    category: values.category || '',
                    updatedAt: new Date().toISOString(),
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
        
        const newExtra = addStatusLog({...localItem.extra}, newStatus, comment);
        const newItem = {...localItem, extra: newExtra};
        setLocalItem(newItem);
        onSave(newItem);
    };

    const openStatusReason = (status: LibraryItemStatus) => {
        if (!localItem) return;
        setPendingStatus(status);
        if (status === LibraryItemStatus.TODO) {
            setStatusReasonInput(localItem.extra.todoReason || '');
        } else {
            setStatusReasonInput(localItem.extra.waitReason || '');
        }
        setShowStatusReason(true);
    };

    const handleSetStatusWithReason = () => {
        if (pendingStatus === null) return;
        const reason = statusReasonInput.trim();
        if (!reason) {
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
            scoreLogComment
        );

        newExtra.scoreMode = payload.mode;

        if (payload.mode === 'complex') {
            if (payload.objScore) {
                newExtra.objScore = {
                    ...payload.objScore,
                    comment: payload.objComment?.trim() || payload.objScore.comment || '',
                };
            } else {
                delete newExtra.objScore;
            }
            if (payload.subScore) {
                newExtra.subScore = {
                    ...payload.subScore,
                    comment: payload.subComment?.trim() || payload.subScore.comment || '',
                };
            } else {
                delete newExtra.subScore;
            }
            if (payload.innovateScore) {
                newExtra.innovateScore = {
                    ...payload.innovateScore,
                    comment: payload.innovateComment?.trim() || payload.innovateScore.comment || '',
                };
            } else {
                delete newExtra.innovateScore;
            }
            newExtra.mainScore = {
                ...payload.mainScore,
                comment: payload.mainScore.comment || '',
            };
            if (payload.comment?.trim()) {
                newExtra.comment = payload.comment.trim();
            } else {
                delete newExtra.comment;
            }
        } else {
            delete newExtra.objScore;
            delete newExtra.subScore;
            delete newExtra.innovateScore;
            delete newExtra.mainScore;
            delete newExtra.comment;
        }

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
        try {
            const html2canvas = (await import('html2canvas')).default;
            const canvas = await html2canvas(shareCardRef.current, {
                scale: 2,
                useCORS: true,
                backgroundColor: '#ffffff',
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
            .sort((a, b) => new Date(a.log.time).getTime() - new Date(b.log.time).getTime());
    };

    const openLogTimeEditor = (roundIndex: number, logIndex: number, time: string) => {
        setEditingLogPos({roundIndex, logIndex});
        setEditingLogTime(time);
        setShowEditLogTime(true);
    };

    const handleSaveLogTime = () => {
        if (!localItem || !editingLogPos || !editingLogTime) {
            setShowEditLogTime(false);
            setEditingLogPos(null);
            return;
        }

        const newItem: LibraryItemFull = JSON.parse(JSON.stringify(localItem));
        const targetRound = newItem.extra.rounds[editingLogPos.roundIndex];
        const targetLog = targetRound?.logs[editingLogPos.logIndex];
        if (!targetLog) {
            setShowEditLogTime(false);
            setEditingLogPos(null);
            return;
        }

        targetLog.time = editingLogTime;
        targetRound.logs.sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());
        newItem.extra.updatedAt = new Date().toISOString();

        setLocalItem(newItem);
        onSave(newItem);
        setShowEditLogTime(false);
        setEditingLogPos(null);
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
        const currentStatus = localItem.extra.status;
        
        const buttons = [
            {status: LibraryItemStatus.TODO, icon: <ClockCircleOutlined/>, label: '等待'},
            {status: LibraryItemStatus.DOING, icon: <PlayCircleOutlined/>, label: '开始'},
            {status: LibraryItemStatus.WAIT, icon: <PauseOutlined/>, label: '搁置'},
            {status: LibraryItemStatus.GIVE_UP, icon: <StopOutlined/>, label: '放弃'},
            {status: LibraryItemStatus.DONE, icon: <CheckOutlined/>, label: '完成'},
        ];
        
        return (
            <Space wrap>
                {buttons.map(btn => (
                    <Button
                        key={btn.status}
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
                ))}
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
                const isComplexScore = localItem?.extra.scoreMode === 'complex';
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
                                content={<LibraryScorePopover extra={localItem.extra} mainScoreOverride={log} />}
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
                content = (
                    <Space direction="vertical" size={0}>
                        <Text type="secondary" style={{fontSize: 12}}>备注</Text>
                        <Paragraph style={{margin: 0}}>{log.comment}</Paragraph>
                    </Space>
                );
                break;
        }
        
        return (
            <Timeline.Item key={`${roundIndex}-${logIndex}`} color={color}>
                <Flex justify="space-between" align="flex-start">
                    {content}
                    <Space size={2}>
                        <Button
                            type="text"
                            size="small"
                            icon={<EditOutlined/>}
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
                    <Space style={{marginTop: 8}}>
                        <Button
                            size="small"
                            icon={<StarOutlined/>}
                            onClick={() => setShowAddScore(true)}
                        >
                            添加评分
                        </Button>
                        <Button
                            size="small"
                            icon={<EditOutlined/>}
                            onClick={() => setShowAddNote(true)}
                        >
                            添加备注
                        </Button>
                        <Button
                            size="small"
                            onClick={handleSetTimelineCutoff}
                        >
                            不加入时间线（断点）
                        </Button>
                    </Space>
                )}
            </Collapse.Panel>
        );
    };

    // 主评分显示
    const mainScoreEntry = localItem ? getMainScore(localItem.extra) : null;

    if (!localItem) return null;
    const displayTitle = editMode ? (editingTitle.trim() || localItem.title) : localItem.title;
    const displayCoverUrl = getLibraryCoverDisplayUrl(displayTitle || '', localItem.extra.pictureAddress);
    const displayStatus = getDisplayStatusInfo(localItem.extra);

    return (
        <Drawer
            title={
                <Flex justify="space-between" align="center">
                    <span>{displayTitle}</span>
                </Flex>
            }
            placement="right"
            width={isMobile ? '100%' : 600}
            onClose={onClose}
            open={visible}
            extra={
                <Space>
                    <Button 
                        icon={<ShareAltOutlined/>} 
                        onClick={() => setShowShare(true)}
                    >
                        分享
                    </Button>
                    {editMode ? (
                        <>
                            <Button onClick={() => setEditMode(false)}>取消</Button>
                            <Button type="primary" onClick={handleSaveBasicInfo}>保存</Button>
                        </>
                    ) : (
                        <Button icon={<EditOutlined/>} onClick={() => setEditMode(true)}>编辑</Button>
                    )}
                </Space>
            }
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
            {/* 封面和基本信息 */}
            <Row gutter={16}>
                <Col span={isMobile ? 24 : 8}>
                    {displayCoverUrl ? (
                        <div
                            style={{
                                position: 'relative',
                                width: '100%',
                                paddingTop: '133.333%',
                                borderRadius: 8,
                                overflow: 'hidden',
                                background: '#f5f5f5',
                                border: '1px solid #d9d9d9',
                            }}
                        >
                            <img
                                src={displayCoverUrl}
                                alt={displayTitle}
                                style={{
                                    position: 'absolute',
                                    inset: 0,
                                    width: '100%',
                                    height: '100%',
                                    objectFit: 'cover',
                                }}
                                onError={(e) => {
                                    (e.target as HTMLImageElement).style.display = 'none';
                                }}
                            />
                        </div>
                    ) : (
                        <div style={{
                            width: '100%',
                            paddingTop: '133.333%',
                            background: '#f5f5f5',
                            borderRadius: 8,
                            position: 'relative',
                            border: '1px solid #d9d9d9',
                        }}>
                            <PictureOutlined style={{
                                position: 'absolute',
                                top: '50%',
                                left: '50%',
                                transform: 'translate(-50%, -50%)',
                                fontSize: 32,
                                color: '#999',
                            }}/>
                        </div>
                    )}
                </Col>
                <Col span={isMobile ? 24 : 16} style={{marginTop: isMobile ? 12 : 0}}>
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
                                <Button
                                    icon={<UploadOutlined/>}
                                    loading={coverUploading}
                                    onClick={() => checkCoverClipboard(false)}
                                >
                                    上传（先读剪贴板）
                                </Button>
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
                            <Descriptions.Item label="备注">{localItem.extra.remark || '-'}</Descriptions.Item>
                            {localItem.extra.status === LibraryItemStatus.TODO && (
                                <Descriptions.Item label="等待原因">{localItem.extra.todoReason || '-'}</Descriptions.Item>
                            )}
                            {localItem.extra.status === LibraryItemStatus.WAIT && (
                                <Descriptions.Item label="搁置原因">{localItem.extra.waitReason || '-'}</Descriptions.Item>
                            )}
                            <Descriptions.Item label="主评分">
                                {mainScoreEntry ? (
                                    <Space>
                                        <StarFilled style={{color: getScoreStarColor(mainScoreEntry.score || 0)}}/>
                                        <Text strong>
                                            {getScoreText(mainScoreEntry.score || 0, mainScoreEntry.scorePlus, mainScoreEntry.scoreSub)}
                                        </Text>
                                        <Text type="secondary">
                                            ({getScoreDisplay(mainScoreEntry.score || 0, mainScoreEntry.scorePlus, mainScoreEntry.scoreSub)})
                                        </Text>
                                    </Space>
                                ) : (
                                    <Text type="secondary">暂无评分</Text>
                                )}
                            </Descriptions.Item>
                        </Descriptions>
                    )}
                </Col>
            </Row>
            
            <Divider/>
            
            {/* 状态快捷操作 */}
            <div style={{marginBottom: 16}}>
                <Text strong>快捷操作</Text>
                <div style={{marginTop: 8}}>
                    {renderStatusButtons()}
                </div>
            </div>
            
            <Divider/>
            
            {/* 周目和日志 */}
            <div>
                <Flex justify="space-between" align="center" style={{marginBottom: 8}}>
                    <Text strong>体验记录</Text>
                    <Text type="secondary">{localItem.extra.rounds.length} 个周目</Text>
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
            
            {/* 添加评分弹窗 */}
            <AddScoreModal
                visible={showAddScore}
                onOk={handleAddScore}
                onCancel={() => setShowAddScore(false)}
                initialMode={localItem.extra.scoreMode || 'simple'}
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
                <TextArea
                    rows={3}
                    placeholder={pendingStatus === LibraryItemStatus.TODO ? '请输入等待原因/二级状态（例如：等字幕、等朋友、片源问题）' : '请输入搁置原因'}
                    value={statusReasonInput}
                    onChange={(e) => setStatusReasonInput(e.target.value)}
                />
            </Modal>

            <Modal
                title="编辑历史时间"
                open={showEditLogTime}
                onOk={handleSaveLogTime}
                onCancel={() => {
                    setShowEditLogTime(false);
                    setEditingLogPos(null);
                }}
            >
                <DatePicker
                    showTime
                    value={editingLogTime ? dayjs(editingLogTime) : null}
                    onChange={(value) => setEditingLogTime(value ? value.toISOString() : '')}
                    style={{width: '100%'}}
                />
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
                <div ref={shareCardRef} style={{maxHeight: '70vh', overflowY: 'auto', background: '#fff', paddingBottom: 8}}>
                    <LibraryShareCard
                        title={localItem.title}
                        extra={localItem.extra}
                        editable={false}
                    />
                    
                    <div style={{padding: '0 10px', fontSize: 12, color: '#999'}}>
                        提示：可直接点击“导出图片”生成分享图。
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
                                <Text>玩法创新：</Text>
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
                    <Text>{mode === 'complex' ? '总评（可选，用于分享）：' : '评价（可选）：'}</Text>
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
