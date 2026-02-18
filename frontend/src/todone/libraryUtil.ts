import {
    LibraryExtra,
    LibraryItemFull,
    LibraryItemStatus,
    LibraryLogEntry,
    LibraryLogType,
    LibraryRound,
    LibraryStatusColors,
    LibraryStatusNames,
    PTask,
    TimelineEntry
} from "./net/protocal";

/**
 * 创建默认的 LibraryExtra 数据
 */
export function createDefaultLibraryExtra(): LibraryExtra {
    const now = new Date().toISOString();
    return {
        pictureAddress: '',
        author: '',
        year: undefined,
        remark: '',
        waitReason: '',
        waitSince: undefined,
        todoReason: '',
        todoSince: undefined,
        category: '',
        isFavorite: false,
        status: undefined,
        currentRound: 0,
        rounds: [{
            name: '首周目',
            logs: [{
                type: LibraryLogType.addToLibrary,
                time: now,
            }],
            startTime: now,
        }],
        createdAt: now,
        updatedAt: now,
    };
}

/**
 * 从 Task 的 Note 字段解析 LibraryExtra
 * 如果解析失败或 Note 为空，返回默认值
 */
export function parseLibraryExtra(note: string): LibraryExtra {
    if (!note || note.trim() === '') {
        return createDefaultLibraryExtra();
    }
    try {
        const parsed = JSON.parse(note) as LibraryExtra;
        // 确保必要字段存在
        if (!parsed.rounds || parsed.rounds.length === 0) {
            parsed.rounds = [{
                name: '首周目',
                logs: [],
                startTime: parsed.createdAt || new Date().toISOString(),
            }];
        }
        if (parsed.currentRound === undefined) {
            parsed.currentRound = 0;
        }
        if (parsed.remark === undefined) {
            parsed.remark = '';
        }
        if (parsed.waitReason === undefined) {
            parsed.waitReason = '';
        }
        if (parsed.todoReason === undefined) {
            parsed.todoReason = '';
        }
        if (parsed.isFavorite === undefined) {
            parsed.isFavorite = false;
        }

        parsed.rounds = parsed.rounds.map((round) => ({
            ...round,
            logs: round.logs.map((log) => {
                // 兼容老版本数据：早期会把“添加到库”记录为 note + comment=“添加到库”。
                // 这里在解析阶段统一归一化为 addToLibrary，确保时间线可被“添加到库”筛选项正确命中。
                if (
                    log.type === LibraryLogType.note
                    && (log.comment || '').trim() === '添加到库'
                ) {
                    return {
                        ...log,
                        type: LibraryLogType.addToLibrary,
                        comment: undefined,
                    };
                }
                return log;
            }),
        }));

        return parsed;
    } catch {
        return createDefaultLibraryExtra();
    }
}

/**
 * 将 LibraryExtra 序列化为 JSON 字符串存入 Task.Note
 */
export function serializeLibraryExtra(extra: LibraryExtra): string {
    extra.updatedAt = new Date().toISOString();
    return JSON.stringify(extra);
}

/**
 * 从 Task 解析为 LibraryItemFull
 */
export function parseLibraryFromTask(task: PTask): LibraryItemFull {
    return {
        taskId: task.ID,
        title: task.Title,
        extra: parseLibraryExtra(task.Note),
        index: task.Index,
        tags: task.Tags,
    };
}

/**
 * 将 LibraryItemFull 转换回 PTask（用于保存）
 */
export function libraryToTask(item: LibraryItemFull, originalTask: PTask): PTask {
    return {
        ...originalTask,
        ID: item.taskId,
        Title: item.title,
        Note: serializeLibraryExtra(item.extra),
        Tags: item.tags,
    };
}

/**
 * 添加状态变更日志
 */
