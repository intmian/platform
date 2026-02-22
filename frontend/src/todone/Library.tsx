import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
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
    Divider,
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
    StarOutlined,
    UploadOutlined,
} from '@ant-design/icons';
import {Addr} from './addr';
import {
    LibraryItemFull,
    LibraryItemStatus,
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
    canUpdateReasonOnSameStatus,
    createDefaultLibraryExtra,
    deriveLibraryMeta,
    LibraryDerivedMeta,
    LIBRARY_CARD_HOVER_EFFECT_CONFIG,
    LIBRARY_WAIT_EXPIRED_FILTER,
    LIBRARY_WAIT_EXPIRED_RULE_TEXT,
    getLibraryCoverPaletteByTitle,
    getScoreStarColor,
    getScoreText,
    parseLibraryFromTask,
    serializeLibraryExtra,
    startNewRound,
    touchLibraryUpdatedAt,
} from './libraryUtil';
import {useIsMobile} from '../common/hooksv2';
import LibraryDetail from './LibraryDetail';
import LibraryTimeline from './LibraryTimeline';
import LibraryScorePopover from './LibraryScorePopover';
import {useImageUpload} from '../common/useImageUpload';
import {cropImageToAspectRatio} from '../common/imageCrop';
import './Library.css';

// 排序选项
type SortOption = 'default' | 'index' | 'createdAt' | 'updatedAt' | 'title' | 'score';
type StatusFilterOption = LibraryItemStatus | 'none' | typeof LIBRARY_WAIT_EXPIRED_FILTER;

const STATUS_FILTER_OPTIONS: StatusFilterOption[] = [
    LibraryItemStatus.DOING,
    LibraryItemStatus.WAIT,
    'none',
    LibraryItemStatus.TODO,
    LibraryItemStatus.DONE,
    LIBRARY_WAIT_EXPIRED_FILTER,
    LibraryItemStatus.GIVE_UP,
    LibraryItemStatus.ARCHIVED,
];

const DEFAULT_STATUS_FILTER_OPTIONS: StatusFilterOption[] = [
    LibraryItemStatus.DOING,
    LibraryItemStatus.WAIT,
];

const STATUS_FILTER_LABELS: Record<string, string> = {
    [LibraryItemStatus.DOING]: '进行中',
    [LibraryItemStatus.WAIT]: '搁置',
    none: '无状态',
    [LibraryItemStatus.TODO]: '等待',
    [LibraryItemStatus.DONE]: '已完成',
    [LIBRARY_WAIT_EXPIRED_FILTER]: '鸽了',
    [LibraryItemStatus.GIVE_UP]: '放弃',
    [LibraryItemStatus.ARCHIVED]: '归档',
};

const DEFAULT_SORT_STATUS_ORDER: Record<string, number> = {
    [LibraryItemStatus.DOING]: 0,
    [LibraryItemStatus.WAIT]: 1,
    none: 2,
    [LibraryItemStatus.TODO]: 3,
    [LibraryItemStatus.DONE]: 4,
    [LIBRARY_WAIT_EXPIRED_FILTER]: 5,
    [LibraryItemStatus.GIVE_UP]: 6,
    [LibraryItemStatus.ARCHIVED]: 7,
};

// 默认的 SubGroup 名称（用于存储所有 Library 条目）
const DEFAULT_SUBGROUP_NAME = '_library_items_';

interface LibraryProps {
    addr: Addr | null;
    groupTitle: string;
}

interface LibraryItemWithDerived extends LibraryItemFull {
    derived: LibraryDerivedMeta;
    normalizedCategory: string;
    searchIndex: string;
}

function getStatusTextColor(bg: string): string {
    const hex = bg.replace('#', '').trim();
    if (hex.length !== 6) {
        return '#ffffff';
    }
    const r = Number.parseInt(hex.slice(0, 2), 16);
    const g = Number.parseInt(hex.slice(2, 4), 16);
    const b = Number.parseInt(hex.slice(4, 6), 16);
    if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) {
        return '#ffffff';
    }
    const brightness = (r * 299 + g * 587 + b * 114) / 1000;
    return brightness >= 160 ? '#1f1f1f' : '#ffffff';
}

function getItemDerivedMeta(item: LibraryItemFull): LibraryDerivedMeta {
    const maybeWithDerived = item as LibraryItemFull & {derived?: LibraryDerivedMeta};
    return maybeWithDerived.derived || deriveLibraryMeta(item.extra);
}

