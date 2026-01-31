import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {
    Button,
    Card,
    Col,
    Dropdown,
    Empty,
    Flex,
    Image,
    Input,
    message,
    Modal,
    Row,
    Select,
    Space,
    Spin,
    Tag,
    Tooltip,
    Form,
} from 'antd';
import {
    AppstoreOutlined,
    ClockCircleOutlined,
    FilterOutlined,
    PictureOutlined,
    PlusOutlined,
    ReloadOutlined,
    SearchOutlined,
    SortAscendingOutlined,
    StarFilled,
} from '@ant-design/icons';
import {Addr} from './addr';
import {
    LibraryItemFull,
    LibraryItemStatus,
    LibraryStatusColors,
    LibraryStatusNames,
    PSubGroup,
    PTask,
} from './net/protocal';
import {
    ChangeTaskReq,
    CreateTaskReq,
    GetSubGroupReq,
    GetTasksReq,
    sendChangeTask,
    sendCreateTask,
    sendGetSubGroup,
    sendGetTasks,
} from './net/send_back';
import {
    createDefaultLibraryExtra,
    formatDate,
    getMainScore,
    getScoreText,
    parseLibraryFromTask,
    serializeLibraryExtra,
} from './libraryUtil';
import {useIsMobile} from '../common/hooksv2';
import LibraryDetail from './LibraryDetail';
import LibraryTimeline from './LibraryTimeline';

// 排序选项
type SortOption = 'index' | 'createdAt' | 'updatedAt' | 'title' | 'score';

interface LibraryProps {
    addr: Addr | null;
    groupTitle: string;
}