export function addStatusLog(extra: LibraryExtra, newStatus?: LibraryItemStatus, comment?: string): LibraryExtra {
    const now = new Date().toISOString();
    const currentRound = extra.rounds[extra.currentRound];
    if (currentRound) {
        currentRound.logs.push({
            type: LibraryLogType.changeStatus,
            time: now,
            status: newStatus,
            comment: comment,
        });
    }
    extra.status = newStatus;
    if (newStatus === LibraryItemStatus.TODO) {
        extra.todoSince = now;
        extra.todoReason = comment?.trim() || '';
        extra.waitSince = undefined;
        extra.waitReason = '';
    } else if (newStatus === LibraryItemStatus.WAIT) {
        extra.waitSince = now;
        extra.waitReason = comment?.trim() || '';
        extra.todoSince = undefined;
        extra.todoReason = '';
    } else {
        extra.waitSince = undefined;
        extra.waitReason = '';
        extra.todoSince = undefined;
        extra.todoReason = '';
    }
    extra.updatedAt = now;
    
    // 如果状态变为完成，设置周目结束时间
    if (newStatus === LibraryItemStatus.DONE && currentRound) {
        currentRound.endTime = now;
    }
    
    return extra;
}

export const LIBRARY_WAIT_EXPIRED_FILTER = 'wait_expired' as const;
export const LIBRARY_WAIT_EXPIRED_RULE_TEXT = '规则：搁置超过30天且未填写搁置原因，记为“鸽了”；填写搁置原因则不会进入“鸽了”。';

function getLatestStatusLog(extra: LibraryExtra): LibraryLogEntry | undefined {
    let latestStatusLog: LibraryLogEntry | undefined;
    let latestStatusMs = Number.MIN_SAFE_INTEGER;

    extra.rounds.forEach((round) => {
        round.logs.forEach((log) => {
            if (log.type !== LibraryLogType.changeStatus) {
                return;
            }

            const timeMs = new Date(log.time).getTime();
            if (Number.isNaN(timeMs)) {
                return;
            }

            if (timeMs >= latestStatusMs) {
                latestStatusMs = timeMs;
                latestStatusLog = log;
            }
        });
    });

    return latestStatusLog;
}

export function isWaitExpired(extra: LibraryExtra): boolean {
    // 规则：仅“搁置超过30天且未填写搁置原因”才视为“鸽了”。
    // 若填写了搁置原因，则一直保持“搁置”，不会进入“鸽了”。
    const latestStatusLog = getLatestStatusLog(extra);
    if (!latestStatusLog || latestStatusLog.status !== LibraryItemStatus.WAIT) return false;
    const reason = (latestStatusLog.comment || '').trim();
    if (reason) return false;
    const start = new Date(latestStatusLog.time).getTime();
    if (Number.isNaN(start)) return false;
    const monthMs = 30 * 24 * 60 * 60 * 1000;
    return (Date.now() - start) >= monthMs;
}

export function getDisplayStatusInfo(extra: LibraryExtra): {name: string; color: string; isExpiredWait: boolean} {
    if (extra.status === LibraryItemStatus.ARCHIVED) {
        return {
            name: LibraryStatusNames[LibraryItemStatus.ARCHIVED],
            color: LibraryStatusColors[LibraryItemStatus.ARCHIVED],
            isExpiredWait: false,
        };
    }
    if (isWaitExpired(extra)) {
        return {
            name: '鸽了',
            color: LibraryStatusColors[LibraryItemStatus.GIVE_UP],
            isExpiredWait: true,
        };
    }
    if (extra.status === undefined) {
        return {
            name: '无状态',
            color: '#bfbfbf',
            isExpiredWait: false,
        };
    }
    return {
        name: LibraryStatusNames[extra.status],
        color: LibraryStatusColors[extra.status],
        isExpiredWait: false,
    };
}

/**
 * 设置时间线截断：此前历史不进入总时间线
 * 多次设置仅保留最新一条截断日志
 */
export function addTimelineCutoffLog(extra: LibraryExtra, comment?: string): LibraryExtra {
    const now = new Date().toISOString();

    for (const round of extra.rounds) {
        round.logs = round.logs.filter(log => log.type !== LibraryLogType.timelineCutoff);
    }

    const currentRound = extra.rounds[extra.currentRound];
    if (currentRound) {
        currentRound.logs.push({
            type: LibraryLogType.timelineCutoff,
            time: now,
            comment: comment?.trim() || '设置时间线断点（此前历史不计入总时间线）',
        });
    }

    extra.timelineCutoffTime = now;
    extra.updatedAt = now;
    return extra;
}

/**
 * 添加评分日志
 */
export function addScoreLog(
    extra: LibraryExtra,
    score: number,
    plus: boolean = false,
    sub: boolean = false,
    comment?: string
): LibraryExtra {
    const now = new Date().toISOString();
    const currentRound = extra.rounds[extra.currentRound];
    if (currentRound) {
        currentRound.logs.push({
            type: LibraryLogType.score,
            time: now,
            score: score,
            scorePlus: plus,
            scoreSub: sub,
            comment: comment,
        });
    }
    extra.updatedAt = now;
    return extra;
}

