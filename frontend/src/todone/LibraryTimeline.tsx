import React, {useEffect, useMemo, useRef, useState} from 'react';
import {
    Anchor,
    Button,
    Checkbox,
    Divider,
    Drawer,
    Dropdown,
    Empty,
    Flex,
    message,
    Modal,
    Segmented,
    Select,
    Space,
    Tag,
    Timeline,
    Typography,
} from 'antd';
import {
    CalendarOutlined,
    CheckCircleFilled,
    ClockCircleFilled,
    DownloadOutlined,
    PauseCircleFilled,
    PlusCircleFilled,
    PlayCircleFilled,
    StarFilled,
    FilterOutlined,
    SortAscendingOutlined,
    StopOutlined,
} from '@ant-design/icons';
import {
    LibraryStatusNames,
    LibraryItemFull,
    LibraryItemStatus,
    LibraryLogType,
    LibraryStatusColors,
    TimelineEntry,
} from './net/protocal';
import {
    appendNoCacheParam,
    buildLibraryTitleCoverDataUrl,
    extractTimeline,
    formatDate,
    getLibraryCoverPaletteByTitle,
    getLogTypeText,
    getScoreText,
    groupTimelineByYear,
    isLibraryAutoRoundStartComment,
    isWaitExpired,
} from './libraryUtil';
import {useIsMobile} from '../common/hooksv2';
import LibraryLoadingImage from './LibraryLoadingImage';

const {Text} = Typography;
const UNCATEGORIZED_KEY = '__uncategorized__';
type TimelineStatusOption = LibraryItemStatus | 'addToLibrary' | 'score' | 'waitExpired';
type LibraryTimelineViewMode = 'timeline' | 'scoreGradient';
const WAIT_EXPIRED_TIMELINE_COLOR = LibraryStatusColors[LibraryItemStatus.GIVE_UP];
const LIBRARY_PLACEHOLDER_TEXT_WIDTH_RATIO = 0.1;
const LIBRARY_PLACEHOLDER_PADDING_WIDTH_RATIO = 0.086;
const SCORE_GRADIENT_LEVELS = [5, 4, 3, 2, 1] as const;
const SCORE_GRADIENT_COLORS: Record<number, string> = {
    1: '#ff7875',
    2: '#ffa940',
    3: '#fadb14',
    4: '#73d13d',
    5: '#40a9ff',
};
const ALL_SCORE_LEVELS: number[] = [...SCORE_GRADIENT_LEVELS];
const TIMELINE_ORDER_STORAGE_KEY = 'library_timeline_order';
const TIMELINE_LIST_ID = 'library-tl-list';
const WEEKDAY_NAMES = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
const DEFAULT_TIMELINE_STATUSES: TimelineStatusOption[] = [
    LibraryItemStatus.DOING,
    LibraryItemStatus.DONE,
    'waitExpired',
    LibraryItemStatus.GIVE_UP,
];
type TimelineOrder = 'asc' | 'desc';

function getTimelineScrollContainer(): HTMLElement | Window {
    return document.getElementById(TIMELINE_LIST_ID)?.closest<HTMLElement>('.ant-drawer-body') || window;
}

function readTimelineOrder(): TimelineOrder {
    try {
        return window.localStorage.getItem(TIMELINE_ORDER_STORAGE_KEY) === 'desc' ? 'desc' : 'asc';
    } catch {
        return 'asc';
    }
}

interface TimelineFilterOption<T> {
    value: T;
    label: string;
    count?: number;
}

interface TimelineFilterDropdownProps<T> {
    name: string;
    options: TimelineFilterOption<T>[];
    selected: T[];
    defaultValues?: T[];
    onChange: (values: T[]) => void;
}

// 与列表页状态筛选同一交互：勾选框增减，点文字只看它，底部恢复默认/选择全部
function TimelineFilterDropdown<T extends string | number>({
    name,
    options,
    selected,
    defaultValues,
    onChange,
}: TimelineFilterDropdownProps<T>) {
    const [open, setOpen] = useState(false);
    const allValues = options.map((option) => option.value);
    const summary = (() => {
        if (selected.length === 0) {
            return `${name}（未选）`;
        }
        if (selected.length === allValues.length) {
            return `全部${name}`;
        }
        if (selected.length === 1) {
            return options.find((option) => option.value === selected[0])?.label || name;
        }
        return `${name}（${selected.length}）`;
    })();

    return (
        <Dropdown
            trigger={['click']}
            open={open}
            onOpenChange={setOpen}
            dropdownRender={() => (
                <div className="library-status-filter-dropdown">
                    {options.map((option) => (
                        <div key={String(option.value)} className="library-status-filter-row">
                            <div className="library-status-filter-check">
                                <Checkbox
                                    checked={selected.includes(option.value)}
                                    onChange={() => onChange(
                                        selected.includes(option.value)
                                            ? selected.filter((value) => value !== option.value)
                                            : allValues.filter((value) => value === option.value || selected.includes(value))
                                    )}
                                    onClick={(event) => event.stopPropagation()}
                                />
                            </div>
                            <div
                                className="library-status-filter-label"
                                onClick={() => {
                                    onChange([option.value]);
                                    setOpen(false);
                                }}
                            >
                                {option.label}
                                {option.count !== undefined ? (
                                    <span className="library-timeline-filter-count">{option.count}</span>
                                ) : null}
                            </div>
                        </div>
                    ))}
                    <Divider style={{margin: '8px 0'}}/>
                    <div className="library-status-filter-footer">
                        <Space size={8}>
                            {defaultValues ? (
                                <Button size="small" onClick={() => onChange([...defaultValues])}>
                                    恢复默认
                                </Button>
                            ) : null}
                            <Button size="small" onClick={() => onChange([...allValues])}>
                                选择全部
                            </Button>
                        </Space>
                    </div>
                </div>
            )}
        >
            <Button className="library-filter-status-trigger" icon={<FilterOutlined/>}>
                {summary}
            </Button>
        </Dropdown>
    );
}

