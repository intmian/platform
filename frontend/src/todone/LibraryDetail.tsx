import React, {useEffect, useMemo, useState} from 'react';
import {
    Button,
    Card,
    Col,
    Collapse,
    Descriptions,
    Divider,
    Drawer,
    Flex,
    Form,
    Image,
    Input,
    InputNumber,
    message,
    Modal,
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
import {
    CheckOutlined,
    ClockCircleOutlined,
    EditOutlined,
    PauseOutlined,
    PictureOutlined,
    PlayCircleOutlined,
    PlusOutlined,
    ShareAltOutlined,
    StarFilled,
    StarOutlined,
    StopOutlined,
    SyncOutlined,
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
    formatDateTime,
    getLogTypeText,
    getMainScore,
    getScoreDisplay,
    getScoreText,
    setMainScore,
    startNewRound,
} from './libraryUtil';
import {useIsMobile} from '../common/hooksv2';
import TextRate from '../library/TextRate';
import LibraryShareCard from './LibraryShareCard';
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
    
    // 分享弹窗
    const [showShare, setShowShare] = useState(false);
    const [shareEditMode, setShareEditMode] = useState(false);
    
    // 基本信息编辑表单
    const [form] = Form.useForm();

    const {uploading: coverUploading, selectLocalFile: selectCoverFile, checkClipboard: checkCoverClipboard} = useImageUpload(
        (fileShow) => {
            form.setFieldValue('pictureAddress', fileShow.publishUrl);
            setLocalItem((prev) => {
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

    // 初始化 localItem
    useEffect(() => {
        if (item) {
            setLocalItem(JSON.parse(JSON.stringify(item)));
            form.setFieldsValue({
                title: item.title,
                pictureAddress: item.extra.pictureAddress,
                author: item.extra.author,
                category: item.extra.category,
            });
        }
    }, [item, form]);

    // 保存基本信息
    const handleSaveBasicInfo = () => {
        form.validateFields().then((values) => {
            if (!localItem) return;
            
            const newItem: LibraryItemFull = {
                ...localItem,
                title: values.title,
                extra: {
                    ...localItem.extra,
                    pictureAddress: values.pictureAddress || '',
                    author: values.author || '',
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
    const handleStatusChange = (newStatus: LibraryItemStatus) => {
        if (!localItem) return;
        
        const newExtra = addStatusLog({...localItem.extra}, newStatus);
        const newItem = {...localItem, extra: newExtra};
        setLocalItem(newItem);
        onSave(newItem);
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
    const handleAddScore = (score: number, plus: boolean, sub: boolean, comment: string) => {
        if (!localItem) return;
        
        const newExtra = addScoreLog({...localItem.extra}, score, plus, sub, comment);
        const newItem = {...localItem, extra: newExtra};
        setLocalItem(newItem);
        onSave(newItem);
        setShowAddScore(false);
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

    // 渲染状态快捷按钮
    const renderStatusButtons = () => {
        if (!localItem) return null;
        const currentStatus = localItem.extra.status;
        
        const buttons = [
            {status: LibraryItemStatus.TODO, icon: <ClockCircleOutlined/>, label: '待看'},
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
                        onClick={() => handleStatusChange(btn.status)}
                        size="small"
                    >
                        {btn.label}
                    </Button>
                ))}
                <Button
                    icon={<SyncOutlined/>}
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
            case LibraryLogType.score:
                color = '#faad14';
                content = (
                    <Space direction="vertical" size={0}>
                        <Space>
                            <StarFilled style={{color: '#faad14'}}/>
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
                    <Text type="secondary" style={{fontSize: 11, whiteSpace: 'nowrap'}}>
                        {formatDateTime(log.time)}
                    </Text>
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
                    {round.logs.map((log, logIndex) => renderLogItem(log, roundIndex, logIndex))}
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
                    </Space>
                )}
            </Collapse.Panel>
        );
    };

    // 主评分显示
    const mainScoreEntry = localItem ? getMainScore(localItem.extra) : null;

    if (!localItem) return null;

    return (
        <Drawer
            title={
                <Flex justify="space-between" align="center">
                    <span>{localItem.title}</span>
                    <Tag color={LibraryStatusColors[localItem.extra.status]}>
                        {LibraryStatusNames[localItem.extra.status]}
                    </Tag>
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
                    {localItem.extra.pictureAddress ? (
                        <div
                            style={{
                                position: 'relative',
                                width: '100%',
                                paddingTop: '133.333%',
                                borderRadius: 8,
                                overflow: 'hidden',
                                background: '#f5f5f5',
                            }}
                        >
                            <Image
                                src={localItem.extra.pictureAddress}
                                style={{
                                    position: 'absolute',
                                    inset: 0,
                                    width: '100%',
                                    height: '100%',
                                    objectFit: 'cover',
                                }}
                                fallback="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 300 400'%3E%3Crect fill='%23f0f0f0' width='300' height='400'/%3E%3Ctext x='150' y='200' text-anchor='middle' dy='.3em' fill='%23999'%3E暂无图片%3C/text%3E%3C/svg%3E"
                            />
                        </div>
                    ) : (
                        <div style={{
                            width: '100%',
                            paddingTop: '133.333%',
                            background: '#f5f5f5',
                            borderRadius: 8,
                            position: 'relative',
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
                            <Form.Item name="pictureAddress" label="封面URL">
                                <Space.Compact style={{width: '100%'}}>
                                    <Input placeholder="可粘贴URL，或使用右侧按钮上传"/>
                                    <Button
                                        icon={<UploadOutlined/>}
                                        loading={coverUploading}
                                        onClick={() => selectCoverFile(false)}
                                    >
                                        上传3:4
                                    </Button>
                                </Space.Compact>
                                <Space style={{marginTop: 8}}>
                                    <Button
                                        size="small"
                                        loading={coverUploading}
                                        onClick={() => checkCoverClipboard(false)}
                                    >
                                        剪贴板上传
                                    </Button>
                                    <Text type="secondary">上传时自动居中裁剪为 3:4</Text>
                                </Space>
                            </Form.Item>
                        </Form>
                    ) : (
                        <Descriptions column={1} size="small">
                            <Descriptions.Item label="作者">{localItem.extra.author || '-'}</Descriptions.Item>
                            <Descriptions.Item label="分类">{localItem.extra.category || '-'}</Descriptions.Item>
                            <Descriptions.Item label="添加时间">{formatDateTime(localItem.extra.createdAt)}</Descriptions.Item>
                            <Descriptions.Item label="主评分">
                                {mainScoreEntry ? (
                                    <Space>
                                        <StarFilled style={{color: '#faad14'}}/>
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
            
            {/* 分享弹窗 */}
            <Modal
                title={
                    <Flex justify="space-between" align="center">
                        <span>分享预览</span>
                        <Space>
                            <Radio.Group 
                                value={localItem.extra.scoreMode || 'simple'} 
                                onChange={(e) => {
                                    const newExtra = {...localItem.extra, scoreMode: e.target.value};
                                    const newItem = {...localItem, extra: newExtra};
                                    setLocalItem(newItem);
                                }}
                                size="small"
                            >
                                <Radio.Button value="simple">简单评分</Radio.Button>
                                <Radio.Button value="complex">复杂评分</Radio.Button>
                            </Radio.Group>
                            <Button 
                                size="small"
                                type={shareEditMode ? 'primary' : 'default'}
                                onClick={() => setShareEditMode(!shareEditMode)}
                            >
                                {shareEditMode ? '完成编辑' : '编辑评分'}
                            </Button>
                        </Space>
                    </Flex>
                }
                open={showShare}
                onCancel={() => {
                    setShowShare(false);
                    setShareEditMode(false);
                }}
                footer={
                    <Space>
                        <Button onClick={() => {
                            setShowShare(false);
                            setShareEditMode(false);
                        }}>
                            关闭
                        </Button>
                        <Button 
                            type="primary"
                            onClick={() => {
                                onSave(localItem);
                                message.success('评分已保存');
                            }}
                        >
                            保存评分
                        </Button>
                    </Space>
                }
                width={isMobile ? '100%' : 650}
                style={{top: 20}}
            >
                <div style={{maxHeight: '70vh', overflowY: 'auto'}}>
                    <LibraryShareCard
                        title={localItem.title}
                        extra={localItem.extra}
                        editable={shareEditMode}
                        onChange={(newExtra) => {
                            const newItem = {...localItem, extra: newExtra};
                            setLocalItem(newItem);
                        }}
                    />
                    
                    {/* 复杂模式下的总评编辑 */}
                    {localItem.extra.scoreMode === 'complex' && shareEditMode && (
                        <div style={{padding: '0 10px 16px'}}>
                            <Text strong>总评：</Text>
                            <TextArea
                                rows={4}
                                placeholder="请输入总评内容..."
                                value={localItem.extra.comment || ''}
                                onChange={(e) => {
                                    const newExtra = {...localItem.extra, comment: e.target.value};
                                    const newItem = {...localItem, extra: newExtra};
                                    setLocalItem(newItem);
                                }}
                                style={{marginTop: 8}}
                            />
                        </div>
                    )}
                    
                    <div style={{padding: '0 10px', fontSize: 12, color: '#999'}}>
                        提示：截图此卡片即可分享。{localItem.extra.scoreMode === 'complex' ? '复杂模式包含多维度评分。' : '简单模式仅显示主评分。'}
                    </div>
                </div>
            </Modal>
        </Drawer>
    );
}

// 添加评分弹窗组件
interface AddScoreModalProps {
    visible: boolean;
    onOk: (score: number, plus: boolean, sub: boolean, comment: string) => void;
    onCancel: () => void;
}

function AddScoreModal({visible, onOk, onCancel}: AddScoreModalProps) {
    const [score, setScore] = useState(3);
    const [plus, setPlus] = useState(false);
    const [sub, setSub] = useState(false);
    const [comment, setComment] = useState('');

    const handleTextRateChange = (text: string) => {
        const SCORE_SEQ = ["零", "差", "合", "优", "满"];
        let sign: "" | "+" | "-" = "";
        if (text.endsWith("+")) sign = "+";
        else if (text.endsWith("-")) sign = "-";
        const label = sign ? text.slice(0, -1) : text;
        const idx = SCORE_SEQ.findIndex((s) => s === label);
        
        setScore(idx >= 0 ? idx + 1 : 3);
        setPlus(sign === "+");
        setSub(sign === "-");
    };

    const handleOk = () => {
        onOk(score, plus, sub, comment);
        setScore(3);
        setPlus(false);
        setSub(false);
        setComment('');
    };

    const handleCancel = () => {
        onCancel();
        setScore(3);
        setPlus(false);
        setSub(false);
        setComment('');
    };

    return (
        <Modal
            title="添加评分"
            open={visible}
            onOk={handleOk}
            onCancel={handleCancel}
        >
            <Space direction="vertical" style={{width: '100%'}}>
                <div>
                    <Text>评分：</Text>
                    <div style={{marginTop: 8}}>
                        <TextRate
                            sequence={["零", "差", "合", "优", "满"]}
                            editable={true}
                            initialValue={getScoreText(score, plus, sub)}
                            onChange={handleTextRateChange}
                            fontSize={24}
                            fontSize2={16}
                        />
                    </div>
                    <Text type="secondary" style={{marginTop: 4, display: 'block'}}>
                        当前：{getScoreDisplay(score, plus, sub)}
                    </Text>
                </div>
                
                <div>
                    <Text>评价（可选）：</Text>
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
