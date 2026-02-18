import React, {useEffect, useMemo, useRef, useState} from 'react';
import {
    Button,
    Checkbox,
    Avatar,
    Divider,
    Drawer,
    Empty,
    Flex,
    message,
    Modal,
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
    buildLibraryTitleCoverDataUrl,
    extractTimeline,
    formatDateTime,
    getLibraryCoverDisplayUrl,
    getLogTypeText,
    getScoreText,
    groupTimelineByYear,
    isWaitExpired,
} from './libraryUtil';
import {useIsMobile} from '../common/hooksv2';

const {Text, Title} = Typography;
const UNCATEGORIZED_KEY = '__uncategorized__';
type TimelineStatusOption = LibraryItemStatus | 'addToLibrary' | 'score' | 'note' | 'waitExpired';
const WAIT_EXPIRED_TIMELINE_COLOR = LibraryStatusColors[LibraryItemStatus.GIVE_UP];

interface LibraryTimelineProps {
    visible: boolean;
    items: LibraryItemFull[];
    onClose: () => void;
    onItemClick?: (itemId: number) => void;
}

export default function LibraryTimeline({visible, items, onClose, onItemClick}: LibraryTimelineProps) {
    const isMobile = useIsMobile();
    const [selectedYear, setSelectedYear] = useState<number | 'all'>('all');
    const [exporting, setExporting] = useState(false);
    const [showExportPreview, setShowExportPreview] = useState(false);
    const exportRef = useRef<HTMLDivElement>(null);
    const [waitExpiredTick, setWaitExpiredTick] = useState(0);

    useEffect(() => {
        const timer = window.setInterval(() => {
            setWaitExpiredTick((prev) => prev + 1);
        }, 60 * 1000);
        return () => window.clearInterval(timer);
    }, []);

    const [selectedStatuses, setSelectedStatuses] = useState<TimelineStatusOption[]>([
        'score',
        LibraryItemStatus.DOING,
        LibraryItemStatus.DONE,
        LibraryItemStatus.WAIT,
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
        if (entry.logType === LibraryLogType.note) {
            return 'note';
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
            {value: 'note' as TimelineStatusOption, label: '备注'},
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

    const selectedCategoriesFinal = useMemo(
        () => (selectedCategories.length > 0 ? selectedCategories : categoryOptions),
        [selectedCategories, categoryOptions]
    );

    // 当前显示的条目
    const displayEntries = useMemo(() => {
        const baseEntries = (selectedYear === 'all'
            ? allEntries
            : entriesByYear.get(selectedYear) || [])
            .slice()
            .sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());

        return baseEntries.filter((entry) => {
            const category = categoryMap.get(entry.itemId) || UNCATEGORIZED_KEY;
            if (!selectedCategoriesFinal.includes(category)) {
                return false;
            }

            const option = getEntryStatusOption(entry);
            if (option === undefined) {
                return false;
            }
            return selectedStatuses.includes(option);
        });
    }, [
        allEntries,
        categoryMap,
        entriesByYear,
        getEntryStatusOption,
        selectedCategoriesFinal,
        selectedStatuses,
        selectedYear,
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

    const getCategoryLabel = (value: string) => {
        if (value === UNCATEGORIZED_KEY) {
            return '未分类';
        }
        return value;
    };

    const handleExportImage = async () => {
        if (!exportRef.current) {
            message.warning('暂无可导出内容');
            return;
        }

        try {
            setExporting(true);
            const html2canvas = (await import('html2canvas')).default;
            const target = exportRef.current;
            const canvas = await html2canvas(target, {
                scale: 2,
                useCORS: true,
                backgroundColor: '#ffffff',
                width: target.scrollWidth,
                height: target.scrollHeight,
                windowWidth: target.scrollWidth,
                windowHeight: target.scrollHeight,
                scrollX: 0,
                scrollY: -window.scrollY,
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
        if (entry.logType === LibraryLogType.note) {
            return <CalendarOutlined style={{color: '#1890ff'}}/>;
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
        if (entry.logType === LibraryLogType.note) {
            return '#1890ff';
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
    const renderTimelineItem = (entry: TimelineEntry, index: number) => {
        const thumbUrl = getLibraryCoverDisplayUrl(entry.itemTitle, entry.pictureAddress);
        const actionText = isWaitExpiredEntry(entry)
            ? '鸽了'
            : entry.logType === LibraryLogType.score
                ? `评分 ${getScoreText(entry.score || 0)}`
                : getLogTypeText(entry.logType, entry.status);
        const fallbackCoverUrl = buildLibraryTitleCoverDataUrl(entry.itemTitle || '未命名');
        const finalCoverUrl = thumbUrl || fallbackCoverUrl;

        return (
            <Timeline.Item
                key={`${entry.itemId}-${entry.time}-${index}`}
                dot={getLogIcon(entry)}
                color={getEntryColor(entry)}
            >
                <Flex
                    align="flex-start"
                    gap={12}
                    style={{cursor: onItemClick ? 'pointer' : 'default'}}
                    onClick={() => onItemClick?.(entry.itemId)}
                >
                    {/* 封面缩略图 */}
                    {finalCoverUrl ? (
                        <img
                            src={finalCoverUrl}
                            width={isMobile ? 42 : 48}
                            height={isMobile ? 63 : 72}
                            style={{borderRadius: 4, objectFit: 'cover', objectPosition: 'center'}}
                            onError={(e) => {
                                const target = e.currentTarget;
                                if (target.src !== fallbackCoverUrl) {
                                    target.src = fallbackCoverUrl;
                                }
                            }}
                            alt={entry.itemTitle}
                        />
                    ) : (
                        <Avatar
                            shape="square"
                            size={isMobile ? 42 : 48}
                            style={{background: '#f0f0f0', color: '#999'}}
                        >
                            {entry.itemTitle.slice(0, 1)}
                        </Avatar>
                    )}
                    
                    {/* 内容 */}
                    <Space direction="vertical" size={2} style={{flex: 1}}>
                        <Flex justify="space-between" align="center" wrap="wrap" gap={4}>
                            <Text strong style={{fontSize: isMobile ? 13 : 14}}>
                                {entry.itemTitle}
                            </Text>
                            <Text type="secondary" style={{fontSize: 11}}>
                                {formatDateTime(entry.time)}
                            </Text>
                        </Flex>
                        
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
                        
                        {entry.comment && (
                            <Text
                                type="secondary"
                                style={{
                                    fontSize: 12,
                                    display: '-webkit-box',
                                    WebkitLineClamp: 2,
                                    WebkitBoxOrient: 'vertical',
                                    overflow: 'hidden',
                                }}
                            >
                                {entry.comment}
                            </Text>
                        )}
                    </Space>
                </Flex>
            </Timeline.Item>
        );
    };

    // 按月份分组渲染（同一月份的合并显示）
    const renderGroupedTimeline = () => {
        if (displayEntries.length === 0) {
            return <Empty description="暂无记录"/>;
        }

        let currentMonth = '';
        const elements: React.ReactNode[] = [];

        displayEntries.forEach((entry, index) => {
            const date = new Date(entry.time);
            const entryMonth = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
            
            if (entryMonth !== currentMonth) {
                currentMonth = entryMonth;
                elements.push(
                    <Divider
                        key={`month-${entryMonth}`}
                        orientation="left"
                        style={{margin: '16px 0 8px'}}
                    >
                        <Text type="secondary" style={{fontSize: 12}}>
                            {entryMonth}
                        </Text>
                    </Divider>
                );
            }
            
            elements.push(renderTimelineItem(entry, index));
        });

        return <Timeline>{elements}</Timeline>;
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
                            共 {displayEntries.length} 条记录
                        </Text>
                        <Button
                            type="text"
                            size="small"
                            icon={<DownloadOutlined/>}
                            onClick={() => setShowExportPreview(true)}
                        >
                            预览导出
                        </Button>
                    </Space>
                </Flex>
            }
            placement="right"
            width={isMobile ? '100%' : 500}
            onClose={onClose}
            open={visible}
        >
            <div ref={exportRef}>
                <Space direction="vertical" size={10} style={{width: '100%', marginBottom: 14}}>
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
                            const count = displayEntries.filter((entry) => getEntryStatusOption(entry) === status).length;
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

                </Space>

                {renderGroupedTimeline()}
            </div>

            <Modal
                title="导出预览"
                open={showExportPreview}
                onCancel={() => setShowExportPreview(false)}
                footer={
                    <Space>
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
                <div ref={exportRef} style={{maxHeight: '70vh', overflowY: 'auto', background: '#fff', paddingBottom: 8}}>
                    <div style={{padding: '0 12px'}}>{renderGroupedTimeline()}</div>
                    <div style={{padding: '8px 12px 0', fontSize: 12, color: '#999'}}>
                        提示：请先确认预览内容，再点击“导出图片”。
                    </div>
                </div>
            </Modal>
        </Drawer>
    );
}