interface TimelineMonthGroup {
    key: string;
    year: number;
    month: number;
    entries: DisplayTimelineEntry[];
}

interface DisplayTimelineEntry extends TimelineEntry {
    mergedStartStatus?: LibraryItemStatus.DONE | LibraryItemStatus.GIVE_UP;
}

interface TimelineRenderOptions {
    exportPreview?: boolean;
    excludedEntryKeys?: Set<string>;
    onToggleEntry?: (entry: DisplayTimelineEntry, checked: boolean) => void;
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
            const response = await fetch(appendNoCacheParam(src), {
                credentials: getImageFetchCredentials(src),
                cache: 'no-store',
            });
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

function buildRoundKey(entry: TimelineEntry): string {
    return `${entry.itemId}__${entry.roundName}`;
}

function buildRoundDayKey(entry: TimelineEntry): string {
    return `${entry.itemId}__${entry.roundName}__${formatDate(entry.time)}`;
}

function buildTimelineEntryKey(entry: TimelineEntry): string {
    return [
        entry.itemId,
        entry.roundName,
        entry.time,
        entry.logType,
        entry.status ?? '',
        entry.score ?? '',
    ].join('__');
}

function getMergedStartActionText(status?: LibraryItemStatus): string | undefined {
    switch (status) {
        case LibraryItemStatus.DONE:
            return '开始并完成';
        case LibraryItemStatus.GIVE_UP:
            return '开始并放弃';
        default:
            return undefined;
    }
}

interface LibraryTimelineProps {
    visible: boolean;
    items: LibraryItemFull[];
    onClose: () => void;
    onItemClick?: (itemId: number) => void;
}

export default function LibraryTimeline({visible, items, onClose, onItemClick}: LibraryTimelineProps) {
    const isMobile = useIsMobile();
    const [selectedYear, setSelectedYear] = useState<number | 'all'>('all');
    const [viewMode, setViewMode] = useState<LibraryTimelineViewMode>('timeline');
    const [exporting, setExporting] = useState(false);
    const [showExportPreview, setShowExportPreview] = useState(false);
    const exportPreviewRef = useRef<HTMLDivElement>(null);
    const [waitExpiredTick, setWaitExpiredTick] = useState(0);
    const [excludedExportEntryKeys, setExcludedExportEntryKeys] = useState<Set<string>>(() => new Set());

    useEffect(() => {
        const timer = window.setInterval(() => {
            setWaitExpiredTick((prev) => prev + 1);
        }, 60 * 1000);
        return () => window.clearInterval(timer);
    }, []);

    const [selectedStatuses, setSelectedStatuses] = useState<TimelineStatusOption[]>(DEFAULT_TIMELINE_STATUSES);
    const [selectedScoreLevels, setSelectedScoreLevels] = useState<number[]>(ALL_SCORE_LEVELS);
    const [order, setOrder] = useState<TimelineOrder>(readTimelineOrder);

    const changeOrder = (next: TimelineOrder) => {
        setOrder(next);
        try {
            window.localStorage.setItem(TIMELINE_ORDER_STORAGE_KEY, next);
        } catch {
            // 存储不可用时仅本次生效
        }
    };

    const itemMap = useMemo(() => {
        const result = new Map<number, LibraryItemFull>();
        items.forEach((item) => {
            result.set(item.taskId, item);
        });
        return result;
    }, [items]);

    // 提取时间线数据
    const allEntries = useMemo(() => extractTimeline(items), [items]);

    const categoryMap = useMemo(() => {
        const result = new Map<number, string>();
        items.forEach((item) => {
            const category = item.extra.category?.trim() || UNCATEGORIZED_KEY;
            result.set(item.taskId, category);
        });
        return result;
    }, [items]);

    const categoryOptions = useMemo(() => {
        const categorySet = new Set<string>();
        allEntries.forEach((entry) => {
            categorySet.add(categoryMap.get(entry.itemId) || UNCATEGORIZED_KEY);
        });
        return Array.from(categorySet).sort((a, b) => {
            if (a === UNCATEGORIZED_KEY) return 1;
            if (b === UNCATEGORIZED_KEY) return -1;
            return a.localeCompare(b, 'zh-CN');
        });
    }, [allEntries, categoryMap]);

    // null 表示全部分类，新出现的分类自动纳入
    const [selectedCategories, setSelectedCategories] = useState<string[] | null>(null);
    
    // 按年份分组
    const entriesByYear = useMemo(() => groupTimelineByYear(allEntries), [allEntries]);

    const latestWaitEntryTimeMap = useMemo(() => {
        const map = new Map<number, string>();
        allEntries
            .filter((entry) => entry.logType === LibraryLogType.changeStatus && entry.status === LibraryItemStatus.WAIT)
            .slice()
            .sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime())
            .forEach((entry) => {
                if (!map.has(entry.itemId)) {
                    map.set(entry.itemId, entry.time);
                }
            });
        return map;
    }, [allEntries, waitExpiredTick]);

    const isWaitExpiredEntry = (entry: TimelineEntry): boolean => {
        if (entry.logType !== LibraryLogType.changeStatus || entry.status !== LibraryItemStatus.WAIT) {
            return false;
        }
        const item = itemMap.get(entry.itemId);
        if (!item || !isWaitExpired(item.extra)) {
            return false;
        }
        return latestWaitEntryTimeMap.get(entry.itemId) === entry.time;
    };

