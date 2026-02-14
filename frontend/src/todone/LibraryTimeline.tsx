import React, {useMemo, useState} from 'react';
import {
    Avatar,
    Divider,
    Drawer,
    Empty,
    Flex,
    Image,
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
    PauseCircleFilled,
    PlayCircleFilled,
    StarFilled,
    StopOutlined,
} from '@ant-design/icons';
import {
    LibraryItemFull,
    LibraryItemStatus,
    LibraryLogType,
    LibraryStatusColors,
    TimelineEntry,
} from './net/protocal';
import {
    extractTimeline,
    formatDate,
    formatDateTime,
    getLibraryCoverDisplayUrl,
    getLogTypeText,
    getScoreText,
    groupTimelineByYear,
} from './libraryUtil';
import {useIsMobile} from '../common/hooksv2';

const {Text, Title} = Typography;

interface LibraryTimelineProps {
    visible: boolean;
    items: LibraryItemFull[];
    onClose: () => void;
    onItemClick?: (itemId: number) => void;
}

export default function LibraryTimeline({visible, items, onClose, onItemClick}: LibraryTimelineProps) {
    const isMobile = useIsMobile();
    const [selectedYear, setSelectedYear] = useState<number | 'all'>('all');

    // 提取时间线数据
    const allEntries = useMemo(() => extractTimeline(items), [items]);
    
    // 按年份分组
    const entriesByYear = useMemo(() => groupTimelineByYear(allEntries), [allEntries]);
    
    // 可用年份列表
    const years = useMemo(() => {
        const yearList = Array.from(entriesByYear.keys()).sort((a, b) => b - a);
        return yearList;
    }, [entriesByYear]);

    // 当前显示的条目
    const displayEntries = useMemo(() => {
        const sortedEntries = (selectedYear === 'all'
            ? allEntries
            : entriesByYear.get(selectedYear) || [])
            .slice()
            .sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());

        if (selectedYear === 'all') {
            return sortedEntries;
        }
        return sortedEntries;
    }, [allEntries, entriesByYear, selectedYear]);

    // 获取日志类型图标
    const getLogIcon = (entry: TimelineEntry) => {
        if (entry.logType === LibraryLogType.score) {
            return <StarFilled style={{color: '#faad14'}}/>;
        }
        if (entry.logType === LibraryLogType.note) {
            return <CalendarOutlined style={{color: '#1890ff'}}/>;
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
            default:
                return <ClockCircleFilled/>;
        }
    };

    // 获取时间线条目颜色
    const getEntryColor = (entry: TimelineEntry): string => {
        if (entry.logType === LibraryLogType.score) {
            return '#faad14';
        }
        if (entry.logType === LibraryLogType.note) {
            return '#1890ff';
        }
        if (entry.status !== undefined) {
            return LibraryStatusColors[entry.status];
        }
        return 'gray';
    };

    // 渲染时间线条目
    const renderTimelineItem = (entry: TimelineEntry, index: number) => {
        const thumbUrl = getLibraryCoverDisplayUrl(entry.itemTitle, entry.pictureAddress);
        const actionText = entry.logType === LibraryLogType.score
            ? `评分 ${getScoreText(entry.score || 0)}`
            : getLogTypeText(entry.logType, entry.status);

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
                    {thumbUrl ? (
                        <Image
                            src={thumbUrl}
                            width={isMobile ? 42 : 48}
                            height={isMobile ? 56 : 64}
                            style={{borderRadius: 4, objectFit: 'cover'}}
                            preview={false}
                            fallback="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 48 64'%3E%3Crect fill='%23f0f0f0' width='48' height='64'/%3E%3C/svg%3E"
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

    // 按日期分组渲染（同一天的合并显示日期）
    const renderGroupedTimeline = () => {
        if (displayEntries.length === 0) {
            return <Empty description="暂无记录"/>;
        }

        let currentDate = '';
        const elements: React.ReactNode[] = [];

        displayEntries.forEach((entry, index) => {
            const entryDate = formatDate(entry.time);
            
            if (entryDate !== currentDate) {
                currentDate = entryDate;
                elements.push(
                    <Divider
                        key={`date-${entryDate}`}
                        orientation="left"
                        style={{margin: '16px 0 8px'}}
                    >
                        <Text type="secondary" style={{fontSize: 12}}>
                            {entryDate}
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
                    <Text type="secondary" style={{fontSize: 12}}>
                        共 {displayEntries.length} 条记录
                    </Text>
                </Flex>
            }
            placement="right"
            width={isMobile ? '100%' : 500}
            onClose={onClose}
            open={visible}
        >
            {/* 年份筛选 */}
            <Flex justify="space-between" align="center" style={{marginBottom: 16}}>
                <Select
                    value={selectedYear}
                    onChange={setSelectedYear}
                    style={{width: 120}}
                    options={[
                        {value: 'all', label: '全部年份'},
                        ...years.map(year => ({value: year, label: `${year}年`})),
                    ]}
                />
                
                {/* 统计信息 */}
                <Space size={8}>
                    {[
                        LibraryItemStatus.DOING,
                        LibraryItemStatus.DONE,
                        LibraryItemStatus.WAIT,
                    ].map(status => {
                        const count = displayEntries.filter(
                            e => e.logType === LibraryLogType.changeStatus && e.status === status
                        ).length;
                        if (count === 0) return null;
                        return (
                            <Tag
                                key={status}
                                color={LibraryStatusColors[status]}
                                style={{margin: 0}}
                            >
                                {getLogTypeText(LibraryLogType.changeStatus, status)} {count}
                            </Tag>
                        );
                    })}
                </Space>
            </Flex>
            
            {/* 时间线内容 */}
            {renderGroupedTimeline()}
        </Drawer>
    );
}
