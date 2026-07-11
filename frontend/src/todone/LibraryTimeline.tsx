import React, {useEffect, useMemo, useRef, useState} from 'react';
import {
    Button,
    Checkbox,
    Divider,
    Drawer,
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

    const [selectedStatuses, setSelectedStatuses] = useState<TimelineStatusOption[]>([
        LibraryItemStatus.DOING,
        LibraryItemStatus.DONE,
        'waitExpired',
        LibraryItemStatus.GIVE_UP,
    ]);

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

    const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
    
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

    const selectedCategoriesFinal = useMemo(
        () => (selectedCategories.length > 0 ? selectedCategories : categoryOptions),
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

    // 当前显示的条目
    const displayEntries = useMemo<DisplayTimelineEntry[]>(() => {
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

        return mergedEntries.filter((entry) => {
            const option = getEntryStatusOption(entry);
            if (option === undefined) {
                return false;
            }
            return selectedStatuses.includes(option);
        });
    }, [
        baseEntries,
        roundHasAnyDoingLogSet,
        getEntryStatusOption,
        selectedStatuses,
    ]);

    const allCategoryChecked =
        categoryOptions.length > 0 && selectedCategoriesFinal.length === categoryOptions.length;
    const categoryIndeterminate =
        selectedCategoriesFinal.length > 0 && selectedCategoriesFinal.length < categoryOptions.length;

    const allStatusValues = useMemo(
        () => statusOptions.map((option) => option.value),
        [statusOptions]
    );
    const allStatusChecked = selectedStatuses.length === allStatusValues.length;
    const statusIndeterminate = selectedStatuses.length > 0 && selectedStatuses.length < allStatusValues.length;
    const exportPreviewEntries = useMemo(
        () => displayEntries.filter((entry) => (
            !excludedExportEntryKeys.has(buildTimelineEntryKey(entry))
        )),
        [displayEntries, excludedExportEntryKeys]
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
        return SCORE_GRADIENT_LEVELS.reduce((total, level) => (
            total + (scoreGradientEntriesByLevel.get(level)?.length || 0)
        ), 0);
    }, [scoreGradientEntriesByLevel]);

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
        const mergedActionText = getMergedStartActionText(entry.mergedStartStatus);
        const actionText = isWaitExpiredEntry(entry)
            ? '鸽了'
            : mergedActionText
                ? mergedActionText
            : entry.logType === LibraryLogType.score
                ? `评分 ${getScoreText(entry.score || 0)}`
                : getLogTypeText(entry.logType, entry.status);
        const trimmedComment = (entry.comment || '').trim();
        const shouldHideComment = (
            entry.logType === LibraryLogType.changeStatus
            && entry.status === LibraryItemStatus.DOING
            && isLibraryAutoRoundStartComment(trimmedComment, entry.roundName)
        ) || trimmedComment === actionText;
        const commentStyle: React.CSSProperties = entry.logType === LibraryLogType.score
            ? {
                fontSize: 12,
                display: 'block',
                maxWidth: '100%',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
            }
            : {
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

    const renderScoreGradientCover = (entry: DisplayTimelineEntry, index: number) => {
        const coverWidth = isMobile ? 44 : 54;
        const coverHeight = Math.round(coverWidth * 1.5);
        const originalCoverUrl = entry.pictureAddress?.trim() || '';
        const previewCoverUrl = entry.picturePreview?.trim() || entry.pictureAddressPreview?.trim() || '';
        const realCoverUrl = previewCoverUrl || originalCoverUrl;
        const placeholderColor = getLibraryCoverPaletteByTitle(entry.itemTitle || '未命名');
        const scoreText = getScoreText(entry.score || 0, entry.scorePlus, entry.scoreSub);
        const title = `${entry.itemTitle || '未命名'} · ${scoreText} · ${formatDate(entry.time)}`;

        return (
            <button
                key={`${entry.itemId}-${entry.time}-${index}`}
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
        );
    };

    const renderScoreGradient = () => {
        if (scoreGradientTotal === 0) {
            return <Empty description="暂无评分记录"/>;
        }

        return (
            <div className="library-score-gradient-board">
                {SCORE_GRADIENT_LEVELS.map((level) => {
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
                                {entries.map(renderScoreGradientCover)}
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
            width={isMobile ? '100%' : 500}
            onClose={onClose}
            open={visible}
        >
            <div>
                <Space direction="vertical" size={10} style={{width: '100%', marginBottom: 14}}>
                    <Segmented
                        value={viewMode}
                        onChange={(value) => setViewMode(value as LibraryTimelineViewMode)}
                        options={[
                            {value: 'timeline', label: '时间线'},
                            {value: 'scoreGradient', label: '评分梯度'},
                        ]}
                    />

                    <Flex gap={8} wrap="wrap" align="center">
                        <Select
                            value={selectedYear}
                            onChange={setSelectedYear}
                            style={{width: 120}}
                            options={[
                                {value: 'all', label: '全部年份'},
                                ...years.map(year => ({value: year, label: `${year}年`})),
                            ]}
                        />

                        <Checkbox
                            checked={allCategoryChecked}
                            indeterminate={categoryIndeterminate}
                            onChange={(event) => {
                                if (event.target.checked) {
                                    setSelectedCategories([...categoryOptions]);
                                } else {
                                    setSelectedCategories([]);
                                }
                            }}
                        >
                            分类全选
                        </Checkbox>

                        <Checkbox
                            checked={allStatusChecked}
                            indeterminate={statusIndeterminate}
                            onChange={(event) => {
                                if (event.target.checked) {
                                    setSelectedStatuses([...allStatusValues]);
                                } else {
                                    setSelectedStatuses([]);
                                }
                            }}
                        >
                            状态全选
                        </Checkbox>
                    </Flex>

                    <Checkbox.Group
                        value={selectedCategoriesFinal}
                        onChange={(values) => setSelectedCategories(values as string[])}
                    >
                        <Flex gap={8} wrap="wrap">
                            {categoryOptions.map((value) => (
                                <Checkbox key={value} value={value}>
                                    {getCategoryLabel(value)}
                                </Checkbox>
                            ))}
                        </Flex>
                    </Checkbox.Group>

                    {viewMode === 'timeline' ? (
                        <>
                            <Checkbox.Group
                                value={selectedStatuses}
                                onChange={(values) => setSelectedStatuses(values as TimelineStatusOption[])}
                            >
                                <Flex gap={8} wrap="wrap">
                                    {statusOptions.map((option) => (
                                        <Checkbox key={String(option.value)} value={option.value}>
                                            {option.label}
                                        </Checkbox>
                                    ))}
                                </Flex>
                            </Checkbox.Group>

                            <Space size={8}>
                                {[
                                    LibraryItemStatus.DOING,
                                    LibraryItemStatus.DONE,
                                    LibraryItemStatus.WAIT,
                                    'waitExpired' as TimelineStatusOption,
                                    LibraryItemStatus.ARCHIVED,
                                ].map(status => {
                                    const count = displayEntries.reduce((total, entry) => {
                                        const option = getEntryStatusOption(entry);
                                        if (option === status) {
                                            return total + 1;
                                        }
                                        if (status === LibraryItemStatus.DOING && entry.mergedStartStatus) {
                                            return total + 1;
                                        }
                                        return total;
                                    }, 0);
                                    if (count === 0) return null;
                                    const color = status === 'waitExpired' ? WAIT_EXPIRED_TIMELINE_COLOR : LibraryStatusColors[status as LibraryItemStatus];
                                    const text = status === 'waitExpired'
                                        ? '鸽了'
                                        : getLogTypeText(LibraryLogType.changeStatus, status as LibraryItemStatus);
                                    return (
                                        <Tag
                                            key={status}
                                            color={color}
                                            style={{margin: 0}}
                                        >
                                            {text} {count}
                                        </Tag>
                                    );
                                })}
                            </Space>
                        </>
                    ) : null}

                </Space>

                {viewMode === 'timeline' ? renderGroupedTimeline() : renderScoreGradient()}
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
                        {renderGroupedTimeline(displayEntries, {
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