/**
 * 添加备注日志
 */
export function addNoteLog(extra: LibraryExtra, comment: string): LibraryExtra {
    const now = new Date().toISOString();
    const currentRound = extra.rounds[extra.currentRound];
    if (currentRound) {
        currentRound.logs.push({
            type: LibraryLogType.note,
            time: now,
            comment: comment,
        });
    }
    extra.updatedAt = now;
    return extra;
}

/**
 * 开始新周目
 */
export function startNewRound(extra: LibraryExtra, roundName: string): LibraryExtra {
    const now = new Date().toISOString();
    
    // 结束当前周目
    const currentRound = extra.rounds[extra.currentRound];
    if (currentRound && !currentRound.endTime) {
        currentRound.endTime = now;
    }
    
    // 创建新周目
    const newRound: LibraryRound = {
        name: roundName,
        logs: [{
            type: LibraryLogType.changeStatus,
            time: now,
            status: LibraryItemStatus.DOING,
            comment: `开始${roundName}`,
        }],
        startTime: now,
    };
    
    extra.rounds.push(newRound);
    extra.currentRound = extra.rounds.length - 1;
    extra.status = LibraryItemStatus.DOING;
    extra.updatedAt = now;
    
    return extra;
}

/**
 * 设置主评分
 */
export function setMainScore(extra: LibraryExtra, roundIndex: number, logIndex: number): LibraryExtra {
    extra.mainScoreRoundIndex = roundIndex;
    extra.mainScoreLogIndex = logIndex;
    extra.updatedAt = new Date().toISOString();
    return extra;
}

export function normalizeMainScoreSelection(extra: LibraryExtra): LibraryExtra {
    const currentRoundIndex = extra.mainScoreRoundIndex;
    const currentLogIndex = extra.mainScoreLogIndex;

    if (currentRoundIndex !== undefined && currentLogIndex !== undefined) {
        const currentRound = extra.rounds[currentRoundIndex];
        const currentLog = currentRound?.logs[currentLogIndex];
        if (currentLog?.type === LibraryLogType.score) {
            return extra;
        }
    }

    let latestRoundIndex: number | undefined;
    let latestLogIndex: number | undefined;
    let latestTimeMs = Number.MIN_SAFE_INTEGER;

    extra.rounds.forEach((round, roundIndex) => {
        round.logs.forEach((log, logIndex) => {
            if (log.type !== LibraryLogType.score) {
                return;
            }

            const timeMs = new Date(log.time).getTime();
            const safeTimeMs = Number.isNaN(timeMs) ? Number.MIN_SAFE_INTEGER : timeMs;
            if (
                latestRoundIndex === undefined ||
                latestLogIndex === undefined ||
                safeTimeMs > latestTimeMs ||
                (safeTimeMs === latestTimeMs && (
                    roundIndex > latestRoundIndex ||
                    (roundIndex === latestRoundIndex && logIndex > latestLogIndex)
                ))
            ) {
                latestRoundIndex = roundIndex;
                latestLogIndex = logIndex;
                latestTimeMs = safeTimeMs;
            }
        });
    });

    if (latestRoundIndex === undefined || latestLogIndex === undefined) {
        delete extra.mainScoreRoundIndex;
        delete extra.mainScoreLogIndex;
        return extra;
    }

    extra.mainScoreRoundIndex = latestRoundIndex;
    extra.mainScoreLogIndex = latestLogIndex;
    return extra;
}

/**
 * 获取主评分
 */
export function getMainScore(extra: LibraryExtra): LibraryLogEntry | null {
    if (extra.mainScoreRoundIndex === undefined || extra.mainScoreLogIndex === undefined) {
        // 如果没有设置主评分，尝试找最后一个评分
        for (let i = extra.rounds.length - 1; i >= 0; i--) {
            const round = extra.rounds[i];
            for (let j = round.logs.length - 1; j >= 0; j--) {
                if (round.logs[j].type === LibraryLogType.score) {
                    return round.logs[j];
                }
            }
        }
        return null;
    }
    const round = extra.rounds[extra.mainScoreRoundIndex];
    if (!round) return null;
    return round.logs[extra.mainScoreLogIndex] || null;
}

