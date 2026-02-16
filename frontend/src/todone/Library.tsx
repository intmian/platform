import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {
    Button,
    Checkbox,
    Dropdown,
    Empty,
    Flex,
    Input,
    message,
    Modal,
    Popover,
    Select,
    Space,
    Spin,
    Tag,
    Form,
    Popconfirm,
    AutoComplete,
} from 'antd';
import {
    AppstoreOutlined,
    ClockCircleOutlined,
    DeleteOutlined,
    EditOutlined,
    EyeOutlined,
    FilterOutlined,
    PlusOutlined,
    SearchOutlined,
    SettingOutlined,
    SortAscendingOutlined,
    StarFilled,
    UploadOutlined,
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
    CreateSubGroupReq,
    CreateTaskReq,
    DelTaskReq,
    GetSubGroupReq,
    GetTasksReq,
    sendChangeTask,
    sendCreateSubGroup,
    sendCreateTask,
    sendDelTask,
    sendGetSubGroup,
    sendGetTasks,
} from './net/send_back';
import {
    addStatusLog,
    buildLibraryTitleCoverDataUrl,
    createDefaultLibraryExtra,
    getDisplayStatusInfo,
    getLibraryCoverDisplayUrl,
    isWaitExpired,
    LIBRARY_WAIT_EXPIRED_FILTER,
    getMainScore,
    getLibraryCoverPaletteByTitle,
    getScoreStarColor,
    getScoreText,
    parseLibraryFromTask,
    serializeLibraryExtra,
} from './libraryUtil';
import {useIsMobile} from '../common/hooksv2';
import LibraryDetail from './LibraryDetail';
import LibraryTimeline from './LibraryTimeline';
import LibraryScorePopover from './LibraryScorePopover';
import {useImageUpload} from '../common/useImageUpload';
import {cropImageToAspectRatio} from '../common/imageCrop';
import './Library.css';

// 排序选项
type SortOption = 'index' | 'createdAt' | 'updatedAt' | 'title' | 'score';
type StatusFilterOption = LibraryItemStatus | 'all' | 'none' | typeof LIBRARY_WAIT_EXPIRED_FILTER;

// 默认的 SubGroup 名称（用于存储所有 Library 条目）
const DEFAULT_SUBGROUP_NAME = '_library_items_';

interface LibraryProps {
    addr: Addr | null;
    groupTitle: string;
}