    const getEntryStatusOption = (entry: TimelineEntry): TimelineStatusOption | undefined => {
        if (entry.logType === LibraryLogType.addToLibrary) {
            return 'addToLibrary';
        }
        if (entry.logType === LibraryLogType.score) {
            return 'score';
        }
        if (entry.logType === LibraryLogType.changeStatus) {
            if (entry.status === LibraryItemStatus.WAIT && isWaitExpiredEntry(entry)) {
                return 'waitExpired';
            }
            return entry.status;
        }
        return undefined;
    };

    const statusOptions = useMemo(
        () => [
            {value: 'addToLibrary' as TimelineStatusOption, label: '添加到库'},
            {value: 'score' as TimelineStatusOption, label: '评分'},
            {
                value: LibraryItemStatus.TODO as TimelineStatusOption,
                label: '等待',
            },
            {
                value: LibraryItemStatus.DOING as TimelineStatusOption,
                label: LibraryStatusNames[LibraryItemStatus.DOING],
            },
            {
                value: LibraryItemStatus.DONE as TimelineStatusOption,
                label: LibraryStatusNames[LibraryItemStatus.DONE],
            },
            {
                value: LibraryItemStatus.WAIT as TimelineStatusOption,
                label: LibraryStatusNames[LibraryItemStatus.WAIT],
            },
            {
                value: 'waitExpired' as TimelineStatusOption,
                label: '鸽了',
            },
            {
                value: LibraryItemStatus.GIVE_UP as TimelineStatusOption,
                label: LibraryStatusNames[LibraryItemStatus.GIVE_UP],
            },
            {
                value: LibraryItemStatus.ARCHIVED as TimelineStatusOption,
                label: LibraryStatusNames[LibraryItemStatus.ARCHIVED],
            },
        ],
        []
    );
    
    // 可用年份列表
    const years = useMemo(() => {
        const yearList = Array.from(entriesByYear.keys()).sort((a, b) => b - a);
        return yearList;
    }, [entriesByYear]);

    useEffect(() => {
        if (!visible) {
            return;
        }
        setSelectedYear(years[0] ?? 'all');
    }, [visible, years]);

    useEffect(() => {
        if (selectedYear !== 'all' && !years.includes(selectedYear)) {
            setSelectedYear(years[0] ?? 'all');
        }
    }, [selectedYear, years]);

    const categoryCounts = useMemo(() => {
        const counts = new Map<string, number>();
        (selectedYear === 'all' ? allEntries : entriesByYear.get(selectedYear) || []).forEach((entry) => {
            const category = categoryMap.get(entry.itemId) || UNCATEGORIZED_KEY;
            counts.set(category, (counts.get(category) || 0) + 1);
        });
        return counts;
    }, [allEntries, categoryMap, entriesByYear, selectedYear]);

    const selectedCategoriesFinal = useMemo(
        () => (selectedCategories === null
            ? categoryOptions
            : categoryOptions.filter((category) => selectedCategories.includes(category))),
        [selectedCategories, categoryOptions]
    );

    const roundHasAnyDoingLogSet = useMemo(() => {
        const set = new Set<string>();
        items.forEach((item) => {
            item.extra.rounds.forEach((round) => {
                const hasDoingLog = round.logs.some((log) => (
                    log.type === LibraryLogType.changeStatus && log.status === LibraryItemStatus.DOING
                ));
                if (hasDoingLog) {
                    set.add(`${item.taskId}__${round.name}`);
                }
            });
        });
        return set;
    }, [items]);