/**
 * 获取评分显示文本
 */
export function getScoreText(score: number, plus?: boolean, sub?: boolean): string {
    const SEQ_MAIN = ["零", "差", "合", "优", "满"];
    const index = Math.max(0, Math.min(SEQ_MAIN.length - 1, score - 1));
    const sign = plus ? "+" : sub ? "-" : "";
    return `${SEQ_MAIN[index]}${sign}`;
}

/**
 * 获取评分数值显示
 */
export function getScoreDisplay(score: number, plus?: boolean, sub?: boolean): string {
    const sign = plus ? "+" : sub ? "-" : "";
    return `${score}${sign}/5`;
}

/**
 * 获取评分星标颜色
 */
export function getScoreStarColor(score: number): string {
    const value = Math.max(1, Math.min(5, score || 1));
    const scoreStarColorMap: Record<number, string> = {
        1: '#ffffff',
        2: '#52c41a',
        3: '#1677ff',
        4: '#722ed1',
        5: '#faad14',
    };
    return scoreStarColorMap[value] || '#faad14';
}

/**
 * 从多个 Library 项目中提取时间线
 */
export function extractTimeline(items: LibraryItemFull[]): TimelineEntry[] {
    const entries: TimelineEntry[] = [];
    
    for (const item of items) {
        const cutoffMs = getTimelineCutoffTime(item.extra);
        for (const round of item.extra.rounds) {
            for (const log of round.logs) {
                if (log.type === LibraryLogType.timelineCutoff) {
                    continue;
                }
                const logTimeMs = new Date(log.time).getTime();
                if (cutoffMs !== undefined && !Number.isNaN(logTimeMs) && logTimeMs < cutoffMs) {
                    continue;
                }
                entries.push({
                    time: log.time,
                    itemTitle: item.title,
                    itemId: item.taskId,
                    pictureAddress: item.extra.pictureAddress,
                    roundName: round.name,
                    logType: log.type,
                    status: log.status,
                    score: log.score,
                    comment: log.comment,
                });
            }
        }
    }
    
    // 按时间倒序排列
    entries.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());
    
    return entries;
}

const LIBRARY_COVER_COLOR_SCHEMES: Array<{bg: string; text: string}> = [
    {bg: '#E3F2FD', text: '#1565C0'},
    {bg: '#E8F5E9', text: '#2E7D32'},
    {bg: '#FFF3E0', text: '#E65100'},
    {bg: '#F3E5F5', text: '#7B1FA2'},
    {bg: '#E0F7FA', text: '#00838F'},
    {bg: '#FBE9E7', text: '#BF360C'},
    {bg: '#E8EAF6', text: '#3949AB'},
    {bg: '#FCE4EC', text: '#C2185B'},
    {bg: '#F1F8E9', text: '#558B2F'},
    {bg: '#FFFDE7', text: '#F9A825'},
    {bg: '#EFEBE9', text: '#5D4037'},
    {bg: '#ECEFF1', text: '#546E7A'},
    {bg: '#E1F5FE', text: '#0277BD'},
    {bg: '#F9FBE7', text: '#9E9D24'},
    {bg: '#FFF8E1', text: '#FF8F00'},
    {bg: '#E0F2F1', text: '#00695C'},
];

export const LIBRARY_COVER_TEXT_CONFIG = {
    x: 300,
    centerY: 450,
    lineHeight: 100,
    fontSize: 90,
    fontWeight: 700,
    maxCharsPerLine: 6,
    maxLines: 2,
} as const;

export const LIBRARY_CARD_HOVER_EFFECT_CONFIG = {
    realCoverGlowOpacity: 0.26,
    realCoverShineOpacity: 0.22,
    titleBarDurationMs: 280,
    placeholderGradientDurationMs: 420,
} as const;

export function getLibraryCoverPaletteByTitle(title: string): {bg: string; text: string} {
    const value = title || '';
    let hash = 0;
    for (let i = 0; i < value.length; i++) {
        const char = value.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
    }
    const index = Math.abs(hash) % LIBRARY_COVER_COLOR_SCHEMES.length;
    return LIBRARY_COVER_COLOR_SCHEMES[index];
}