export default function Library({addr, groupTitle}: LibraryProps) {
    const isMobile = useIsMobile();
    
    // 数据状态
    const [mainSubGroup, setMainSubGroup] = useState<PSubGroup | null>(null);
    const [tasks, setTasks] = useState<PTask[]>([]);
    const [loading, setLoading] = useState(false);
    
    // 当前选中的分类 (extra.category)
    const [selectedCategory, setSelectedCategory] = useState<string>('all');
    
    // 筛选和排序
    const [statusFilter, setStatusFilter] = useState<StatusFilterOption>('all');
    const [todoReasonFilter, setTodoReasonFilter] = useState<string>('all');
    const [sortBy, setSortBy] = useState<SortOption>('updatedAt');
    const [searchText, setSearchText] = useState('');

    // 列表状态切换（等待需输入原因）
    const [showTodoReasonModal, setShowTodoReasonModal] = useState(false);
    const [todoReasonInput, setTodoReasonInput] = useState('');
    const [pendingTodoItem, setPendingTodoItem] = useState<LibraryItemFull | null>(null);
    
    // 详情弹窗
    const [detailItem, setDetailItem] = useState<LibraryItemFull | null>(null);
    const [showDetail, setShowDetail] = useState(false);
    
    // 添加条目弹窗
    const [showAdd, setShowAdd] = useState(false);
    const [addForm] = Form.useForm();
    const [addLoading, setAddLoading] = useState(false);
    const [addCoverUrl, setAddCoverUrl] = useState('');

    const {uploading: addCoverUploading, checkClipboard: checkAddCoverClipboard} = useImageUpload(
        (fileShow) => {
            setAddCoverUrl(fileShow.publishUrl);
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
    const addTitle = Form.useWatch('title', addForm) || '';
    const addPreviewUrl = addCoverUrl.trim() || buildLibraryTitleCoverDataUrl(addTitle.trim());
    
    // 分类管理弹窗
    const [showCategoryManager, setShowCategoryManager] = useState(false);
    const [newCategoryName, setNewCategoryName] = useState('');
    const [editingCategoryOld, setEditingCategoryOld] = useState<string | null>(null);
    const [editingCategoryNew, setEditingCategoryNew] = useState('');
    
    // 时间线视图
    const [showTimeline, setShowTimeline] = useState(false);
    const [scoreModalItem, setScoreModalItem] = useState<LibraryItemFull | null>(null);
    
    // 显示选项
    const [showDisplayOptions, setShowDisplayOptions] = useState(false);
    const [displayOptions, setDisplayOptions] = useState({
        showScore: true,        // 显示评分
        showCategory: true,     // 显示分类（仅在全部分类时有效）
        showUpdateTime: false,  // 显示更新时间
        showStartTime: false,   // 显示开始时间
        showAuthor: false,      // 显示作者
    });

    // 加载 Tasks
    const loadTasks = useCallback((subGroupId: number) => {
        if (!addr) {
            setLoading(false);
            return;
        }
        
        const req: GetTasksReq = {
            UserID: addr.userID,
            ParentDirID: addr.getLastDirID(),
            GroupID: addr.getLastGroupID(),
            SubGroupID: subGroupId,
            ContainDone: true,
        };
        
        sendGetTasks(req, (ret) => {
            if (ret.ok) {
                setTasks(ret.data.Tasks || []);
            }
            setLoading(false);
        });
    }, [addr]);

    // 加载或创建主 SubGroup
    const loadOrCreateMainSubGroup = useCallback(() => {
        if (!addr || addr.userID === '') return;
        
        const req: GetSubGroupReq = {
            UserID: addr.userID,
            ParentDirID: addr.getLastDirID(),
            GroupID: addr.getLastGroupID(),
        };
        
        setLoading(true);
        sendGetSubGroup(req, (ret) => {
            if (ret.ok && ret.data.SubGroups && ret.data.SubGroups.length > 0) {
                // 优先查找名为 DEFAULT_SUBGROUP_NAME 的 SubGroup
                let sg = ret.data.SubGroups.find((g: any) => g.Title === DEFAULT_SUBGROUP_NAME);
                if (!sg) {
                    // 没找到则回退到第一个（兼容旧数据）
                    sg = ret.data.SubGroups[0];
                }
                
                setMainSubGroup(sg);
                loadTasks(sg.ID);
            } else {
                // 创建默认 SubGroup
                const createReq: CreateSubGroupReq = {
                    UserID: addr.userID,
                    ParentDirID: addr.getLastDirID(),
                    GroupID: addr.getLastGroupID(),
                    Title: DEFAULT_SUBGROUP_NAME,
                    Note: 'Library 条目存储',
                    AfterID: 0,
                };
                
                sendCreateSubGroup(createReq, (createRet) => {
                    if (createRet.ok) {
                        // 重新加载
                        sendGetSubGroup(req, (ret2) => {
                            if (ret2.ok && ret2.data.SubGroups && ret2.data.SubGroups.length > 0) {
                                const sg = ret2.data.SubGroups.find((g: any) => g.Title === DEFAULT_SUBGROUP_NAME) || ret2.data.SubGroups[0];
                                setMainSubGroup(sg);
                                loadTasks(sg.ID);
                            } else {
                                setLoading(false);
                            }
                        });
                    } else {
                        message.error('初始化失败');
                        setLoading(false);
                    }
                });
            }
        });
    }, [addr, loadTasks]);

    // 初始加载
    useEffect(() => {
        loadOrCreateMainSubGroup();
    }, [loadOrCreateMainSubGroup]);

    useEffect(() => {
        if (statusFilter !== LibraryItemStatus.TODO) {
            setTodoReasonFilter('all');
        }
    }, [statusFilter]);

    // 转换为 LibraryItemFull 列表
    const allItems: LibraryItemFull[] = useMemo(() => {
        return tasks.map(task => parseLibraryFromTask(task));
    }, [tasks]);

    // 提取所有分类（从 extra.category 字段）
    const categories: string[] = useMemo(() => {
        const categorySet = new Set<string>();
        allItems.forEach(item => {
            if (item.extra.category && item.extra.category.trim()) {
                categorySet.add(item.extra.category.trim());
            }
        });
        return Array.from(categorySet).sort((a, b) => a.localeCompare(b, 'zh-CN'));
    }, [allItems]);

    // 每个分类的条目数量
    const categoryCount: Map<string, number> = useMemo(() => {
        const countMap = new Map<string, number>();
        allItems.forEach(item => {
            const cat = item.extra.category?.trim() || '未分类';
            countMap.set(cat, (countMap.get(cat) || 0) + 1);
        });
        return countMap;
    }, [allItems]);

    const todoReasonOptions: string[] = useMemo(() => {
        const reasonSet = new Set<string>();
        allItems.forEach(item => {
            if (item.extra.status === LibraryItemStatus.TODO) {
                const reason = item.extra.todoReason?.trim() || '';
                if (reason) {
                    reasonSet.add(reason);
                }
            }
        });
        return Array.from(reasonSet).sort((a, b) => a.localeCompare(b, 'zh-CN'));
    }, [allItems]);

    // 应用筛选和排序
    const filteredItems = useMemo(() => {
        let result = [...allItems];
        
        if (selectedCategory !== 'all') {
            if (selectedCategory === '_uncategorized_') {
                result = result.filter(item => !item.extra.category || !item.extra.category.trim());
            } else {
                result = result.filter(item => item.extra.category?.trim() === selectedCategory);
            }
        }
        
        if (statusFilter !== 'all') {
            if (statusFilter === LIBRARY_WAIT_EXPIRED_FILTER) {
                result = result.filter(item => isWaitExpired(item.extra));
            } else if (statusFilter === 'none') {
                result = result.filter(item => item.extra.status === undefined);
            } else {
                result = result.filter(item => item.extra.status === statusFilter);
            }
        }

        if (statusFilter === LibraryItemStatus.TODO && todoReasonFilter !== 'all') {
            result = result.filter(item => (item.extra.todoReason?.trim() || '') === todoReasonFilter);
        }
        
        if (searchText.trim()) {
            const search = searchText.toLowerCase();
            result = result.filter(item =>
                item.title.toLowerCase().includes(search) ||
                item.extra.author.toLowerCase().includes(search) ||
                item.extra.category.toLowerCase().includes(search)
            );
        }
        
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
    }, [allItems, selectedCategory, statusFilter, todoReasonFilter, searchText, sortBy]);

    // 保存 item 变更
    const handleSaveItem = useCallback((item: LibraryItemFull) => {
        if (!addr || !mainSubGroup) return;
        
        const originalTask = tasks.find(t => t.ID === item.taskId);
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
            SubGroupID: mainSubGroup.ID,
            UserID: addr.userID,
            Data: updatedTask,
        };
        
        sendChangeTask(req, (ret) => {
            if (ret.ok) {
                setTasks(prev => prev.map(t => t.ID === item.taskId ? updatedTask : t));
                message.success('保存成功');
            } else {
                message.error('保存失败');
            }
        });
    }, [addr, mainSubGroup, tasks]);

    const handleQuickStatusChange = useCallback((item: LibraryItemFull, status?: LibraryItemStatus) => {
        if (status === LibraryItemStatus.TODO) {
            setPendingTodoItem(item);
            setTodoReasonInput(item.extra.todoReason || '');
            setShowTodoReasonModal(true);
            return;
        }
        if (item.extra.status === status) {
            return;
        }
        const newExtra = addStatusLog({...item.extra}, status);
        const newItem = {...item, extra: newExtra};
        handleSaveItem(newItem);
    }, [handleSaveItem]);

    const handleConfirmTodoReason = useCallback(() => {
        if (!pendingTodoItem) return;
        const reason = todoReasonInput.trim();
        if (!reason) {
            message.warning('请输入等待原因');
            return;
        }
        const newExtra = addStatusLog({...pendingTodoItem.extra}, LibraryItemStatus.TODO, reason);
        const newItem = {...pendingTodoItem, extra: newExtra};
        handleSaveItem(newItem);
        setShowTodoReasonModal(false);
        setPendingTodoItem(null);
        setTodoReasonInput('');
    }, [pendingTodoItem, todoReasonInput, handleSaveItem]);

    // 删除条目
    const handleDeleteItem = useCallback((item: LibraryItemFull) => {
        if (!addr || !mainSubGroup) return;
        
        const req: DelTaskReq = {
            UserID: addr.userID,
            DirID: addr.getLastDirID(),
            GroupID: addr.getLastGroupID(),
            SubGroupID: mainSubGroup.ID,
            TaskID: [item.taskId],
        };
        
        sendDelTask(req, (ret) => {
            if (ret.ok) {
                setTasks(prev => prev.filter(t => t.ID !== item.taskId));
                message.success('删除成功');
            } else {
                message.error('删除失败');
            }
        });
    }, [addr, mainSubGroup]);

    // 添加新条目
    const handleAdd = useCallback(() => {
        addForm.validateFields().then((values) => {
            if (!addr || !mainSubGroup) return;
            
            setAddLoading(true);
            
            const title = values.title?.trim() || '';
            const extra = createDefaultLibraryExtra();
            extra.pictureAddress = addCoverUrl.trim() || '';
            extra.author = values.author || '';
            extra.year = values.year !== undefined && values.year !== null && values.year !== ''
                ? Number(values.year)
                : undefined;
            extra.remark = values.remark?.trim() || '';
            extra.category = values.category?.trim() || '';
            
            const req: CreateTaskReq = {
                UserID: addr.userID,
                DirID: addr.getLastDirID(),
                GroupID: addr.getLastGroupID(),
                SubGroupID: mainSubGroup.ID,
                ParentTask: 0,
                Title: title,
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
                    setAddCoverUrl('');
                    addForm.resetFields();
                    loadTasks(mainSubGroup.ID);
                } else {
                    message.error('添加失败');
                }
            });
        });
    }, [addr, addCoverUrl, addForm, mainSubGroup, loadTasks]);

    // 批量修改分类名称
    const handleRenameCategory = useCallback((oldName: string, newName: string) => {
        if (!addr || !mainSubGroup || !newName.trim()) return;
        
        const itemsToUpdate = allItems.filter(item => item.extra.category?.trim() === oldName);
        if (itemsToUpdate.length === 0) return;
        
        let successCount = 0;
        let errorCount = 0;
        
        itemsToUpdate.forEach(item => {
            const originalTask = tasks.find(t => t.ID === item.taskId);
            if (!originalTask) return;
            
            const newExtra = {...item.extra, category: newName.trim()};
            const updatedTask: PTask = {
                ...originalTask,
                Note: serializeLibraryExtra(newExtra),
            };
            
            const req: ChangeTaskReq = {
                DirID: addr.getLastDirID(),
                GroupID: addr.getLastGroupID(),
                SubGroupID: mainSubGroup.ID,
                UserID: addr.userID,
                Data: updatedTask,
            };
            
            sendChangeTask(req, (ret) => {
                if (ret.ok) {
                    successCount++;
                } else {
                    errorCount++;
                }
                
                if (successCount + errorCount === itemsToUpdate.length) {
                    if (errorCount === 0) {
                        message.success(`已将 ${successCount} 个条目的分类改为 "${newName}"`);
                        loadTasks(mainSubGroup.ID);
                    } else {
                        message.warning(`${successCount} 个成功，${errorCount} 个失败`);
                        loadTasks(mainSubGroup.ID);
                    }
                    setEditingCategoryOld(null);
                    setEditingCategoryNew('');
                }
            });
        });
    }, [addr, mainSubGroup, allItems, tasks, loadTasks]);

    // 删除分类（清空该分类下所有条目的分类字段）
    const handleClearCategory = useCallback((categoryName: string) => {
        if (!addr || !mainSubGroup) return;
        
        const itemsToUpdate = allItems.filter(item => item.extra.category?.trim() === categoryName);
        if (itemsToUpdate.length === 0) return;
        
        let successCount = 0;
        let errorCount = 0;
        
        itemsToUpdate.forEach(item => {
            const originalTask = tasks.find(t => t.ID === item.taskId);
            if (!originalTask) return;
            
            const newExtra = {...item.extra, category: ''};
            const updatedTask: PTask = {
                ...originalTask,
                Note: serializeLibraryExtra(newExtra),
            };
            
            const req: ChangeTaskReq = {
                DirID: addr.getLastDirID(),
                GroupID: addr.getLastGroupID(),
                SubGroupID: mainSubGroup.ID,
                UserID: addr.userID,
                Data: updatedTask,
            };
            
            sendChangeTask(req, (ret) => {
                if (ret.ok) {
                    successCount++;
                } else {
                    errorCount++;
                }
                
                if (successCount + errorCount === itemsToUpdate.length) {
                    if (errorCount === 0) {
                        message.success(`已清除 ${successCount} 个条目的分类`);
                        loadTasks(mainSubGroup.ID);
                    } else {
                        message.warning(`${successCount} 个成功，${errorCount} 个失败`);
                        loadTasks(mainSubGroup.ID);
                    }
                }
            });
        });
    }, [addr, mainSubGroup, allItems, tasks, loadTasks]);

    // 快速状态变更菜单
    const getStatusMenuItems = (item: LibraryItemFull) => {
        const items = [
            {
                key: 'none',
                label: '无状态',
                onClick: () => handleQuickStatusChange(item, undefined),
            },
            ...Object.entries(LibraryStatusNames).map(([status, name]) => ({
            key: status,
            label: name,
            onClick: () => {
                const numStatus = Number(status) as LibraryItemStatus;
                handleQuickStatusChange(item, numStatus);
            },
        })),
        ];
        return items;
    };

    // 格式化日期显示
    const formatDate = (dateStr: string) => {
        if (!dateStr) return '';
        const date = new Date(dateStr);
        return `${date.getMonth() + 1}/${date.getDate()}`;
    };

    const formatDateTime = (dateStr: string) => {
        if (!dateStr) return '-';
        const date = new Date(dateStr);
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
    };

    // 获取开始时间（第一个周目的开始时间）
    const getStartTime = (extra: LibraryItemFull['extra']) => {
        if (extra.rounds && extra.rounds.length > 0) {
            return extra.rounds[0].startTime;
        }
        return extra.createdAt;
    };

    // 卡片渲染
    const renderCard = (item: LibraryItemFull) => {
        const mainScore = getMainScore(item.extra);
        const placeholderColor = getLibraryCoverPaletteByTitle(item.title);
        const coverUrl = getLibraryCoverDisplayUrl(item.title, item.extra.pictureAddress);
        const showCategoryOnCard = displayOptions.showCategory && selectedCategory === 'all' && item.extra.category;
        const currentRoundName = item.extra.rounds[item.extra.currentRound]?.name || '-';
        const displayStatus = getDisplayStatusInfo(item.extra);
        const showRoundTag = currentRoundName && currentRoundName !== '首周目';
        const showScoreBadge = displayOptions.showScore && !!mainScore;
        const scoreStarColor = getScoreStarColor(mainScore?.score || 0);
        
        return (
            <div
                key={item.taskId}
                className="library-card"
                onClick={() => {
                    setDetailItem(item);
                    setShowDetail(true);
                }}
            >
                {/* 封面图 */}
                <div className="library-card-cover">
                    {coverUrl ? (
                        <img
                            src={coverUrl}
                            alt={item.title}
                            onError={(e) => {
                                (e.target as HTMLImageElement).style.display = 'none';
                                // 显示备用占位符
                                const parent = (e.target as HTMLImageElement).parentElement;
                                if (parent) {
                                    const placeholder = parent.querySelector('.library-card-placeholder') as HTMLElement;
                                    if (placeholder) {
                                        placeholder.style.display = 'flex';
                                    }
                                }
                            }}
                        />
                    ) : null}
                    {/* 占位符（无图片或图片加载失败时显示） */}
                    <div 
                        className="library-card-placeholder"
                        style={{
                            background: placeholderColor.bg,
                            display: coverUrl ? 'none' : 'flex',
                        }}
                    >
                        <span 
                            className="library-card-placeholder-text"
                            style={{color: placeholderColor.text}}
                        >
                            {item.title}
                        </span>
                    </div>
                    
                    {/* 顶部标签行（左：分类/周目，右：评分） */}
                    {(showCategoryOnCard || showRoundTag || showScoreBadge) ? (
                        <div className="library-card-top-row">
                            <div className="library-card-category-badge">
                                <Space size={4} align="center" style={{height:"100%"}}>
                                    {showCategoryOnCard ? <Tag color="blue"
                                        className='library-card-category-tag'
                                    >{item.extra.category}</Tag> : null}
                                    {showRoundTag ? <Tag color="geekblue" className='library-card-round-tag'>{currentRoundName}</Tag> : null}
                                </Space>
                            </div>

                            {showScoreBadge ? (
                                <div
                                    className="library-card-score-badge"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setScoreModalItem(item);
                                    }}
                                >
                                    <StarFilled className="library-card-score-star" style={{color: scoreStarColor}} />
                                    <span>{getScoreText(mainScore!.score || 0, mainScore!.scorePlus, mainScore!.scoreSub)}</span>
                                </div>
                            ) : null}
                        </div>
                    ) : null}
                </div>
                
                {/* 底部信息条 */}
                <div className="library-card-footer">
                    <div className="library-card-footer-left">
                        <span className="library-card-name">{item.title}</span>
                        {/* 额外信息行 */}
                        <div className="library-card-meta">
                            {displayOptions.showAuthor && item.extra.author && (
                                <span className="library-card-meta-item">{item.extra.author}</span>
                            )}
                            {displayOptions.showStartTime && (
                                <span className="library-card-meta-item">开始: {formatDate(getStartTime(item.extra))}</span>
                            )}
                            {displayOptions.showUpdateTime && (
                                <span className="library-card-meta-item">更新: {formatDate(item.extra.updatedAt)}</span>
                            )}
                        </div>
                    </div>
                    <Dropdown
                        menu={{items: getStatusMenuItems(item)}}
                        trigger={['click']}
                        placement="topRight"
                    >
                        <Tag
                            color={displayStatus.color}
                            className="library-card-status"
                            onClick={(e) => e.stopPropagation()}
                        >
                            {displayStatus.name}
                        </Tag>
                    </Dropdown>
                </div>
            </div>
        );
    };

    // 显示选项面板
    const displayOptionsContent = (
        <div style={{width: 180}}>
            <div style={{marginBottom: 8, fontWeight: 500}}>卡片显示选项</div>
            <Space direction="vertical" size={4}>
                <Checkbox
                    checked={displayOptions.showScore}
                    onChange={(e) => setDisplayOptions({...displayOptions, showScore: e.target.checked})}
                >
                    显示评分
                </Checkbox>
                <Checkbox
                    checked={displayOptions.showCategory}
                    onChange={(e) => setDisplayOptions({...displayOptions, showCategory: e.target.checked})}
                >
                    显示分类
                </Checkbox>
                <Checkbox
                    checked={displayOptions.showAuthor}
                    onChange={(e) => setDisplayOptions({...displayOptions, showAuthor: e.target.checked})}
                >
                    显示作者
                </Checkbox>
                <Checkbox
                    checked={displayOptions.showStartTime}
                    onChange={(e) => setDisplayOptions({...displayOptions, showStartTime: e.target.checked})}
                >
                    显示开始时间
                </Checkbox>
                <Checkbox
                    checked={displayOptions.showUpdateTime}
                    onChange={(e) => setDisplayOptions({...displayOptions, showUpdateTime: e.target.checked})}
                >
                    显示更新时间
                </Checkbox>
            </Space>
        </div>
    );

    const mobileModalWidth = 'calc(100vw - 16px)';

    if (!addr) {
        return <Empty description="请选择一个 Library 分组"/>;
    }

    return (
        <div className="library-container">
            {/* 标题和工具栏 */}
            <Flex
                className="library-toolbar"
                justify="space-between"
                align="center"
                wrap="wrap"
                gap={8}
                style={{marginBottom: 16}}
            >
                <Space className="library-toolbar-title">
                    <AppstoreOutlined style={{fontSize: 20}}/>
                    <span style={{fontSize: 18, fontWeight: 500}}>{groupTitle}</span>
                    <Tag>{filteredItems.length} 项</Tag>
                </Space>
                
                <div className="library-toolbar-actions">
                    <Popover
                        content={displayOptionsContent}
                        trigger="click"
                        placement="bottomRight"
                    >
                        <Button className="library-toolbar-btn" icon={<EyeOutlined/>}>
                            显示
                        </Button>
                    </Popover>
                    <Button
                        className="library-toolbar-btn"
                        icon={<ClockCircleOutlined/>}
                        onClick={() => setShowTimeline(true)}
                    >
                        时间线
                    </Button>
                    <Button
                        className="library-toolbar-btn"
                        icon={<SettingOutlined/>}
                        onClick={() => setShowCategoryManager(true)}
                    >
                        分类管理
                    </Button>
                    <Button
                        className="library-toolbar-btn"
                        type="primary"
                        icon={<PlusOutlined/>}
                        onClick={() => setShowAdd(true)}
                    >
                        添加
                    </Button>
                </div>
            </Flex>
            
            {/* 筛选栏 */}
            <Flex className="library-filter-bar" wrap="wrap" gap={8} style={{marginBottom: 16}}>
                <Input
                    className="library-filter-search"
                    placeholder="搜索名称/作者..."
                    prefix={<SearchOutlined/>}
                    value={searchText}
                    onChange={(e) => setSearchText(e.target.value)}
                    style={{width: isMobile ? '100%' : 200}}
                    allowClear
                />
                
                <Select
                    className="library-filter-category"
                    value={selectedCategory}
                    onChange={setSelectedCategory}
                    style={{width: isMobile ? 'calc(50% - 4px)' : 140}}
                    options={[
                        {value: 'all', label: `全部分类 (${allItems.length})`},
                        ...categories.map(cat => ({
                            value: cat, 
                            label: `${cat} (${categoryCount.get(cat) || 0})`
                        })),
                        ...(categoryCount.has('未分类') ? [{
                            value: '_uncategorized_', 
                            label: `未分类 (${categoryCount.get('未分类') || 0})`
                        }] : []),
                    ]}
                />
                
                <Select
                    className="library-filter-status"
                    value={statusFilter}
                    onChange={setStatusFilter}
                    style={{width: isMobile ? 'calc(50% - 4px)' : 120}}
                    suffixIcon={<FilterOutlined/>}
                    options={[
                        {value: 'all', label: '全部状态'},
                        {value: 'none', label: '无状态'},
                        ...Object.entries(LibraryStatusNames).map(([k, v]) => ({
                            value: Number(k),
                            label: v,
                        })),
                        {value: LIBRARY_WAIT_EXPIRED_FILTER, label: '搁置放弃'},
                    ]}
                />

                {statusFilter === LibraryItemStatus.TODO ? (
                    <Select
                        className="library-filter-todo-reason"
                        value={todoReasonFilter}
                        onChange={setTodoReasonFilter}
                        style={{width: isMobile ? '100%' : 220}}
                        options={[
                            {value: 'all', label: '全部等待二级状态'},
                            ...todoReasonOptions.map(reason => ({value: reason, label: reason})),
                        ]}
                    />
                ) : null}
                
                <Select
                    className="library-filter-sort"
                    value={sortBy}
                    onChange={setSortBy}
                    style={{width: isMobile ? 'calc(50% - 4px)' : 140}}
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
            
            {/* Steam 风格照片墙 */}
            <Spin spinning={loading}>
                {filteredItems.length === 0 ? (
                    <Empty 
                        description="暂无内容"
                        style={{marginTop: 60}}
                    >
                        {/* <Button 
                            type="primary" 
                            icon={<PlusOutlined/>}
                            onClick={() => setShowAdd(true)}
                        >
                            添加第一个条目
                        </Button> */}
                    </Empty>
                ) : (
                    <div className="library-grid">
                        {filteredItems.map(item => renderCard(item))}
                    </div>
                )}
            </Spin>
            
            {/* 添加条目弹窗 */}
            <Modal
                title="添加条目"
                open={showAdd}
                className="library-add-modal"
                onOk={handleAdd}
                onCancel={() => {
                    setShowAdd(false);
                    setAddCoverUrl('');
                    addForm.resetFields();
                }}
                confirmLoading={addLoading}
                width={isMobile ? mobileModalWidth : 500}
                style={{top: isMobile ? 8 : undefined}}
            >
                <div className="library-add-modal-layout">
                    <div className="library-add-cover-column">
                        <div
                            className="library-add-cover-box"
                            onClick={() => checkAddCoverClipboard(false)}
                        >
                            {addPreviewUrl ? (
                                <img src={addPreviewUrl} alt="封面预览" className="library-add-cover-image"/>
                            ) : (
                                <div className="library-add-cover-empty">
                                    <Button type="link" icon={<UploadOutlined/>} loading={addCoverUploading}>
                                        点击上传
                                    </Button>
                                </div>
                            )}
                        </div>
                    </div>

                    <Form form={addForm} layout="vertical" className="library-add-form">
                        <Form.Item
                            name="title"
                            label="名称"
                            rules={[{required: true, message: '请输入名称'}]}
                        >
                            <Input placeholder="请输入名称"/>
                        </Form.Item>

                        <Form.Item
                            name="category"
                            label="分类"
                        >
                            <AutoComplete
                                placeholder="选择或输入新分类"
                                options={categories.map(cat => ({value: cat}))}
                                filterOption={(inputValue, option) =>
                                    option?.value.toLowerCase().includes(inputValue.toLowerCase()) || false
                                }
                            />
                        </Form.Item>

                        <Form.Item name="author" label="作者/制作方">
                            <Input placeholder="请输入作者或制作方"/>
                        </Form.Item>

                        <Form.Item name="year" label="年份">
                            <Input
                                type="number"
                                min={1900}
                                max={3000}
                                placeholder="例如：2024"
                            />
                        </Form.Item>

                        <Form.Item name="remark" label="备注">
                            <Input.TextArea rows={2} placeholder="作品备注（如国家、平台、版本）"/>
                        </Form.Item>
                    </Form>
                </div>
            </Modal>
            
            {/* 分类管理弹窗 */}
            <Modal
                title="分类管理"
                open={showCategoryManager}
                className="library-category-modal"
                onCancel={() => {
                    setShowCategoryManager(false);
                    setNewCategoryName('');
                    setEditingCategoryOld(null);
                    setEditingCategoryNew('');
                }}
                footer={null}
                width={isMobile ? mobileModalWidth : 500}
                style={{top: isMobile ? 8 : undefined}}
            >
                <div style={{marginBottom: 16}}>
                    <Space.Compact style={{width: '100%'}}>
                        <Input
                            placeholder="输入新分类名称"
                            value={newCategoryName}
                            onChange={e => setNewCategoryName(e.target.value)}
                        />
                        <Button
                            type="primary"
                            icon={<PlusOutlined/>}
                            onClick={() => {
                                if (newCategoryName.trim()) {
                                    if (categories.includes(newCategoryName.trim())) {
                                        message.warning('该分类已存在');
                                    } else {
                                        message.info('分类将在添加条目时自动创建');
                                        setNewCategoryName('');
                                    }
                                }
                            }}
                        >
                            提示
                        </Button>
                    </Space.Compact>
                    <div style={{fontSize: 12, color: '#999', marginTop: 4}}>
                        提示：分类会在添加条目时自动出现，无需预先创建
                    </div>
                </div>
                
                {categories.length === 0 ? (
                    <Empty description="暂无分类，添加条目时会自动创建" />
                ) : (
                    <div style={{display: 'flex', flexDirection: 'column', gap: 8}}>
                        {categories.map(cat => (
                            <div
                                key={cat}
                                className="library-category-item"
                                style={{
                                    display: 'flex',
                                    flexDirection: isMobile ? 'column' : 'row',
                                    justifyContent: 'space-between',
                                    alignItems: isMobile ? 'stretch' : 'center',
                                    padding: '12px 16px',
                                    background: '#fafafa',
                                    borderRadius: 8,
                                    gap: isMobile ? 8 : 0,
                                }}
                            >
                                {editingCategoryOld === cat ? (
                                    <div
                                        style={{
                                            flex: 1,
                                            marginRight: isMobile ? 0 : 8,
                                            display: 'flex',
                                            gap: 8,
                                            flexWrap: isMobile ? 'wrap' : 'nowrap',
                                        }}
                                    >
                                        <Input
                                            style={{flex: 1, minWidth: isMobile ? 180 : undefined}}
                                            value={editingCategoryNew}
                                            onChange={e => setEditingCategoryNew(e.target.value)}
                                            placeholder="新分类名称"
                                        />
                                        <Button
                                            type="primary"
                                            onClick={() => handleRenameCategory(cat, editingCategoryNew)}
                                        >
                                            保存
                                        </Button>
                                        <Button
                                            onClick={() => {
                                                setEditingCategoryOld(null);
                                                setEditingCategoryNew('');
                                            }}
                                        >
                                            取消
                                        </Button>
                                    </div>
                                ) : (
                                    <>
                                        <div>
                                            <div style={{fontWeight: 500}}>{cat}</div>
                                            <div style={{fontSize: 12, color: '#999'}}>
                                                {categoryCount.get(cat) || 0} 个条目
                                            </div>
                                        </div>
                                        <Space style={{alignSelf: isMobile ? 'flex-end' : 'auto'}}>
                                            <Button
                                                type="text"
                                                size="small"
                                                icon={<EditOutlined/>}
                                                onClick={() => {
                                                    setEditingCategoryOld(cat);
                                                    setEditingCategoryNew(cat);
                                                }}
                                            />
                                            <Popconfirm
                                                title="清除分类标记？"
                                                description={`将 ${categoryCount.get(cat) || 0} 个条目的分类设为"未分类"`}
                                                onConfirm={() => handleClearCategory(cat)}
                                                okText="确定"
                                                cancelText="取消"
                                            >
                                                <Button
                                                    type="text"
                                                    size="small"
                                                    danger
                                                    icon={<DeleteOutlined/>}
                                                />
                                            </Popconfirm>
                                        </Space>
                                    </>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </Modal>

            <Modal
                title="等待原因（等待二级状态）"
                open={showTodoReasonModal}
                onOk={handleConfirmTodoReason}
                onCancel={() => {
                    setShowTodoReasonModal(false);
                    setPendingTodoItem(null);
                    setTodoReasonInput('');
                }}
            >
                <Input.TextArea
                    rows={3}
                    placeholder="请输入等待原因/二级状态（例如：等字幕、等朋友、片源问题）"
                    value={todoReasonInput}
                    onChange={(e) => setTodoReasonInput(e.target.value)}
                />
            </Modal>
            
            {/* 详情弹窗 */}
            <LibraryDetail
                visible={showDetail}
                item={detailItem}
                subGroupId={mainSubGroup?.ID || 0}
                categories={categories}
                onClose={() => {
                    setShowDetail(false);
                    setDetailItem(null);
                }}
                onSave={(item) => {
                    handleSaveItem(item);
                    setDetailItem(item);
                }}
                onDelete={(item) => {
                    handleDeleteItem(item);
                    setShowDetail(false);
                    setDetailItem(null);
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
                        setShowTimeline(false);
                        setShowDetail(true);
                    }
                }}
            />

            {/* 评分详情弹窗 */}
            <Modal
                title="评分详情"
                open={!!scoreModalItem}
                onCancel={() => setScoreModalItem(null)}
                footer={[
                    <Button key="close" onClick={() => setScoreModalItem(null)}>
                        关闭
                    </Button>
                ]}
                width={isMobile ? '100%' : 420}
                style={{top: 20}}
            >
                {scoreModalItem ? (
                    <LibraryScorePopover
                        extra={scoreModalItem.extra}
                        mainScoreOverride={getMainScore(scoreModalItem.extra) || undefined}
                    />
                ) : null}
            </Modal>
        </div>
    );
}