export default function Library({addr, groupTitle}: LibraryProps) {
    const isMobile = useIsMobile();
    
    // 数据状态
    const [subGroups, setSubGroups] = useState<PSubGroup[]>([]);
    const [tasksBySubGroup, setTasksBySubGroup] = useState<Map<number, PTask[]>>(new Map());
    const [loading, setLoading] = useState(false);
    
    // 当前选中的分类
    const [selectedSubGroup, setSelectedSubGroup] = useState<number | 'all'>('all');
    
    // 筛选和排序
    const [statusFilter, setStatusFilter] = useState<LibraryItemStatus | 'all'>('all');
    const [sortBy, setSortBy] = useState<SortOption>('updatedAt');
    const [searchText, setSearchText] = useState('');
    
    // 详情弹窗
    const [detailItem, setDetailItem] = useState<LibraryItemFull | null>(null);
    const [detailSubGroupId, setDetailSubGroupId] = useState<number>(0);
    const [showDetail, setShowDetail] = useState(false);
    
    // 添加弹窗
    const [showAdd, setShowAdd] = useState(false);
    const [addForm] = Form.useForm();
    const [addLoading, setAddLoading] = useState(false);
    
    // 时间线视图
    const [showTimeline, setShowTimeline] = useState(false);

    // 加载 SubGroup 列表
    const loadSubGroups = useCallback(() => {
        if (!addr || addr.userID === '') return;
        
        const req: GetSubGroupReq = {
            UserID: addr.userID,
            ParentDirID: addr.getLastDirID(),
            GroupID: addr.getLastGroupID(),
        };
        
        setLoading(true);
        sendGetSubGroup(req, (ret) => {
            if (ret.ok && ret.data.SubGroups) {
                setSubGroups(ret.data.SubGroups);
                // 加载所有分类的 tasks
                loadAllTasks(ret.data.SubGroups);
            } else {
                setSubGroups([]);
                setLoading(false);
            }
        });
    }, [addr]);

    // 加载所有分类的 tasks
    const loadAllTasks = useCallback((groups: PSubGroup[]) => {
        if (!addr || groups.length === 0) {
            setLoading(false);
            return;
        }
        
        const newTasksMap = new Map<number, PTask[]>();
        let loadedCount = 0;
        
        groups.forEach((sg) => {
            const req: GetTasksReq = {
                UserID: addr.userID,
                ParentDirID: addr.getLastDirID(),
                GroupID: addr.getLastGroupID(),
                SubGroupID: sg.ID,
                ContainDone: true,
            };
            
            sendGetTasks(req, (ret) => {
                if (ret.ok) {
                    newTasksMap.set(sg.ID, ret.data.Tasks || []);
                }
                loadedCount++;
                if (loadedCount === groups.length) {
                    setTasksBySubGroup(newTasksMap);
                    setLoading(false);
                }
            });
        });
    }, [addr]);

    // 初始加载
    useEffect(() => {
        loadSubGroups();
    }, [loadSubGroups]);

    // 转换为 LibraryItemFull 列表
    const allItems: Array<LibraryItemFull & {subGroupId: number; subGroupName: string}> = useMemo(() => {
        const items: Array<LibraryItemFull & {subGroupId: number; subGroupName: string}> = [];
        
        tasksBySubGroup.forEach((tasks, subGroupId) => {
            const sg = subGroups.find(s => s.ID === subGroupId);
            const subGroupName = sg?.Title || '未分类';
            
            tasks.forEach((task) => {
                const item = parseLibraryFromTask(task);
                items.push({
                    ...item,
                    subGroupId,
                    subGroupName,
                });
            });
        });
        
        return items;
    }, [tasksBySubGroup, subGroups]);

    // 应用筛选和排序
    const filteredItems = useMemo(() => {
        let result = [...allItems];
        
        // 分类筛选
        if (selectedSubGroup !== 'all') {
            result = result.filter(item => item.subGroupId === selectedSubGroup);
        }
        
        // 状态筛选
        if (statusFilter !== 'all') {
            result = result.filter(item => item.extra.status === statusFilter);
        }
        
        // 搜索筛选
        if (searchText.trim()) {
            const search = searchText.toLowerCase();
            result = result.filter(item =>
                item.title.toLowerCase().includes(search) ||
                item.extra.author.toLowerCase().includes(search) ||
                item.extra.category.toLowerCase().includes(search)
            );
        }
        
        // 排序
        result.sort((a, b) => {
            switch (sortBy) {
                case 'index':
                    return a.index - b.index;
                case 'createdAt':
                    return new Date(b.extra.createdAt).getTime() - new Date(a.extra.createdAt).getTime();
                case 'updatedAt':
                    return new Date(b.extra.updatedAt).getTime() - new Date(a.extra.updatedAt).getTime();
                case 'title':
                    return a.title.localeCompare(b.title, 'zh-CN');
                case 'score': {
                    const scoreA = getMainScore(a.extra)?.score || 0;
                    const scoreB = getMainScore(b.extra)?.score || 0;
                    return scoreB - scoreA;
                }
                default:
                    return 0;
            }
        });
        
        return result;
    }, [allItems, selectedSubGroup, statusFilter, searchText, sortBy]);

    // 保存 item 变更
    const handleSaveItem = useCallback((item: LibraryItemFull, subGroupId: number) => {
        if (!addr) return;
        
        const tasks = tasksBySubGroup.get(subGroupId);
        const originalTask = tasks?.find(t => t.ID === item.taskId);
        if (!originalTask) return;
        
        const updatedTask: PTask = {
            ...originalTask,
            Title: item.title,
            Note: serializeLibraryExtra(item.extra),
            Tags: item.tags,
        };
        
        const req: ChangeTaskReq = {
            DirID: addr.getLastDirID(),
            GroupID: addr.getLastGroupID(),
            SubGroupID: subGroupId,
            UserID: addr.userID,
            Data: updatedTask,
        };
        
        sendChangeTask(req, (ret) => {
            if (ret.ok) {
                // 更新本地数据
                const newTasksMap = new Map(tasksBySubGroup);
                const newTasks = (newTasksMap.get(subGroupId) || []).map(t =>
                    t.ID === item.taskId ? updatedTask : t
                );
                newTasksMap.set(subGroupId, newTasks);
                setTasksBySubGroup(newTasksMap);
                message.success('保存成功');
            } else {
                message.error('保存失败');
            }
        });
    }, [addr, tasksBySubGroup]);

    // 添加新条目
    const handleAdd = useCallback(() => {
        addForm.validateFields().then((values) => {
            if (!addr) return;
            
            const targetSubGroupId = values.subGroupId || (subGroups[0]?.ID);
            if (!targetSubGroupId) {
                message.error('请先创建分类');
                return;
            }
            
            setAddLoading(true);
            
            const extra = createDefaultLibraryExtra();
            extra.pictureAddress = values.pictureAddress || '';
            extra.author = values.author || '';
            extra.category = subGroups.find(s => s.ID === targetSubGroupId)?.Title || '';
            
            const req: CreateTaskReq = {
                UserID: addr.userID,
                DirID: addr.getLastDirID(),
                GroupID: addr.getLastGroupID(),
                SubGroupID: targetSubGroupId,
                ParentTask: 0,
                Title: values.title,
                Note: serializeLibraryExtra(extra),
                AfterID: 0,
                Started: false,
                TaskType: 0,
            };
            
            sendCreateTask(req, (ret) => {
                setAddLoading(false);
                if (ret.ok) {
                    message.success('添加成功');
                    setShowAdd(false);
                    addForm.resetFields();
                    // 刷新数据
                    loadSubGroups();
                } else {
                    message.error('添加失败');
                }
            });
        });
    }, [addr, addForm, subGroups, loadSubGroups]);

    // 快速状态变更菜单
    const getStatusMenuItems = (item: LibraryItemFull & {subGroupId: number}) => {
        return Object.entries(LibraryStatusNames).map(([status, name]) => ({
            key: status,
            label: name,
            onClick: () => {
                const numStatus = Number(status) as LibraryItemStatus;
                if (item.extra.status !== numStatus) {
                    const newExtra = {...item.extra};
                    const now = new Date().toISOString();
                    const currentRound = newExtra.rounds[newExtra.currentRound];
                    if (currentRound) {
                        currentRound.logs.push({
                            type: 0, // LibraryLogType.changeStatus
                            time: now,
                            status: numStatus,
                        });
                    }
                    newExtra.status = numStatus;
                    newExtra.updatedAt = now;
                    
                    const newItem = {...item, extra: newExtra};
                    handleSaveItem(newItem, item.subGroupId);
                }
            },
        }));
    };

    // 渲染单个卡片
    const renderCard = (item: LibraryItemFull & {subGroupId: number; subGroupName: string}) => {
        const mainScore = getMainScore(item.extra);
        const cardWidth = isMobile ? '100%' : 180;
        const imageHeight = isMobile ? 200 : 240;
        
        return (
            <Card
                key={item.taskId}
                hoverable
                style={{width: cardWidth, marginBottom: 16}}
                cover={
                    item.extra.pictureAddress ? (
                        <Image
                            alt={item.title}
                            src={item.extra.pictureAddress}
                            height={imageHeight}
                            style={{objectFit: 'cover'}}
                            preview={false}
                            onClick={() => {
                                setDetailItem(item);
                                setDetailSubGroupId(item.subGroupId);
                                setShowDetail(true);
                            }}
                            fallback="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Crect fill='%23f0f0f0' width='100' height='100'/%3E%3Ctext x='50' y='50' text-anchor='middle' dy='.3em' fill='%23999'%3E暂无图片%3C/text%3E%3C/svg%3E"
                        />
                    ) : (
                        <div
                            style={{
                                height: imageHeight,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                background: '#f5f5f5',
                                cursor: 'pointer',
                            }}
                            onClick={() => {
                                setDetailItem(item);
                                setDetailSubGroupId(item.subGroupId);
                                setShowDetail(true);
                            }}
                        >
                            <Space direction="vertical" align="center">
                                <PictureOutlined style={{fontSize: 32, color: '#999'}}/>
                                <span style={{
                                    fontSize: 16,
                                    fontWeight: 500,
                                    color: '#666',
                                    textAlign: 'center',
                                    padding: '0 8px',
                                }}>
                                    {item.title}
                                </span>
                            </Space>
                        </div>
                    )
                }
                actions={[
                    <Dropdown
                        key="status"
                        menu={{items: getStatusMenuItems(item)}}
                        trigger={['click']}
                    >
                        <Tag
                            color={LibraryStatusColors[item.extra.status]}
                            style={{cursor: 'pointer', margin: 0}}
                        >
                            {LibraryStatusNames[item.extra.status]}
                        </Tag>
                    </Dropdown>,
                ]}
            >
                <Card.Meta
                    title={
                        <Tooltip title={item.title}>
                            <div style={{
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                            }}>
                                {item.title}
                            </div>
                        </Tooltip>
                    }
                    description={
                        <Flex justify="space-between" align="center">
                            <span style={{fontSize: 12, color: '#999'}}>
                                {item.subGroupName}
                            </span>
                            {mainScore && (
                                <Space size={2}>
                                    <StarFilled style={{color: '#faad14', fontSize: 12}}/>
                                    <span style={{fontSize: 12}}>
                                        {getScoreText(mainScore.score, mainScore.scorePlus, mainScore.scoreSub)}
                                    </span>
                                </Space>
                            )}
                        </Flex>
                    }
                />
            </Card>
        );
    };

    if (!addr) {
        return <Empty description="请选择一个 Library 分组"/>;
    }

    return (
        <div style={{padding: isMobile ? '8px' : '16px'}}>
            {/* 标题和工具栏 */}
            <Flex
                justify="space-between"
                align="center"
                wrap="wrap"
                gap={8}
                style={{marginBottom: 16}}
            >
                <Space>
                    <AppstoreOutlined style={{fontSize: 20}}/>
                    <span style={{fontSize: 18, fontWeight: 500}}>{groupTitle}</span>
                    <Tag>{filteredItems.length} 项</Tag>
                </Space>
                
                <Space wrap>
                    <Button
                        icon={<ClockCircleOutlined/>}
                        onClick={() => setShowTimeline(true)}
                    >
                        时间线
                    </Button>
                    <Button
                        type="primary"
                        icon={<PlusOutlined/>}
                        onClick={() => setShowAdd(true)}
                    >
                        添加
                    </Button>
                    <Button
                        icon={<ReloadOutlined/>}
                        onClick={loadSubGroups}
                    />
                </Space>
            </Flex>
            
            {/* 筛选栏 */}
            <Flex wrap="wrap" gap={8} style={{marginBottom: 16}}>
                <Input
                    placeholder="搜索名称/作者..."
                    prefix={<SearchOutlined/>}
                    value={searchText}
                    onChange={(e) => setSearchText(e.target.value)}
                    style={{width: isMobile ? '100%' : 200}}
                    allowClear
                />
                
                <Select
                    value={selectedSubGroup}
                    onChange={setSelectedSubGroup}
                    style={{width: isMobile ? '48%' : 120}}
                    options={[
                        {value: 'all', label: '全部分类'},
                        ...subGroups.map(sg => ({value: sg.ID, label: sg.Title})),
                    ]}
                />
                
                <Select
                    value={statusFilter}
                    onChange={setStatusFilter}
                    style={{width: isMobile ? '48%' : 120}}
                    suffixIcon={<FilterOutlined/>}
                    options={[
                        {value: 'all', label: '全部状态'},
                        ...Object.entries(LibraryStatusNames).map(([k, v]) => ({
                            value: Number(k),
                            label: v,
                        })),
                    ]}
                />
                
                <Select
                    value={sortBy}
                    onChange={setSortBy}
                    style={{width: isMobile ? '100%' : 140}}
                    suffixIcon={<SortAscendingOutlined/>}
                    options={[
                        {value: 'updatedAt', label: '最近更新'},
                        {value: 'createdAt', label: '添加时间'},
                        {value: 'title', label: '名称'},
                        {value: 'score', label: '评分'},
                        {value: 'index', label: '默认顺序'},
                    ]}
                />
            </Flex>
            
            {/* 照片墙 */}
            <Spin spinning={loading}>
                {filteredItems.length === 0 ? (
                    <Empty description="暂无内容"/>
                ) : (
                    <Row gutter={[16, 16]}>
                        {filteredItems.map(item => (
                            <Col key={item.taskId} xs={12} sm={8} md={6} lg={4} xl={4}>
                                {renderCard(item)}
                            </Col>
                        ))}
                    </Row>
                )}
            </Spin>
            
            {/* 添加弹窗 */}
            <Modal
                title="添加条目"
                open={showAdd}
                onOk={handleAdd}
                onCancel={() => {
                    setShowAdd(false);
                    addForm.resetFields();
                }}
                confirmLoading={addLoading}
            >
                <Form form={addForm} layout="vertical">
                    <Form.Item
                        name="title"
                        label="名称"
                        rules={[{required: true, message: '请输入名称'}]}
                    >
                        <Input placeholder="请输入名称"/>
                    </Form.Item>
                    
                    <Form.Item
                        name="subGroupId"
                        label="分类"
                        rules={[{required: true, message: '请选择分类'}]}
                    >
                        <Select
                            placeholder="请选择分类"
                            options={subGroups.map(sg => ({
                                value: sg.ID,
                                label: sg.Title,
                            }))}
                        />
                    </Form.Item>
                    
                    <Form.Item name="author" label="作者/制作方">
                        <Input placeholder="请输入作者或制作方"/>
                    </Form.Item>
                    
                    <Form.Item name="pictureAddress" label="封面图片地址">
                        <Input placeholder="请输入图片URL"/>
                    </Form.Item>
                </Form>
            </Modal>
            
            {/* 详情弹窗 */}
            <LibraryDetail
                visible={showDetail}
                item={detailItem}
                subGroupId={detailSubGroupId}
                onClose={() => {
                    setShowDetail(false);
                    setDetailItem(null);
                }}
                onSave={(item) => {
                    handleSaveItem(item, detailSubGroupId);
                    setDetailItem(item);
                }}
            />
            
            {/* 时间线弹窗 */}
            <LibraryTimeline
                visible={showTimeline}
                items={allItems}
                onClose={() => setShowTimeline(false)}
                onItemClick={(itemId) => {
                    const item = allItems.find(i => i.taskId === itemId);
                    if (item) {
                        setDetailItem(item);
                        setDetailSubGroupId(item.subGroupId);
                        setShowTimeline(false);
                        setShowDetail(true);
                    }
                }}
            />
        </div>
    );
}