function splitTitleForCover(title: string): string[] {
    const compact = title.replace(/\s+/g, ' ').trim();
    const {maxCharsPerLine, maxLines} = LIBRARY_COVER_TEXT_CONFIG;
    if (!compact) {
        return [];
    }
    if (compact.length <= maxCharsPerLine) {
        return [compact];
    }
    if (compact.length <= maxCharsPerLine * maxLines) {
        return [
            compact.slice(0, maxCharsPerLine),
            compact.slice(maxCharsPerLine),
        ];
    }
    return [
        compact.slice(0, maxCharsPerLine),
        `${compact.slice(maxCharsPerLine, (maxCharsPerLine * maxLines) - 1)}…`,
    ];
}

export function buildLibraryTitleCoverDataUrl(title: string): string {
    const finalTitle = title.trim();
    if (!finalTitle) {
        return '';
    }
    const palette = getLibraryCoverPaletteByTitle(finalTitle);
    const lines = splitTitleForCover(finalTitle);
    const {x, centerY, lineHeight, fontSize, fontWeight} = LIBRARY_COVER_TEXT_CONFIG;
    const firstLineY = centerY - ((lines.length - 1) * lineHeight / 2);
    const textSvg = lines
        .map((line, index) => `<text x="${x}" y="${firstLineY + (index * lineHeight)}" text-anchor="middle" dominant-baseline="middle" fill="${palette.text}" font-size="${fontSize}" font-weight="${fontWeight}" font-family="PingFang SC, Microsoft YaHei, sans-serif">${escapeXml(line)}</text>`)
        .join('');

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 900"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="${palette.bg}"/><stop offset="100%" stop-color="#ffffff"/></linearGradient></defs><rect width="600" height="900" fill="url(#g)"/>${textSvg}</svg>`;
    return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

export function getLibraryCoverDisplayUrl(title: string, pictureAddress?: string): string {
    const saved = pictureAddress?.trim() || '';
    if (saved) {
        return saved;
    }
    return buildLibraryTitleCoverDataUrl(title || '');
}

function escapeXml(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

/**
 * 按年份分组时间线
 */
export function groupTimelineByYear(entries: TimelineEntry[]): Map<number, TimelineEntry[]> {
    const grouped = new Map<number, TimelineEntry[]>();
    
    for (const entry of entries) {
        const year = new Date(entry.time).getFullYear();
        if (!grouped.has(year)) {
            grouped.set(year, []);
        }
        grouped.get(year)!.push(entry);
    }
    
    return grouped;
}

/**
 * 格式化日期显示
 */
export function formatDate(dateStr: string): string {
    const date = new Date(dateStr);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

/**
 * 格式化日期时间显示
 */
export function formatDateTime(dateStr: string): string {
    const date = new Date(dateStr);
    return `${formatDate(dateStr)} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

/**
 * 获取日志类型的显示文本
 */
export function getLogTypeText(logType: LibraryLogType, status?: LibraryItemStatus): string {
    switch (logType) {
        case LibraryLogType.changeStatus:
            if (status !== undefined) {
                switch (status) {
                    case LibraryItemStatus.TODO: return '添加到等待';
                    case LibraryItemStatus.DOING: return '开始';
                    case LibraryItemStatus.DONE: return '完成';
                    case LibraryItemStatus.WAIT: return '搁置';
                    case LibraryItemStatus.GIVE_UP: return '放弃';
                    case LibraryItemStatus.ARCHIVED: return '归档';
                }
            }
            return '状态变更（无状态）';
        case LibraryLogType.score:
            return '评分';
        case LibraryLogType.note:
            return '备注';
        case LibraryLogType.timelineCutoff:
            return '时间线断点';
        case LibraryLogType.addToLibrary:
            return '添加到库';
        default:
            return '操作';
    }
}

function getTimelineCutoffTime(extra: LibraryExtra): number | undefined {
    let latestMs: number | undefined;

    for (const round of extra.rounds) {
        for (const log of round.logs) {
            if (log.type !== LibraryLogType.timelineCutoff) continue;
            const value = new Date(log.time).getTime();
            if (Number.isNaN(value)) continue;
            if (latestMs === undefined || value > latestMs) {
                latestMs = value;
            }
        }
    }

    if (latestMs !== undefined) {
        return latestMs;
    }
    if (extra.timelineCutoffTime) {
        const value = new Date(extra.timelineCutoffTime).getTime();
        if (!Number.isNaN(value)) {
            return value;
        }
    }
    return undefined;
}
