import {
    LibraryExtra,
    LibraryItemFull,
    LibraryItemStatus,
    LibraryLogEntry,
    LibraryLogType,
    LibraryRound,
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
        category: '',
        status: LibraryItemStatus.TODO,
        currentRound: 0,
        rounds: [{
            name: '首周目',
            logs: [{
                type: LibraryLogType.changeStatus,
                time: now,
                status: LibraryItemStatus.TODO,
                comment: '添加到库'
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
        if (parsed.status === undefined) {
            parsed.status = LibraryItemStatus.TODO;
        }
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
export function addStatusLog(extra: LibraryExtra, newStatus: LibraryItemStatus, comment?: string): LibraryExtra {
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
    extra.updatedAt = now;
    
    // 如果状态变为完成，设置周目结束时间
    if (newStatus === LibraryItemStatus.DONE && currentRound) {
        currentRound.endTime = now;
    }
    
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
 * 从多个 Library 项目中提取时间线
 */
export function extractTimeline(items: LibraryItemFull[]): TimelineEntry[] {
    const entries: TimelineEntry[] = [];
    
    for (const item of items) {
        for (const round of item.extra.rounds) {
            for (const log of round.logs) {
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
                    case LibraryItemStatus.TODO: return '添加到待看';
                    case LibraryItemStatus.DOING: return '开始';
                    case LibraryItemStatus.DONE: return '完成';
                    case LibraryItemStatus.WAIT: return '搁置';
                    case LibraryItemStatus.GIVE_UP: return '放弃';
                }
            }
            return '状态变更';
        case LibraryLogType.score:
            return '评分';
        case LibraryLogType.note:
            return '备注';
        default:
            return '操作';
    }
}