    const baseEntries = useMemo(() => {
        const sourceEntries = (selectedYear === 'all'
            ? allEntries
            : entriesByYear.get(selectedYear) || [])
            .slice()
            .sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());

        return sourceEntries.filter((entry) => {
            const category = categoryMap.get(entry.itemId) || UNCATEGORIZED_KEY;
            return selectedCategoriesFinal.includes(category);
        });
    }, [
        allEntries,
        categoryMap,
        entriesByYear,
        selectedCategoriesFinal,
        selectedYear,
    ]);

    // 合并“开始并完成/放弃”后的条目（尚未按状态筛选）
    const mergedEntries = useMemo<DisplayTimelineEntry[]>(() => {
        const doingIndexesByDay = new Map<string, number[]>();
        baseEntries.forEach((entry, index) => {
            if (entry.logType === LibraryLogType.changeStatus && entry.status === LibraryItemStatus.DOING) {
                const key = buildRoundDayKey(entry);
                const list = doingIndexesByDay.get(key) || [];
                list.push(index);
                doingIndexesByDay.set(key, list);
            }
        });

        const mergedStatusPairDoingIndexMap = new Map<number, number>();
        const consumedDoingIndexes = new Set<number>();

        // 第一阶段：先计算终态（DONE/GIVE_UP）对应要合并掉的 DOING 索引
        baseEntries.forEach((entry, index) => {
            if (
                entry.logType !== LibraryLogType.changeStatus
                || (entry.status !== LibraryItemStatus.DONE && entry.status !== LibraryItemStatus.GIVE_UP)
            ) {
                return;
            }
            const dayKey = buildRoundDayKey(entry);
            const candidates = doingIndexesByDay.get(dayKey) || [];
            const pairDoingIndex = candidates.find((candidateIndex) => (
                candidateIndex < index && !consumedDoingIndexes.has(candidateIndex)
            ));
            if (pairDoingIndex !== undefined) {
                consumedDoingIndexes.add(pairDoingIndex);
                mergedStatusPairDoingIndexMap.set(index, pairDoingIndex);
            }
        });

        const mergedEntries: DisplayTimelineEntry[] = [];

        // 第二阶段：输出条目，跳过被合并的 DOING
        baseEntries.forEach((entry, index) => {
            if (entry.logType !== LibraryLogType.changeStatus) {
                mergedEntries.push(entry);
                return;
            }

            if (entry.status === LibraryItemStatus.DOING) {
                if (consumedDoingIndexes.has(index)) {
                    return;
                }
                mergedEntries.push(entry);
                return;
            }

            if (entry.status === LibraryItemStatus.DONE || entry.status === LibraryItemStatus.GIVE_UP) {
                if (mergedStatusPairDoingIndexMap.has(index)) {
                    mergedEntries.push({...entry, mergedStartStatus: entry.status});
                    return;
                }

                const roundKey = buildRoundKey(entry);
                if (!roundHasAnyDoingLogSet.has(roundKey)) {
                    mergedEntries.push({...entry, mergedStartStatus: entry.status});
                    return;
                }
            }

            mergedEntries.push(entry);
        });

        return mergedEntries;
    }, [
        baseEntries,
        roundHasAnyDoingLogSet,
    ]);

    const statusCounts = useMemo(() => {
        const counts = new Map<TimelineStatusOption, number>();
        mergedEntries.forEach((entry) => {
            const option = getEntryStatusOption(entry);
            if (option !== undefined) {
                counts.set(option, (counts.get(option) || 0) + 1);
            }
        });
        return counts;
    }, [mergedEntries, getEntryStatusOption]);

    // 当前显示的条目（时间正序，合并逻辑依赖正序）
    const displayEntries = useMemo(() => mergedEntries.filter((entry) => {
        const option = getEntryStatusOption(entry);
        return option !== undefined && selectedStatuses.includes(option);
    }), [mergedEntries, getEntryStatusOption, selectedStatuses]);

    // 按用户选择的方向排列，用于浏览与导出
    const orderedEntries = useMemo(
        () => (order === 'desc' ? displayEntries.slice().reverse() : displayEntries),
        [displayEntries, order]
    );

    const monthGroups = useMemo<TimelineMonthGroup[]>(() => {
        const groups: TimelineMonthGroup[] = [];
        orderedEntries.forEach((entry) => {
            const date = new Date(entry.time);
            const year = date.getFullYear();
            const month = date.getMonth() + 1;
            const key = `${year}-${String(month).padStart(2, '0')}`;
            let group = groups[groups.length - 1];
            if (!group || group.key !== key) {
                group = {key, year, month, entries: []};
                groups.push(group);
            }
            group.entries.push(entry);
        });
        return groups;
    }, [orderedEntries]);

    const exportPreviewEntries = useMemo(
        () => orderedEntries.filter((entry) => (
            !excludedExportEntryKeys.has(buildTimelineEntryKey(entry))
        )),
        [orderedEntries, excludedExportEntryKeys]
    );
    const excludedExportCount = Math.max(0, displayEntries.length - exportPreviewEntries.length);

    const scoreGradientEntriesByLevel = useMemo(() => {
        const result = new Map<number, DisplayTimelineEntry[]>();
        SCORE_GRADIENT_LEVELS.forEach((level) => result.set(level, []));

        baseEntries.forEach((entry) => {
            if (entry.logType !== LibraryLogType.score || !entry.score) {
                return;
            }
            const normalizedScore = Math.max(1, Math.min(5, entry.score));
            result.get(normalizedScore)?.push(entry);
        });

        SCORE_GRADIENT_LEVELS.forEach((level) => {
            result.get(level)?.sort((a, b) => {
                const signRank = (entry: DisplayTimelineEntry) => {
                    if (entry.scorePlus) return 0;
                    if (entry.scoreSub) return 2;
                    return 1;
                };
                const signDiff = signRank(a) - signRank(b);
                if (signDiff !== 0) {
                    return signDiff;
                }
                return new Date(a.time).getTime() - new Date(b.time).getTime();
            });
        });

        return result;
    }, [baseEntries]);

    const scoreGradientTotal = useMemo(() => {
        return selectedScoreLevels.reduce((total, level) => (
            total + (scoreGradientEntriesByLevel.get(level)?.length || 0)
        ), 0);
    }, [scoreGradientEntriesByLevel, selectedScoreLevels]);

    const getCategoryLabel = (value: string) => {
        if (value === UNCATEGORIZED_KEY) {
            return '未分类';
        }
        return value;
    };

    const openExportPreview = () => {
        setExcludedExportEntryKeys(new Set());
        setShowExportPreview(true);
    };

    const toggleExportEntry = (entry: DisplayTimelineEntry, checked: boolean) => {
        const key = buildTimelineEntryKey(entry);
        setExcludedExportEntryKeys((prev) => {
            const next = new Set(prev);
            if (checked) {
                next.delete(key);
            } else {
                next.add(key);
            }
            return next;
        });
    };

    const restoreAllExportEntries = () => {
        setExcludedExportEntryKeys(new Set());
    };

    const handleExportImage = async () => {
        if (!exportPreviewRef.current) {
            message.warning('暂无可导出内容');
            return;
        }
        if (exportPreviewEntries.length === 0) {
            message.warning('没有可导出的记录');
            return;
        }

        let wrapper: HTMLDivElement | null = null;
        try {
            setExporting(true);
            const html2canvas = (await import('html2canvas')).default;
            const source = exportPreviewRef.current;
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
            target.querySelectorAll('.library-export-preview-control').forEach((node) => node.remove());
            target.querySelectorAll('.library-export-preview-excluded').forEach((node) => node.remove());
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
            const now = new Date();
            const ts = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
            const link = document.createElement('a');
            link.href = dataUrl;
            link.download = `library-timeline-${ts}.png`;
            link.click();
            message.success('时间线已导出为图片');
        } catch (error) {
            console.error(error);
            message.error('导出失败，请稍后重试');
        } finally {
            if (wrapper && wrapper.parentNode) {
                wrapper.parentNode.removeChild(wrapper);
            }
            setExporting(false);
        }
    };

    // 获取日志类型图标
    const getLogIcon = (entry: TimelineEntry) => {
        if (isWaitExpiredEntry(entry)) {
            return <StopOutlined style={{color: WAIT_EXPIRED_TIMELINE_COLOR}}/>;
        }
        if (entry.logType === LibraryLogType.score) {
            return <StarFilled style={{color: '#faad14'}}/>;
        }
        if (entry.logType === LibraryLogType.addToLibrary) {
            return <PlusCircleFilled style={{color: '#722ed1'}}/>;
        }
        // 状态变更图标
        switch (entry.status) {
            case LibraryItemStatus.TODO:
                return <ClockCircleFilled style={{color: LibraryStatusColors[LibraryItemStatus.TODO]}}/>;
            case LibraryItemStatus.DOING:
                return <PlayCircleFilled style={{color: LibraryStatusColors[LibraryItemStatus.DOING]}}/>;
            case LibraryItemStatus.DONE:
                return <CheckCircleFilled style={{color: LibraryStatusColors[LibraryItemStatus.DONE]}}/>;
            case LibraryItemStatus.WAIT:
                return <PauseCircleFilled style={{color: LibraryStatusColors[LibraryItemStatus.WAIT]}}/>;
            case LibraryItemStatus.GIVE_UP:
                return <StopOutlined style={{color: LibraryStatusColors[LibraryItemStatus.GIVE_UP]}}/>;
            case LibraryItemStatus.ARCHIVED:
                return <StopOutlined style={{color: LibraryStatusColors[LibraryItemStatus.ARCHIVED]}}/>;
            default:
                return <ClockCircleFilled/>;
        }
    };

    // 获取时间线条目颜色
    const getEntryColor = (entry: TimelineEntry): string => {
        if (isWaitExpiredEntry(entry)) {
            return WAIT_EXPIRED_TIMELINE_COLOR;
        }
        if (entry.logType === LibraryLogType.score) {
            return '#faad14';
        }
        if (entry.logType === LibraryLogType.addToLibrary) {
            return '#722ed1';
        }
        if (entry.status !== undefined) {
            return LibraryStatusColors[entry.status];
        }
        return 'gray';
    };

    // 渲染时间线条目
    const renderTimelineItem = (entry: DisplayTimelineEntry, index: number, options?: TimelineRenderOptions) => {
        const coverWidth = isMobile ? 42 : 48;
        const coverHeight = isMobile ? 63 : 72;
        const placeholderFontSize = Math.round(coverWidth * LIBRARY_PLACEHOLDER_TEXT_WIDTH_RATIO);
        const placeholderPadding = Math.round(coverWidth * LIBRARY_PLACEHOLDER_PADDING_WIDTH_RATIO);
        const originalCoverUrl = entry.pictureAddress?.trim() || '';
        const previewCoverUrl = entry.picturePreview?.trim() || entry.pictureAddressPreview?.trim() || '';
        const realCoverUrl = previewCoverUrl || originalCoverUrl;
        const placeholderColor = getLibraryCoverPaletteByTitle(entry.itemTitle || '未命名');
        const actionText = getEntryActionText(entry);
        const trimmedComment = entry.logType === LibraryLogType.score ? '' : (entry.comment || '').trim();
        const shouldHideComment = (
            entry.logType === LibraryLogType.changeStatus
            && entry.status === LibraryItemStatus.DOING
            && isLibraryAutoRoundStartComment(trimmedComment, entry.roundName)
        ) || trimmedComment === actionText;
        const commentStyle: React.CSSProperties = {
            fontSize: 12,
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
        };

        const exportEntryKey = buildTimelineEntryKey(entry);
        const exportChecked = !options?.excludedEntryKeys?.has(exportEntryKey);

        return (
            <Timeline.Item
                key={`${entry.itemId}-${entry.time}-${index}`}
                dot={getLogIcon(entry)}
                color={getEntryColor(entry)}
                className={options?.exportPreview && !exportChecked ? 'library-export-preview-excluded' : undefined}
            >
                <Flex
                    align="flex-start"
                    gap={12}
                    style={{cursor: options?.exportPreview ? 'default' : (onItemClick ? 'pointer' : 'default')}}
                    onClick={() => {
                        if (!options?.exportPreview) {
                            onItemClick?.(entry.itemId);
                        }
                    }}
                >
                    {/* 封面缩略图 */}
                    <div
                        style={{
                            position: 'relative',
                            width: coverWidth,
                            height: coverHeight,
                            borderRadius: 4,
                            overflow: 'hidden',
                            flexShrink: 0,
                        }}
                    >
                        <LibraryLoadingImage
                            src={realCoverUrl}
                            alt={entry.itemTitle || '未命名'}
                            containerStyle={{position: 'absolute', inset: 0}}
                            sizes={isMobile ? '120px' : '160px'}
                            imageStyle={{
                                width: '100%',
                                height: '100%',
                                objectFit: 'cover',
                                objectPosition: 'center',
                                display: 'block',
                            }}
                            placeholder={(
                                <div
                                    className="library-timeline-cover-placeholder"
                                    style={{
                                        position: 'absolute',
                                        inset: 0,
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        padding: placeholderPadding,
                                        boxSizing: 'border-box',
                                        textAlign: 'center',
                                        wordBreak: 'normal',
                                        overflowWrap: 'anywhere',
                                        whiteSpace: 'normal',
                                        overflow: 'hidden',
                                        background: `linear-gradient(140deg, ${placeholderColor.bg} 0%, #ffffff 100%)`,
                                        color: placeholderColor.text,
                                        fontWeight: 600,
                                        fontSize: placeholderFontSize,
                                        lineHeight: 1.25,
                                    }}
                                >
                                    {entry.itemTitle || '未命名'}
                                </div>
                            )}
                        />
                    </div>
                    
                    {/* 内容 */}
                    <Space direction="vertical" size={2} style={{flex: 1, minWidth: 0}}>
                        <Text strong style={{fontSize: isMobile ? 13 : 14}}>
                            {entry.itemTitle}
                        </Text>
                        
                        <Space size={4} wrap>
                            <Tag
                                color={getEntryColor(entry)}
                                style={{margin: 0, fontSize: 11}}
                            >
                                {actionText}
                            </Tag>
                            {entry.roundName !== '首周目' && (
                                <Tag style={{margin: 0, fontSize: 11}}>{entry.roundName}</Tag>
                            )}
                        </Space>
                        
                        {trimmedComment && !shouldHideComment && (
                            <Text
                                type="secondary"
                                style={commentStyle}
                            >
                                {trimmedComment}
                            </Text>
                        )}
                    </Space>

                    {options?.exportPreview ? (
                        <div
                            className="library-export-preview-control"
                            onClick={(event) => event.stopPropagation()}
                            style={{
                                flexShrink: 0,
                                paddingTop: 2,
                            }}
                        >
                            <Checkbox
                                checked={exportChecked}
                                onChange={(event) => options.onToggleEntry?.(entry, event.target.checked)}
                            >
                                导出
                            </Checkbox>
                        </div>
                    ) : null}
                </Flex>
            </Timeline.Item>
        );
    };

    // 按日期分组渲染（同一天的合并显示）
    const renderGroupedTimeline = (
        entries: DisplayTimelineEntry[] = displayEntries,
        options?: TimelineRenderOptions
    ) => {
        if (entries.length === 0) {
            return <Empty description="暂无记录"/>;
        }

        let currentDay = '';
        const elements: React.ReactNode[] = [];

        entries.forEach((entry, index) => {
            const entryDay = formatDate(entry.time);
            
            if (entryDay !== currentDay) {
                currentDay = entryDay;
                elements.push(
                    <Divider
                        key={`day-${entryDay}`}
                        orientation="left"
                        style={{margin: '16px 0 8px'}}
                    >
                        <Text type="secondary" style={{fontSize: 12}}>
                            {entryDay}
                        </Text>
                    </Divider>
                );
            }
            
            elements.push(renderTimelineItem(entry, index, options));
        });

        return <Timeline>{elements}</Timeline>;
    };

    const getEntryActionText = (entry: DisplayTimelineEntry): string => {
        if (isWaitExpiredEntry(entry)) {
            return '鸽了';
        }
        const mergedActionText = getMergedStartActionText(entry.mergedStartStatus);
        if (mergedActionText) {
            return mergedActionText;
        }
        if (entry.logType === LibraryLogType.score) {
            return `评分 ${getScoreText(entry.score || 0, entry.scorePlus, entry.scoreSub)}`;
        }
        return getLogTypeText(entry.logType, entry.status);
    };

    // 浏览用卡片：按月分组后在宽抽屉里多列平铺
    const renderTimelineCard = (entry: DisplayTimelineEntry, index: number) => {
        const originalCoverUrl = entry.pictureAddress?.trim() || '';
        const previewCoverUrl = entry.picturePreview?.trim() || entry.pictureAddressPreview?.trim() || '';
        const realCoverUrl = previewCoverUrl || originalCoverUrl;
        const placeholderColor = getLibraryCoverPaletteByTitle(entry.itemTitle || '未命名');
        const actionText = getEntryActionText(entry);
        const entryDate = new Date(entry.time);
        const trimmedComment = entry.logType === LibraryLogType.score ? '' : (entry.comment || '').trim();
        const shouldHideComment = (
            entry.logType === LibraryLogType.changeStatus
            && entry.status === LibraryItemStatus.DOING
            && isLibraryAutoRoundStartComment(trimmedComment, entry.roundName)
        ) || trimmedComment === actionText;

        return (
            <button
                key={`${entry.itemId}-${entry.time}-${index}`}
                type="button"
                className="library-tl-card"
                onClick={() => onItemClick?.(entry.itemId)}
            >
                <div className="library-tl-card-cover">
                    <LibraryLoadingImage
                        src={realCoverUrl}
                        alt={entry.itemTitle || '未命名'}
                        containerStyle={{position: 'absolute', inset: 0}}
                        sizes="120px"
                        imageStyle={{
                            width: '100%',
                            height: '100%',
                            objectFit: 'cover',
                            objectPosition: 'center',
                            display: 'block',
                        }}
                        placeholder={(
                            <div
                                className="library-score-gradient-placeholder"
                                style={{
                                    background: `linear-gradient(140deg, ${placeholderColor.bg} 0%, #ffffff 100%)`,
                                    color: placeholderColor.text,
                                }}
                            >
                                {entry.itemTitle || '未命名'}
                            </div>
                        )}
                    />
                </div>
                <div className="library-tl-card-body">
                    <Flex justify="space-between" align="baseline" gap={8}>
                        <Text strong ellipsis style={{fontSize: 13}}>{entry.itemTitle || '未命名'}</Text>
                        <Text type="secondary" style={{fontSize: 12, flexShrink: 0}}>
                            {entryDate.getMonth() + 1}/{entryDate.getDate()} {WEEKDAY_NAMES[entryDate.getDay()]}
                        </Text>
                    </Flex>
                    <Space size={4} wrap>
                        <Tag color={getEntryColor(entry)} style={{margin: 0, fontSize: 11}}>{actionText}</Tag>
                        {entry.roundName !== '首周目' ? (
                            <Tag style={{margin: 0, fontSize: 11}}>{entry.roundName}</Tag>
                        ) : null}
                    </Space>
                    {trimmedComment && !shouldHideComment ? (
                        <Text type="secondary" className="library-tl-card-comment">{trimmedComment}</Text>
                    ) : null}
                </div>
            </button>
        );
    };

    const renderBrowseTimeline = () => {
        if (monthGroups.length === 0) {
            return <Empty description="暂无记录"/>;
        }
        const showYearInMonth = selectedYear === 'all';
        const formatMonthLabel = (group: TimelineMonthGroup) => (
            showYearInMonth ? `${group.year}年${group.month}月` : `${group.month}月`
        );
        const monthNav = monthGroups.length > 1 && !isMobile ? (
            <div className="library-tl-month-nav">
                <Anchor
                    affix={false}
                    targetOffset={0}
                    // Anchor 会缓存首次渲染的 getContainer，需在调用时再查找滚动容器
                    getContainer={getTimelineScrollContainer}
                    onClick={(event) => event.preventDefault()}
                    getCurrentAnchor={(activeLink) => activeLink || `#library-tl-month-${monthGroups[0].key}`}
                    items={monthGroups.map((group) => ({
                        key: group.key,
                        href: `#library-tl-month-${group.key}`,
                        title: `${showYearInMonth ? `${String(group.year).slice(2)}年${group.month}月` : `${group.month}月`} (${group.entries.length})`,
                    }))}
                />
            </div>
        ) : null;

        return (
            <div className="library-tl-layout">
                {monthNav}
                <div className="library-tl-list" id={TIMELINE_LIST_ID}>
                    {monthGroups.map((group) => (
                        <section key={group.key} id={`library-tl-month-${group.key}`} className="library-tl-month">
                            <div className="library-tl-month-header">
                                <Text strong style={{fontSize: 15}}>{formatMonthLabel(group)}</Text>
                                <Text type="secondary" style={{fontSize: 12}}>{group.entries.length} 条</Text>
                            </div>
                            <div className="library-tl-month-grid">
                                {group.entries.map(renderTimelineCard)}
                            </div>
                        </section>
                    ))}
                </div>
            </div>
        );
    };

    const renderScoreGradientCover = (entry: DisplayTimelineEntry, index: number) => {
        const coverWidth = isMobile ? 52 : 72;
        const coverHeight = Math.round(coverWidth * 1.5);
        const originalCoverUrl = entry.pictureAddress?.trim() || '';
        const previewCoverUrl = entry.picturePreview?.trim() || entry.pictureAddressPreview?.trim() || '';
        const realCoverUrl = previewCoverUrl || originalCoverUrl;
        const placeholderColor = getLibraryCoverPaletteByTitle(entry.itemTitle || '未命名');
        const scoreText = getScoreText(entry.score || 0, entry.scorePlus, entry.scoreSub);
        const title = `${entry.itemTitle || '未命名'} · ${scoreText} · ${formatDate(entry.time)}`;

        return (
            <div
                key={`${entry.itemId}-${entry.time}-${index}`}
                className="library-score-gradient-item"
                style={{width: coverWidth}}
            >
            <button
                type="button"
                className="library-score-gradient-card"
                title={title}
                style={{
                    width: coverWidth,
                    height: coverHeight,
                }}
                onClick={() => onItemClick?.(entry.itemId)}
            >
                <LibraryLoadingImage
                    src={realCoverUrl}
                    alt={entry.itemTitle || '未命名'}
                    containerStyle={{position: 'absolute', inset: 0}}
                    sizes={isMobile ? '100px' : '140px'}
                    imageStyle={{
                        width: '100%',
                        height: '100%',
                        objectFit: 'cover',
                        objectPosition: 'center',
                        display: 'block',
                    }}
                    placeholder={(
                        <div
                            className="library-score-gradient-placeholder"
                            style={{
                                background: `linear-gradient(140deg, ${placeholderColor.bg} 0%, #ffffff 100%)`,
                                color: placeholderColor.text,
                            }}
                        >
                            {entry.itemTitle || '未命名'}
                        </div>
                    )}
                />
                <span className="library-score-gradient-date">{formatDate(entry.time).slice(5)}</span>
                {(entry.scorePlus || entry.scoreSub) ? (
                    <span className="library-score-gradient-sign">{entry.scorePlus ? '+' : '-'}</span>
                ) : null}
            </button>
            {!isMobile ? (
                <span className="library-score-gradient-title" title={entry.itemTitle || '未命名'}>
                    {entry.itemTitle || '未命名'}
                </span>
            ) : null}
            </div>
        );
    };

    const renderScoreGradient = () => {
        if (scoreGradientTotal === 0) {
            return <Empty description="暂无评分记录"/>;
        }

        return (
            <div className="library-score-gradient-board">
                {SCORE_GRADIENT_LEVELS.filter((level) => selectedScoreLevels.includes(level)).map((level) => {
                    const entries = scoreGradientEntriesByLevel.get(level) || [];
                    const label = getScoreText(level);
                    return (
                        <div className="library-score-gradient-row" key={level}>
                            <div
                                className="library-score-gradient-label"
                                style={{background: SCORE_GRADIENT_COLORS[level]}}
                            >
                                {label}
                            </div>
                            <div className="library-score-gradient-track">
                                {entries.length > 0
                                    ? entries.map(renderScoreGradientCover)
                                    : <Text className="library-score-gradient-empty" style={{fontSize: 12}}>暂无</Text>}
                            </div>
                        </div>
                    );
                })}
            </div>
        );
    };

    return (
        <Drawer
            title={
                <Flex justify="space-between" align="center">
                    <Space>
                        <CalendarOutlined/>
                        <span>时间线</span>
                    </Space>
                    <Space>
                        <Text type="secondary" style={{fontSize: 12}}>
                            共 {viewMode === 'timeline' ? displayEntries.length : scoreGradientTotal} 条记录
                        </Text>
                        {viewMode === 'timeline' ? (
                            <Button
                                type="text"
                                size="small"
                                icon={<DownloadOutlined/>}
                                onClick={openExportPreview}
                            >
                                预览导出
                            </Button>
                        ) : null}
                    </Space>
                </Flex>
            }
            placement="right"
            width={isMobile ? '100%' : 'min(1120px, 92vw)'}
            className="library-timeline-drawer"
            onClose={onClose}
            open={visible}
        >
            <div>
                <Flex gap={8} wrap="wrap" align="center" style={{marginBottom: 16}}>
                    <Segmented
                        value={viewMode}
                        onChange={(value) => setViewMode(value as LibraryTimelineViewMode)}
                        options={[
                            {value: 'timeline', label: '时间线'},
                            {value: 'scoreGradient', label: '评分梯度'},
                        ]}
                    />
                    <Select
                        value={selectedYear}
                        onChange={setSelectedYear}
                        style={{width: 120}}
                        options={[
                            {value: 'all', label: '全部年份'},
                            ...years.map(year => ({value: year, label: `${year}年`})),
                        ]}
                    />
                    <TimelineFilterDropdown
                        name="分类"
                        options={categoryOptions.map((value) => ({
                            value,
                            label: getCategoryLabel(value),
                            count: categoryCounts.get(value) || 0,
                        }))}
                        selected={selectedCategoriesFinal}
                        onChange={(values) => setSelectedCategories(
                            values.length === categoryOptions.length ? null : values
                        )}
                    />
                    {viewMode === 'timeline' ? (
                        <>
                            <TimelineFilterDropdown
                                name="状态"
                                options={statusOptions.map((option) => ({
                                    ...option,
                                    count: statusCounts.get(option.value) || 0,
                                }))}
                                selected={selectedStatuses}
                                defaultValues={DEFAULT_TIMELINE_STATUSES}
                                onChange={setSelectedStatuses}
                            />
                            <Select
                                value={order}
                                onChange={changeOrder}
                                style={{width: 120}}
                                suffixIcon={<SortAscendingOutlined/>}
                                options={[
                                    {value: 'asc', label: '最早在前'},
                                    {value: 'desc', label: '最新在前'},
                                ]}
                            />
                        </>
                    ) : (
                        <TimelineFilterDropdown
                            name="档位"
                            options={SCORE_GRADIENT_LEVELS.map((level) => ({
                                value: level as number,
                                label: getScoreText(level),
                                count: scoreGradientEntriesByLevel.get(level)?.length || 0,
                            }))}
                            selected={selectedScoreLevels}
                            onChange={setSelectedScoreLevels}
                        />
                    )}
                </Flex>

                {viewMode === 'timeline' ? renderBrowseTimeline() : renderScoreGradient()}
            </div>

            <Modal
                title="导出预览"
                open={showExportPreview}
                onCancel={() => setShowExportPreview(false)}
                footer={
                    <Space>
                        {excludedExportCount > 0 ? (
                            <Button onClick={restoreAllExportEntries}>
                                恢复全部
                            </Button>
                        ) : null}
                        <Button onClick={() => setShowExportPreview(false)}>关闭</Button>
                        <Button
                            type="primary"
                            icon={<DownloadOutlined/>}
                            loading={exporting}
                            onClick={handleExportImage}
                        >
                            导出图片
                        </Button>
                    </Space>
                }
                width={isMobile ? '100%' : 680}
                style={{top: 20}}
            >
                <Flex justify="space-between" align="center" style={{marginBottom: 8}}>
                    <Text type="secondary" style={{fontSize: 12}}>
                        将导出 {exportPreviewEntries.length} 条记录
                        {excludedExportCount > 0 ? `，未勾选 ${excludedExportCount} 条` : ''}
                    </Text>
                    {excludedExportCount > 0 ? (
                        <Button
                            size="small"
                            type="text"
                            onClick={restoreAllExportEntries}
                        >
                            恢复全部
                        </Button>
                    ) : null}
                </Flex>
                <div style={{maxHeight: '70vh', overflowY: 'auto', background: '#fff', paddingBottom: 8}}>
                    <div ref={exportPreviewRef} style={{padding: '0 12px'}}>
                        {renderGroupedTimeline(orderedEntries, {
                            exportPreview: true,
                            excludedEntryKeys: excludedExportEntryKeys,
                            onToggleEntry: toggleExportEntry,
                        })}
                    </div>
                </div>
            </Modal>
        </Drawer>
    );
}