function AutoScrollTitle({text}: {text: string}) {
    const containerRef = useRef<HTMLDivElement>(null);
    const contentRef = useRef<HTMLSpanElement>(null);
    const textRef = useRef<HTMLSpanElement>(null);
    const [overflowDistance, setOverflowDistance] = useState(0);
    const [loopWidth, setLoopWidth] = useState(0);
    const loopText = `${text}\u00A0\u00A0`;

    useEffect(() => {
        const measure = () => {
            const container = containerRef.current;
            const primaryText = textRef.current ?? contentRef.current;
            if (!container || !primaryText) {
                setOverflowDistance(0);
                setLoopWidth(0);
                return;
            }

            const width = Math.ceil(primaryText.scrollWidth);
            const distance = Math.max(0, width - container.clientWidth);
            setOverflowDistance(distance);
            setLoopWidth(width);
        };

        measure();
        const observer = new ResizeObserver(() => measure());
        if (containerRef.current) {
            observer.observe(containerRef.current);
        }
        if (contentRef.current) {
            observer.observe(contentRef.current);
        }
        if (textRef.current) {
            observer.observe(textRef.current);
        }
        return () => observer.disconnect();
    }, [text]);

    useEffect(() => {
        const content = contentRef.current;
        if (!content || overflowDistance <= 0 || loopWidth <= 0) {
            if (content) {
                content.style.transform = 'translateX(0px)';
            }
            return;
        }

        const pauseMs = 1000;
        const speedPxPerSecond = 22;
        let rafId = 0;
        let phase: 'pause' | 'scroll' = 'pause';
        let elapsedInPhase = 0;
        let offset = 0;
        let lastTs = 0;

        const tick = (ts: number) => {
            if (!contentRef.current) {
                return;
            }

            if (!lastTs) {
                lastTs = ts;
            }
            const dt = ts - lastTs;
            lastTs = ts;

            if (phase === 'pause') {
                elapsedInPhase += dt;
                if (elapsedInPhase >= pauseMs) {
                    phase = 'scroll';
                }
            } else {
                const delta = (dt / 1000) * speedPxPerSecond;
                offset -= delta;
                if (Math.abs(offset) >= loopWidth) {
                    offset += loopWidth;
                }
                contentRef.current.style.transform = `translateX(${offset}px)`;
            }

            rafId = window.requestAnimationFrame(tick);
        };

        content.style.transform = 'translateX(0px)';
        rafId = window.requestAnimationFrame(tick);

        return () => {
            window.cancelAnimationFrame(rafId);
        };
    }, [overflowDistance, loopWidth]);

    return (
        <div
            ref={containerRef}
            className={`library-card-title-window${overflowDistance > 0 ? ' is-scrolling' : ''}`}
        >
            {overflowDistance > 0 ? (
                <span ref={contentRef} className="library-card-title-content is-scrolling">
                    <span ref={textRef} className="library-card-title-text">{loopText}</span>
                    <span className="library-card-title-text" aria-hidden="true">{loopText}</span>
                </span>
            ) : (
                <span ref={contentRef} className="library-card-title-content">{text}</span>
            )}
        </div>
    );
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
    const [selectedStatuses, setSelectedStatuses] = useState<StatusFilterOption[]>(DEFAULT_STATUS_FILTER_OPTIONS);
    const [statusFilterOpen, setStatusFilterOpen] = useState(false);
    const [todoReasonFilter, setTodoReasonFilter] = useState<string>('all');
    const [sortBy, setSortBy] = useState<SortOption>('default');
    const [searchText, setSearchText] = useState('');

    // 列表状态切换（等待/搁置可输入原因）
    const [showStatusReasonModal, setShowStatusReasonModal] = useState(false);
    const [statusReasonInput, setStatusReasonInput] = useState('');
    const [pendingStatusItem, setPendingStatusItem] = useState<LibraryItemFull | null>(null);
    const [pendingStatus, setPendingStatus] = useState<LibraryItemStatus | null>(null);
    const [showNewRoundModal, setShowNewRoundModal] = useState(false);
    const [newRoundNameInput, setNewRoundNameInput] = useState('');
    const [pendingNewRoundItem, setPendingNewRoundItem] = useState<LibraryItemFull | null>(null);
    
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
            message.success('封面已上传并裁剪为 2:3');
        },
        undefined,
        {
            beforeUpload: async (file) => {
                try {
                    return await cropImageToAspectRatio(file, 2, 3);
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
    const [cardMenuVisible, setCardMenuVisible] = useState(false);
    const [cardMenuPosition, setCardMenuPosition] = useState<{x: number; y: number} | null>(null);
    const [cardMenuItem, setCardMenuItem] = useState<LibraryItemFull | null>(null);
    
    // 显示选项
    const [showDisplayOptions, setShowDisplayOptions] = useState(false);
    const [displayOptions, setDisplayOptions] = useState({
        showScore: true,        // 显示评分
        showCategory: true,     // 显示分类（仅在全部分类时有效）
        showUpdateTime: false,  // 显示更新时间
        showStartTime: false,   // 显示开始时间
        showAuthor: false,      // 显示作者
    });
    const [waitExpiredTick, setWaitExpiredTick] = useState(0);
    const listPerfRef = useRef({filterComputeMs: 0, filterComputeDoneAt: 0});

    useEffect(() => {
        const timer = window.setInterval(() => {
            setWaitExpiredTick((prev) => prev + 1);
        }, 60 * 1000);
        return () => window.clearInterval(timer);
    }, []);

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
        if (!selectedStatuses.includes(LibraryItemStatus.TODO)) {
            setTodoReasonFilter('all');
        }
    }, [selectedStatuses]);

    // 转换为带派生元数据的条目列表（单条仅一次日志扫描）
    const allItems: LibraryItemWithDerived[] = useMemo(() => {
        const nowMs = Date.now();
        return tasks.map((task) => {
            const item = parseLibraryFromTask(task);
            const normalizedCategory = item.extra.category?.trim() || '';
            const normalizedAuthor = item.extra.author?.trim() || '';
            return {
                ...item,
                derived: deriveLibraryMeta(item.extra, nowMs),
                normalizedCategory,
                searchIndex: `${item.title}\n${normalizedAuthor}\n${normalizedCategory}`.toLowerCase(),
            };
        });
    }, [tasks, waitExpiredTick]);

    const taskById = useMemo(() => {
        const result = new Map<number, PTask>();
        tasks.forEach((task) => {
            result.set(task.ID, task);
        });
        return result;
    }, [tasks]);

    // 提取所有分类（从 extra.category 字段）
    const categories: string[] = useMemo(() => {
        const categorySet = new Set<string>();
        allItems.forEach(item => {
            if (item.normalizedCategory) {
                categorySet.add(item.normalizedCategory);
            }
        });
        return Array.from(categorySet).sort((a, b) => a.localeCompare(b, 'zh-CN'));
    }, [allItems]);

    // 每个分类的条目数量
    const categoryCount: Map<string, number> = useMemo(() => {
        const countMap = new Map<string, number>();
        allItems.forEach(item => {
            const cat = item.normalizedCategory || '未分类';
            countMap.set(cat, (countMap.get(cat) || 0) + 1);
        });
        return countMap;
    }, [allItems]);

    const todoReasonOptions: string[] = useMemo(() => {
        const reasonSet = new Set<string>();
        allItems.forEach(item => {
            if (item.derived.statusSnapshot.status === LibraryItemStatus.TODO) {
                const reason = item.derived.statusSnapshot.todoReason;
                if (reason) {
                    reasonSet.add(reason);
                }
            }
        });
        return Array.from(reasonSet).sort((a, b) => a.localeCompare(b, 'zh-CN'));
    }, [allItems]);

    const statusFilterSummary = useMemo(() => {
        if (selectedStatuses.length === 0) {
            return '状态（未选）';
        }
        if (selectedStatuses.length === 1) {
            return STATUS_FILTER_LABELS[String(selectedStatuses[0])] || '状态';
        }
        return `状态（${selectedStatuses.length}）`;
    }, [selectedStatuses]);

    const toggleStatusFilterOption = useCallback((status: StatusFilterOption) => {
        setSelectedStatuses((prev) => {
            if (prev.includes(status)) {
                return prev.filter((item) => item !== status);
            }
            return [...prev, status];
        });
    }, []);

    const selectOnlyStatusFilterOption = useCallback((status: StatusFilterOption) => {
        setSelectedStatuses([status]);
        setStatusFilterOpen(false);
    }, []);

    const selectAllStatusFilterOptions = useCallback(() => {
        setSelectedStatuses([...STATUS_FILTER_OPTIONS]);
    }, []);

    const getItemStatusForFilter = useCallback((item: LibraryItemWithDerived): StatusFilterOption => {
        const currentStatus = item.derived.statusSnapshot.status;
        if (currentStatus === LibraryItemStatus.ARCHIVED) {
            return LibraryItemStatus.ARCHIVED;
        }
        if (item.derived.isWaitExpired) {
            return LIBRARY_WAIT_EXPIRED_FILTER;
        }
        if (currentStatus === undefined) {
            return 'none';
        }
        return currentStatus;
    }, []);

    const compareByDefaultSort = useCallback((a: LibraryItemWithDerived, b: LibraryItemWithDerived) => {
        // 默认排序口径：先按状态分组，再在“同状态 + 同分类”内让收藏条目置顶。
        const statusA = getItemStatusForFilter(a);
        const statusB = getItemStatusForFilter(b);
        const rankA = DEFAULT_SORT_STATUS_ORDER[String(statusA)] ?? Number.MAX_SAFE_INTEGER;
        const rankB = DEFAULT_SORT_STATUS_ORDER[String(statusB)] ?? Number.MAX_SAFE_INTEGER;
        if (rankA !== rankB) {
            return rankA - rankB;
        }

        const categoryA = a.normalizedCategory;
        const categoryB = b.normalizedCategory;
        if (categoryA === categoryB && !!a.extra.isFavorite !== !!b.extra.isFavorite) {
            return a.extra.isFavorite ? -1 : 1;
        }

        return b.derived.updatedAtMs - a.derived.updatedAtMs;
    }, [getItemStatusForFilter]);

    // 应用筛选和排序
    const filteredItems = useMemo(() => {
        const computeStart = performance.now();
        let result = [...allItems];
        
        if (selectedCategory !== 'all') {
            if (selectedCategory === '_uncategorized_') {
                result = result.filter(item => !item.normalizedCategory);
            } else {
                result = result.filter(item => item.normalizedCategory === selectedCategory);
            }
        }
        
        if (selectedStatuses.length > 0) {
            result = result.filter(item => selectedStatuses.includes(getItemStatusForFilter(item)));
        } else {
            result = [];
        }

        if (selectedStatuses.includes(LibraryItemStatus.TODO) && todoReasonFilter !== 'all') {
            result = result.filter(item => item.derived.statusSnapshot.todoReason === todoReasonFilter);
        }
        
        if (searchText.trim()) {
            const search = searchText.toLowerCase();
            result = result.filter(item => item.searchIndex.includes(search));
        }
        
        result.sort((a, b) => {
            switch (sortBy) {
                case 'default':
                    return compareByDefaultSort(a, b);
                case 'index':
                    return a.index - b.index;
                case 'createdAt':
                    return b.derived.createdAtMs - a.derived.createdAtMs;
                case 'updatedAt':
                    return b.derived.updatedAtMs - a.derived.updatedAtMs;
                case 'title':
                    return a.title.localeCompare(b.title, 'zh-CN');
                case 'score': {
                    const scoreA = a.derived.mainScore?.score || 0;
                    const scoreB = b.derived.mainScore?.score || 0;
                    return scoreB - scoreA;
                }
                default:
                    return 0;
            }
        });
        
        listPerfRef.current.filterComputeMs = performance.now() - computeStart;
        listPerfRef.current.filterComputeDoneAt = performance.now();
        return result;
    }, [allItems, selectedCategory, selectedStatuses, getItemStatusForFilter, todoReasonFilter, searchText, sortBy, compareByDefaultSort]);

    useEffect(() => {
        if (!import.meta.env.DEV) {
            return;
        }
        const commitMs = Math.max(0, performance.now() - listPerfRef.current.filterComputeDoneAt);
        // 用于改造前后对比的性能证据：列表筛选+排序计算和 commit 耗时。
        console.debug(
            `[LibraryPerf] items=${allItems.length}, filtered=${filteredItems.length}, compute=${listPerfRef.current.filterComputeMs.toFixed(2)}ms, commit=${commitMs.toFixed(2)}ms`,
        );
    }, [allItems, filteredItems, selectedCategory, selectedStatuses, todoReasonFilter, searchText, sortBy]);

    // 保存 item 变更
    const handleSaveItem = useCallback((item: LibraryItemFull) => {
        if (!addr || !mainSubGroup) return;
        
        const originalTask = taskById.get(item.taskId);
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
                const savedItem = parseLibraryFromTask(updatedTask);
                setDetailItem(prev => prev && prev.taskId === item.taskId ? savedItem : prev);
                message.success('保存成功');
            } else {
                message.error('保存失败');
            }
        });
    }, [addr, mainSubGroup, taskById]);

    const handleQuickStatusChange = useCallback((item: LibraryItemFull, status?: LibraryItemStatus) => {
        const derived = getItemDerivedMeta(item);
        if (status === LibraryItemStatus.TODO || status === LibraryItemStatus.WAIT) {
            setPendingStatusItem(item);
            setPendingStatus(status);
            setStatusReasonInput(status === LibraryItemStatus.TODO ? derived.statusSnapshot.todoReason : derived.latestWaitReason);
            setShowStatusReasonModal(true);
            return;
        }
        // 防止重复操作
        if (derived.statusSnapshot.status === status && !canUpdateReasonOnSameStatus(status)) {
            return;
        }
        // 如果当前周目已结束，再次开始需要确认并建议新周目
        const currentRound = item.extra.rounds[item.extra.currentRound];
        const roundEnded = !!currentRound?.endTime;
        if (roundEnded && status === LibraryItemStatus.DOING) {
            Modal.confirm({
                title: '本周目已结束',
                content: (
                    <div>
                        当前周目已在 {currentRound?.endTime} 完成。
                        <br />建议通过“新周目”按钮创建新周目，然后再开始。
                        <br />确定要继续在本周目内开始吗？
                    </div>
                ),
                onOk: () => {
                    const newExtra = addStatusLog({...item.extra}, status);
                    const newItem = {...item, extra: newExtra};
                    handleSaveItem(newItem);
                },
            });
            return;
        }

        const newExtra = addStatusLog({...item.extra}, status);
        const newItem = {...item, extra: newExtra};
        handleSaveItem(newItem);
    }, [handleSaveItem]);

    const handleRefreshItem = useCallback((item: LibraryItemFull) => {
        const newExtra = touchLibraryUpdatedAt({...item.extra});
        const newItem = {...item, extra: newExtra};
        handleSaveItem(newItem);
    }, [handleSaveItem]);

    const handleToggleFavorite = useCallback((item: LibraryItemFull) => {
        const newItem: LibraryItemFull = {
            ...item,
            extra: {
                ...item.extra,
                isFavorite: !item.extra.isFavorite,
            },
        };
        handleSaveItem(newItem);
    }, [handleSaveItem]);

    const handleConfirmStatusReason = useCallback(() => {
        if (!pendingStatusItem || pendingStatus === null) return;
        const reason = statusReasonInput.trim();
        if (pendingStatus === LibraryItemStatus.TODO && !reason) {
            message.warning('请输入等待原因');
            return;
        }
        const newExtra = addStatusLog({...pendingStatusItem.extra}, pendingStatus, reason);
        const newItem = {...pendingStatusItem, extra: newExtra};
        handleSaveItem(newItem);
        setShowStatusReasonModal(false);
        setPendingStatusItem(null);
        setPendingStatus(null);
        setStatusReasonInput('');
    }, [pendingStatusItem, pendingStatus, statusReasonInput, handleSaveItem]);

    const handleQuickStartNewRound = useCallback((item: LibraryItemFull, roundName: string) => {
        const finalRoundName = roundName.trim();
        if (!finalRoundName) {
            message.warning('请输入周目名称');
            return false;
        }
        const newExtra = startNewRound({...item.extra}, finalRoundName);
        const newItem = {...item, extra: newExtra};
        handleSaveItem(newItem);
        message.success(`已开始${finalRoundName}`);
        return true;
    }, [handleSaveItem]);

    const openQuickNewRoundModal = useCallback((item: LibraryItemFull) => {
        const nextRoundName = `第${item.extra.rounds.length + 1}周目`;
        setPendingNewRoundItem(item);
        setNewRoundNameInput(nextRoundName);
        setShowNewRoundModal(true);
    }, []);

    const handleConfirmQuickNewRound = useCallback(() => {
        if (!pendingNewRoundItem) {
            return;
        }
        const ok = handleQuickStartNewRound(pendingNewRoundItem, newRoundNameInput);
        if (!ok) {
            return;
        }
        setShowNewRoundModal(false);
        setPendingNewRoundItem(null);
        setNewRoundNameInput('');
    }, [handleQuickStartNewRound, newRoundNameInput, pendingNewRoundItem]);

    const handleCardContextMenu = useCallback((e: React.MouseEvent, item: LibraryItemFull) => {
        e.preventDefault();
        e.stopPropagation();
        setCardMenuItem(item);
        setCardMenuPosition({x: e.clientX, y: e.clientY});
        setCardMenuVisible(true);
    }, []);

    const handleCardMenuClick = ({key}: {key: string}) => {
        const item = cardMenuItem;
        if (!item) return;

        if (key.startsWith('status:')) {
            const value = key.slice('status:'.length);
            if (value === 'none') {
                handleQuickStatusChange(item, undefined);
            } else {
                handleQuickStatusChange(item, Number(value) as LibraryItemStatus);
            }
            setCardMenuVisible(false);
            return;
        }

        if (key === 'new-round') {
            openQuickNewRoundModal(item);
            setCardMenuVisible(false);
            return;
        }

        if (key.startsWith('category:')) {
            const nextCategory = key.slice('category:'.length);
            const normalizedCategory = nextCategory === '_uncategorized_' ? '' : nextCategory;
            const newItem: LibraryItemFull = {
                ...item,
                extra: {
                    ...item.extra,
                    category: normalizedCategory,
                },
            };
            handleSaveItem(newItem);
            setCardMenuVisible(false);
            return;
        }

        if (key === 'refresh') {
            handleRefreshItem(item);
            setCardMenuVisible(false);
            return;
        }

        if (key === 'favorite') {
            handleToggleFavorite(item);
            setCardMenuVisible(false);
            return;
        }

        if (key === 'delete') {
            Modal.confirm({
                title: '确认删除',
                content: `确认要删除《${item.title}》吗？此操作不可恢复。`,
                okText: '删除',
                okButtonProps: {danger: true},
                cancelText: '取消',
                onOk: () => handleDeleteItem(item),
            });
            setCardMenuVisible(false);
        }
    };

    const getCardContextMenuItems = (item: LibraryItemFull) => {
        return [
            {
                key: 'status',
                label: '切换状态',
                children: [
                    {key: 'status:none', label: '无状态'},
                    ...Object.entries(LibraryStatusNames).map(([status, name]) => ({
                        key: `status:${status}`,
                        label: name,
                    })),
                ],
            },
            {type: 'divider' as const},
            {
                key: 'new-round',
                label: `开始新周目（第${item.extra.rounds.length + 1}周目）`,
            },
            {
                key: 'category',
                label: '设置分类',
                children: [
                    {key: 'category:_uncategorized_', label: '未分类'},
                    ...categories.map((cat) => ({
                        key: `category:${cat}`,
                        label: cat,
                    })),
                ],
            },
            {
                key: 'favorite',
                label: item.extra.isFavorite ? '取消收藏' : '收藏',
            },
            {
                key: 'refresh',
                label: '刷新',
            },
            {type: 'divider' as const},
            {
                key: 'delete',
                label: <span style={{color: '#ff4d4f'}}>删除</span>,
            },
        ];
    };

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
            let extra = createDefaultLibraryExtra();
            extra.pictureAddress = addCoverUrl.trim() || '';
            extra.author = values.author || '';
            extra.year = values.year !== undefined && values.year !== null && values.year !== ''
                ? Number(values.year)
                : undefined;
            extra.remark = values.remark?.trim() || '';
            extra.category = values.category?.trim() || '';
            // 如果输入了等待原因，直接设置为 todo 并记录原因
            const inputReason = values.todoReason?.trim() || '';
            if (inputReason) {
                extra = addStatusLog(extra, LibraryItemStatus.TODO, inputReason);
            }
            
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
                    if (ret.data.Task) {
                        setDetailItem(parseLibraryFromTask(ret.data.Task));
                        setShowDetail(true);
                    }
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
            const originalTask = taskById.get(item.taskId);
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
    }, [addr, mainSubGroup, allItems, taskById, loadTasks]);

    // 删除分类（清空该分类下所有条目的分类字段）
    const handleClearCategory = useCallback((categoryName: string) => {
        if (!addr || !mainSubGroup) return;
        
        const itemsToUpdate = allItems.filter(item => item.extra.category?.trim() === categoryName);
        if (itemsToUpdate.length === 0) return;
        
        let successCount = 0;
        let errorCount = 0;
        
        itemsToUpdate.forEach(item => {
            const originalTask = taskById.get(item.taskId);
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
    }, [addr, mainSubGroup, allItems, taskById, loadTasks]);

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

    // 卡片渲染
    const renderCard = (item: LibraryItemWithDerived) => {
        const mainScore = item.derived.mainScore;
        const placeholderColor = getLibraryCoverPaletteByTitle(item.title);
        const realCoverUrl = item.extra.pictureAddress?.trim() || '';
        const isPlaceholderCover = realCoverUrl === '';
        const showCategoryOnCard = displayOptions.showCategory && selectedCategory === 'all' && item.extra.category;
        const showFavoriteOnCard = !!item.extra.isFavorite;
        const currentRoundName = item.extra.rounds[item.extra.currentRound]?.name || '-';
        const displayStatus = item.derived.displayStatus;
        const showRoundTag = currentRoundName && currentRoundName !== '首周目';
        const showScoreBadge = displayOptions.showScore && !!mainScore;
        const scoreStarColor = getScoreStarColor(mainScore?.score || 0);
        const statusTextColor = getStatusTextColor(displayStatus.color);
        const currentStatus = item.derived.statusSnapshot.status;
        const todoReason = item.derived.statusSnapshot.todoReason;
        const displayStatusText = currentStatus === LibraryItemStatus.TODO && todoReason
            ? `等待:${todoReason}`
            : displayStatus.name;
        const cardClassName = `library-card ${isPlaceholderCover ? 'is-placeholder' : 'is-real-cover'}`;
        const hoverEffectStyle = {
            '--library-hover-glow-opacity': LIBRARY_CARD_HOVER_EFFECT_CONFIG.realCoverGlowOpacity,
            '--library-hover-shine-opacity': LIBRARY_CARD_HOVER_EFFECT_CONFIG.realCoverShineOpacity,
            '--library-hover-title-duration': `${LIBRARY_CARD_HOVER_EFFECT_CONFIG.titleBarDurationMs}ms`,
            '--library-hover-placeholder-duration': `${LIBRARY_CARD_HOVER_EFFECT_CONFIG.placeholderGradientDurationMs}ms`,
        } as React.CSSProperties;
        
        return (
            <div
                key={item.taskId}
                className={cardClassName}
                style={hoverEffectStyle}
                onContextMenu={(e) => handleCardContextMenu(e, item)}
                onClick={() => {
                    setDetailItem(item);
                    setShowDetail(true);
                }}
            >
                {/* 封面图 */}
                <div className="library-card-cover">
                    {realCoverUrl ? (
                        <img
                            src={realCoverUrl}
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
                                    const cardNode = parent.closest('.library-card');
                                    if (cardNode) {
                                        cardNode.classList.add('is-cover-error');
                                    }
                                }
                            }}
                        />
                    ) : null}
                    {/* 占位符（无图片或图片加载失败时显示） */}
                    <div 
                        className="library-card-placeholder"
                        style={{
                            '--library-placeholder-base': placeholderColor.bg,
                            display: realCoverUrl ? 'none' : 'flex',
                        } as React.CSSProperties}
                    >
                        <span 
                            className="library-card-placeholder-text"
                            style={{color: placeholderColor.text}}
                        >
                            {item.title}
                        </span>
                    </div>
                    
                    {/* 顶部标签行（左：分类/周目，右：评分） */}
                    {(showFavoriteOnCard || showCategoryOnCard || showRoundTag || showScoreBadge) ? (
                        <div className="library-card-top-row">
                            <div className="library-card-category-badge">
                                <Space size={4} align="center" style={{height:"100%"}}>
                                    {showFavoriteOnCard ? (
                                        // <Tag color="gold" className='library-card-category-tag library-card-favorite-tag'>
                                            <StarFilled
                                                style={{color: '#faad14', fontSize: 16}}
                                            />
                                        // </Tag>
                                    ) : null}
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

                    <Dropdown
                        menu={{items: getStatusMenuItems(item)}}
                        trigger={['click']}
                        placement="topRight"
                    >
                        <Tag
                            className="library-card-status-overlay"
                            style={{backgroundColor: displayStatus.color, color: statusTextColor}}
                            onClick={(e) => e.stopPropagation()}
                        >
                            {displayStatusText}
                        </Tag>
                    </Dropdown>
                </div>
                
                {/* 悬浮标题条（仅 hover 显示） */}
                <div className="library-card-hover-title">
                    <div className="library-card-title-row">
                        <AutoScrollTitle text={item.title}/>
                    </div>
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
                    {isMobile ? (
                        <>
                            <Dropdown
                                trigger={['click']}
                                placement="bottomLeft"
                                menu={{
                                    items: [
                                        {key: 'display', icon: <EyeOutlined/>, label: '显示'},
                                        {key: 'timeline', icon: <ClockCircleOutlined/>, label: '时间线'},
                                        {key: 'category', icon: <SettingOutlined/>, label: '分类管理'},
                                    ],
                                    onClick: ({key}) => {
                                        if (key === 'timeline') {
                                            setShowTimeline(true);
                                            return;
                                        }
                                        if (key === 'category') {
                                            setShowCategoryManager(true);
                                            return;
                                        }
                                        if (key === 'display') {
                                            setShowDisplayOptions(true);
                                        }
                                    },
                                }}
                                dropdownRender={(menuNode) => (
                                    <>
                                        {menuNode}
                                        {showDisplayOptions ? (
                                            <div style={{padding: 8, borderTop: '1px solid #f0f0f0'}}>
                                                {displayOptionsContent}
                                            </div>
                                        ) : null}
                                    </>
                                )}
                                onOpenChange={(open) => {
                                    if (!open) {
                                        setShowDisplayOptions(false);
                                    }
                                }}
                            >
                                <Button className="library-toolbar-btn">更多</Button>
                            </Dropdown>
                            <Button
                                className="library-toolbar-btn"
                                type="primary"
                                icon={<PlusOutlined/>}
                                onClick={() => setShowAdd(true)}
                            >
                                添加
                            </Button>
                        </>
                    ) : (
                        <>
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
                        </>
                    )}
                </div>
            </Flex>

            {/* 筛选栏 */}
            <Flex className="library-filter-bar" wrap={isMobile ? 'wrap' : 'nowrap'} gap={8} style={{marginBottom: 16}}>
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
                
                <Dropdown
                    trigger={['click']}
                    open={statusFilterOpen}
                    onOpenChange={setStatusFilterOpen}
                    dropdownRender={() => (
                        <div className="library-status-filter-dropdown">
                            {STATUS_FILTER_OPTIONS.map((status) => (
                                <div key={String(status)} className="library-status-filter-row">
                                    <div className="library-status-filter-check">
                                        <Checkbox
                                            checked={selectedStatuses.includes(status)}
                                            onChange={() => toggleStatusFilterOption(status)}
                                            onClick={(e) => e.stopPropagation()}
                                        />
                                    </div>
                                    <div
                                        className="library-status-filter-label"
                                        onClick={() => selectOnlyStatusFilterOption(status)}
                                    >
                                        {STATUS_FILTER_LABELS[String(status)]}
                                    </div>
                                </div>
                            ))}
                            <Divider style={{margin: '8px 0'}} />
                            <div className="library-status-filter-footer">
                                <Space size={8}>
                                    <Button
                                        size="small"
                                        onClick={() => setSelectedStatuses(DEFAULT_STATUS_FILTER_OPTIONS)}
                                    >
                                        恢复默认
                                    </Button>
                                    <Button
                                        size="small"
                                        onClick={selectAllStatusFilterOptions}
                                    >
                                        选择全部
                                    </Button>
                                </Space>
                            </div>
                        </div>
                    )}
                >
                    <Button
                        className="library-filter-status-trigger"
                        icon={<FilterOutlined/>}
                        style={{width: isMobile ? '100%' : 'auto'}}
                    >
                        {statusFilterSummary}
                    </Button>
                </Dropdown>

                {selectedStatuses.length === 1 && selectedStatuses.includes(LibraryItemStatus.TODO) ? (
                    <Select
                        className="library-filter-todo-reason"
                        value={todoReasonFilter}
                        onChange={setTodoReasonFilter}
                        style={{width: isMobile ? '100%' : 'auto'}}
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
                        {value: 'default', label: '默认排序'},
                        {value: 'updatedAt', label: '最近更新'},
                        {value: 'createdAt', label: '添加时间'},
                        {value: 'title', label: '名称'},
                        {value: 'score', label: '评分'},
                        {value: 'index', label: '原始顺序'},
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

            {cardMenuVisible && cardMenuPosition && cardMenuItem ? (
                <div
                    style={{
                        position: 'fixed',
                        top: cardMenuPosition.y,
                        left: cardMenuPosition.x,
                        zIndex: 1100,
                    }}
                    onContextMenu={(e) => e.preventDefault()}
                    onMouseLeave={() => setCardMenuVisible(false)}
                >
                    <Dropdown
                        menu={{
                            items: getCardContextMenuItems(cardMenuItem),
                            onClick: handleCardMenuClick,
                        }}
                        open={cardMenuVisible}
                        trigger={[]}
                        placement="bottomLeft"
                    >
                        <div />
                    </Dropdown>
                </div>
            ) : null}
            
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
                        <div style={{marginTop: 8, display: 'flex', justifyContent: 'center'}}>
                            <Button
                                danger
                                size="small"
                                icon={<DeleteOutlined/>}
                                disabled={!addCoverUrl.trim()}
                                onClick={() => {
                                    setAddCoverUrl('');
                                    message.success('已删除封面，恢复默认占位图');
                                }}
                            >
                                删除封面
                            </Button>
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

                        {/* 添加等待原因，若填写则创建后状态为等待 */}
                        <Form.Item name="todoReason" label="等待原因">
                            <AutoComplete
                                style={{width: '100%'}}
                                options={todoReasonOptions.map(reason => ({value: reason}))}
                                filterOption={(inputValue, option) =>
                                    option?.value.toLowerCase().includes(inputValue.toLowerCase()) || false
                                }
                            >
                                <Input placeholder="请输入或选择等待原因（可选）" />
                            </AutoComplete>
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
                title={pendingStatus === LibraryItemStatus.TODO ? '等待原因（等待二级状态）' : '搁置原因'}
                open={showStatusReasonModal}
                onOk={handleConfirmStatusReason}
                onCancel={() => {
                    setShowStatusReasonModal(false);
                    setPendingStatusItem(null);
                    setPendingStatus(null);
                    setStatusReasonInput('');
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
                title="开始新周目"
                open={showNewRoundModal}
                onOk={handleConfirmQuickNewRound}
                onCancel={() => {
                    setShowNewRoundModal(false);
                    setPendingNewRoundItem(null);
                    setNewRoundNameInput('');
                }}
            >
                <Input
                    placeholder="请输入周目名称"
                    value={newRoundNameInput}
                    onChange={(e) => setNewRoundNameInput(e.target.value)}
                />
            </Modal>
            
            {/* 详情弹窗 */}
            <LibraryDetail
                visible={showDetail}
                item={detailItem}
                subGroupId={mainSubGroup?.ID || 0}
                categories={categories}
                todoReasonOptions={todoReasonOptions}
                onClose={() => {
                    setShowDetail(false);
                    setDetailItem(null);
                }}
                onSave={(item) => {
                    handleSaveItem(item);
                    setDetailItem(item);
                }}
                onToggleFavorite={(item) => {
                    handleToggleFavorite(item);
                    setDetailItem({...item, extra: {...item.extra, isFavorite: !item.extra.isFavorite}});
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
                items={allItems.filter((item) => item.derived.statusSnapshot.status !== LibraryItemStatus.ARCHIVED)}
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
                        mainScoreOverride={getItemDerivedMeta(scoreModalItem).mainScore || undefined}
                    />
                ) : null}
            </Modal>
        </div>
    );
}
