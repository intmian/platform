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
        category: '',
        isFavorite: false,
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
        if (parsed.isFavorite === undefined) {
            parsed.isFavorite = false;
        }
        // `waitReason` 已废弃：统一改为读取最新搁置日志 comment。
        // 为避免继续使用历史项目层字段，这里解析后主动清理。
        delete parsed.waitReason;

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
    const now = new Date().toISOString();
    const normalizedExtra = {
        ...extra,
        updatedAt: now,
    } as LibraryExtra;
    migrateLegacyComplexScoreFields(normalizedExtra);
    // 兼容历史数据：以下字段已废弃，运行时可兜底读取，但保存时统一清空。
    delete normalizedExtra.status;
    delete normalizedExtra.todoReason;
    delete normalizedExtra.waitSince;
    delete normalizedExtra.todoSince;
    delete normalizedExtra.timelineCutoffTime;
    delete normalizedExtra.scoreMode;
    delete normalizedExtra.objScore;
    delete normalizedExtra.subScore;
    delete normalizedExtra.innovateScore;
    delete normalizedExtra.mainScore;
    delete normalizedExtra.comment;
    delete normalizedExtra.waitReason;
    return JSON.stringify(normalizedExtra);
}

export function touchLibraryUpdatedAt(extra: LibraryExtra): LibraryExtra {
    extra.updatedAt = new Date().toISOString();
    return extra;
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
 * 是否允许在同状态下继续写入原因日志
 */
export function canUpdateReasonOnSameStatus(status?: LibraryItemStatus): boolean {
    return status === LibraryItemStatus.WAIT || status === LibraryItemStatus.TODO;
}

export interface LibraryStatusSnapshot {
    status?: LibraryItemStatus;
    todoReason: string;
    waitSince?: string;
    todoSince?: string;
}

export interface LibraryDisplayStatusInfo {
    name: string;
    color: string;
    isExpiredWait: boolean;
}

export interface LibraryDerivedMeta {
    statusSnapshot: LibraryStatusSnapshot;
    latestWaitReason: string;
    isWaitExpired: boolean;
    displayStatus: LibraryDisplayStatusInfo;
    mainScore: LibraryLogEntry | null;
    createdAtMs: number;
    updatedAtMs: number;
}

function parseTimeMs(value?: string): number {
    if (!value) {
        return Number.NaN;
    }
    const parsed = new Date(value).getTime();
    return Number.isNaN(parsed) ? Number.NaN : parsed;
}

export function deriveLibraryMeta(extra: LibraryExtra, nowMs: number = Date.now()): LibraryDerivedMeta {
    let latestStatusLog: LibraryLogEntry | undefined;
    let latestStatusMs = Number.MIN_SAFE_INTEGER;
    let latestWaitReason = '';
    let latestWaitReasonMs = Number.MIN_SAFE_INTEGER;
    let latestScoreLog: LibraryLogEntry | null = null;
    let latestScoreMs = Number.MIN_SAFE_INTEGER;
    let latestScoreRoundIndex = -1;
    let latestScoreLogIndex = -1;

    extra.rounds.forEach((round, roundIndex) => {
        round.logs.forEach((log, logIndex) => {
            const timeMs = parseTimeMs(log.time);
            const safeTimeMs = Number.isNaN(timeMs) ? Number.MIN_SAFE_INTEGER : timeMs;

            if (log.type === LibraryLogType.changeStatus) {
                if (!Number.isNaN(timeMs) && timeMs >= latestStatusMs) {
                    latestStatusMs = timeMs;
                    latestStatusLog = log;
                }
                if (
                    log.status === LibraryItemStatus.WAIT
                    && !Number.isNaN(timeMs)
                    && timeMs >= latestWaitReasonMs
                ) {
                    latestWaitReasonMs = timeMs;
                    latestWaitReason = (log.comment || '').trim();
                }
            }

            if (log.type !== LibraryLogType.score) {
                return;
            }

            if (
                latestScoreLog === null
                || safeTimeMs > latestScoreMs
                || (safeTimeMs === latestScoreMs && (
                    roundIndex > latestScoreRoundIndex
                    || (roundIndex === latestScoreRoundIndex && logIndex > latestScoreLogIndex)
                ))
            ) {
                latestScoreLog = log;
                latestScoreMs = safeTimeMs;
                latestScoreRoundIndex = roundIndex;
                latestScoreLogIndex = logIndex;
            }
        });
    });

    const statusSnapshot: LibraryStatusSnapshot = (() => {
        if (latestStatusLog && latestStatusLog.status !== undefined) {
            if (latestStatusLog.status === LibraryItemStatus.TODO) {
                const logReason = (latestStatusLog.comment || '').trim();
                return {
                    status: latestStatusLog.status,
                    todoReason: logReason || (extra.todoReason || '').trim(),
                    todoSince: latestStatusLog.time,
                };
            }
            if (latestStatusLog.status === LibraryItemStatus.WAIT) {
                return {
                    status: latestStatusLog.status,
                    todoReason: '',
                    waitSince: latestStatusLog.time,
                };
            }
            return {
                status: latestStatusLog.status,
                todoReason: '',
            };
        }

        if (extra.status === LibraryItemStatus.TODO) {
            return {
                status: extra.status,
                todoReason: (extra.todoReason || '').trim(),
                todoSince: extra.todoSince,
            };
        }
        if (extra.status === LibraryItemStatus.WAIT) {
            return {
                status: extra.status,
                todoReason: '',
                waitSince: extra.waitSince,
            };
        }
        return {
            status: extra.status,
            todoReason: '',
        };
    })();

    if (!latestWaitReason) {
        latestWaitReason = (extra.waitReason || '').trim();
    }

    const isWaitExpiredValue = (() => {
        const monthMs = 30 * 24 * 60 * 60 * 1000;
        if (latestStatusLog) {
            if (latestStatusLog.status !== LibraryItemStatus.WAIT) return false;
            const reason = (latestStatusLog.comment || '').trim();
            if (reason) return false;
            const start = parseTimeMs(latestStatusLog.time);
            if (Number.isNaN(start)) return false;
            return (nowMs - start) >= monthMs;
        }

        if (extra.status !== LibraryItemStatus.WAIT) return false;
        const reason = (extra.waitReason || '').trim();
        if (reason) return false;
        const start = parseTimeMs(extra.waitSince || '');
        if (Number.isNaN(start)) return false;
        return (nowMs - start) >= monthMs;
    })();

    const selectedMainScore = (() => {
        if (extra.mainScoreRoundIndex === undefined || extra.mainScoreLogIndex === undefined) {
            return null;
        }
        const selectedLog = extra.rounds[extra.mainScoreRoundIndex]?.logs[extra.mainScoreLogIndex];
        if (selectedLog?.type === LibraryLogType.score) {
            return selectedLog;
        }
        return null;
    })();

    const mainScore = selectedMainScore || latestScoreLog || legacyMainScoreToLog(extra);
    const displayStatus: LibraryDisplayStatusInfo = (() => {
        if (statusSnapshot.status === LibraryItemStatus.ARCHIVED) {
            return {
                name: LibraryStatusNames[LibraryItemStatus.ARCHIVED],
                color: LibraryStatusColors[LibraryItemStatus.ARCHIVED],
                isExpiredWait: false,
            };
        }
        if (isWaitExpiredValue) {
            return {
                name: '鸽了',
                color: LibraryStatusColors[LibraryItemStatus.GIVE_UP],
                isExpiredWait: true,
            };
        }
        if (statusSnapshot.status === undefined) {
            return {
                name: '无状态',
                color: '#bfbfbf',
                isExpiredWait: false,
            };
        }
        return {
            name: LibraryStatusNames[statusSnapshot.status],
            color: LibraryStatusColors[statusSnapshot.status],
            isExpiredWait: false,
        };
    })();

    const createdAtMs = parseTimeMs(extra.createdAt);
    const updatedAtMs = parseTimeMs(extra.updatedAt);

    return {
        statusSnapshot,
        latestWaitReason,
        isWaitExpired: isWaitExpiredValue,
        displayStatus,
        mainScore,
        createdAtMs: Number.isNaN(createdAtMs) ? Number.MIN_SAFE_INTEGER : createdAtMs,
        updatedAtMs: Number.isNaN(updatedAtMs) ? Number.MIN_SAFE_INTEGER : updatedAtMs,
    };
}

/**
 * 当前状态统一从历史日志推导。
 * 若历史日志不存在，则兜底读取已废弃字段，保证旧数据可读。
 */
export function getCurrentStatusSnapshot(extra: LibraryExtra): LibraryStatusSnapshot {
    const latestStatusLog = getLatestStatusLog(extra);
    if (latestStatusLog && latestStatusLog.status !== undefined) {
        if (latestStatusLog.status === LibraryItemStatus.TODO) {
            const logReason = (latestStatusLog.comment || '').trim();
            return {
                status: latestStatusLog.status,
                todoReason: logReason || (extra.todoReason || '').trim(),
                todoSince: latestStatusLog.time,
            };
        }
        if (latestStatusLog.status === LibraryItemStatus.WAIT) {
            return {
                status: latestStatusLog.status,
                todoReason: '',
                waitSince: latestStatusLog.time,
            };
        }
        return {
            status: latestStatusLog.status,
            todoReason: '',
        };
    }

    // 兼容历史存量：当尚无状态日志时，回退到旧字段。
    if (extra.status === LibraryItemStatus.TODO) {
        return {
            status: extra.status,
            todoReason: (extra.todoReason || '').trim(),
            todoSince: extra.todoSince,
        };
    }
    if (extra.status === LibraryItemStatus.WAIT) {
        return {
            status: extra.status,
            todoReason: '',
            waitSince: extra.waitSince,
        };
    }
    return {
        status: extra.status,
        todoReason: '',
    };
}

export function getCurrentStatus(extra: LibraryExtra): LibraryItemStatus | undefined {
    return getCurrentStatusSnapshot(extra).status;
}

export function getCurrentTodoReason(extra: LibraryExtra): string {
    return getCurrentStatusSnapshot(extra).todoReason;
}

/**
 * 添加状态变更日志
 */
export function addStatusLog(extra: LibraryExtra, newStatus?: LibraryItemStatus, comment?: string): LibraryExtra {
    const currentSnapshot = getCurrentStatusSnapshot(extra);
    const isSameStatus = newStatus === currentSnapshot.status;
    if (isSameStatus && !canUpdateReasonOnSameStatus(newStatus)) {
        return extra;
    }
    const normalizedComment = canUpdateReasonOnSameStatus(newStatus)
        ? (comment?.trim() || '')
        : comment;

    if (isSameStatus && newStatus === LibraryItemStatus.TODO) {
        const prevReason = currentSnapshot.todoReason;
        if (prevReason === normalizedComment) {
            return extra;
        }
    }
    if (isSameStatus && newStatus === LibraryItemStatus.WAIT) {
        const prevReason = getLatestWaitReason(extra);
        if (prevReason === normalizedComment) {
            return extra;
        }
    }

    const now = new Date().toISOString();
    const currentRound = extra.rounds[extra.currentRound];
    if (currentRound) {
        currentRound.logs.push({
            type: LibraryLogType.changeStatus,
            time: now,
            status: newStatus,
            comment: normalizedComment,
        });
    }
    extra.updatedAt = now;
    
    // 如果状态变为完成，设置周目结束时间
    if (newStatus === LibraryItemStatus.DONE && currentRound) {
        currentRound.endTime = now;
    }
    
    return extra;
}

export function getLatestWaitReason(extra: LibraryExtra): string {
    let latestWaitReason = '';
    let latestTimeMs = Number.MIN_SAFE_INTEGER;

    extra.rounds.forEach((round) => {
        round.logs.forEach((log) => {
            if (log.type !== LibraryLogType.changeStatus || log.status !== LibraryItemStatus.WAIT) {
                return;
            }

            const timeMs = new Date(log.time).getTime();
            if (Number.isNaN(timeMs)) {
                return;
            }

            if (timeMs >= latestTimeMs) {
                latestTimeMs = timeMs;
                latestWaitReason = (log.comment || '').trim();
            }
        });
    });

    if (latestWaitReason) {
        return latestWaitReason;
    }
    // 兼容历史存量：旧版本等待原因写在项目层 waitReason。
    return (extra.waitReason || '').trim();
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
    if (latestStatusLog) {
        if (latestStatusLog.status !== LibraryItemStatus.WAIT) return false;
        const reason = (latestStatusLog.comment || '').trim();
        if (reason) return false;
        const start = new Date(latestStatusLog.time).getTime();
        if (Number.isNaN(start)) return false;
        const monthMs = 30 * 24 * 60 * 60 * 1000;
        return (Date.now() - start) >= monthMs;
    }

    // 兼容历史存量：无状态日志时，回退旧字段。
    if (extra.status !== LibraryItemStatus.WAIT) return false;
    const reason = (extra.waitReason || '').trim();
    if (reason) return false;
    const start = new Date(extra.waitSince || '').getTime();
    if (Number.isNaN(start)) return false;
    const monthMs = 30 * 24 * 60 * 60 * 1000;
    return (Date.now() - start) >= monthMs;
}

/**
 * @deprecated 状态缓存字段已废弃，状态改为从历史日志实时推导。
 */
export function syncStatusCacheFromLogs(extra: LibraryExtra): LibraryExtra {
    return extra;
}

export function getDisplayStatusInfo(extra: LibraryExtra): {name: string; color: string; isExpiredWait: boolean} {
    const currentStatus = getCurrentStatus(extra);
    if (currentStatus === LibraryItemStatus.ARCHIVED) {
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
    if (currentStatus === undefined) {
        return {
            name: '无状态',
            color: '#bfbfbf',
            isExpiredWait: false,
        };
    }
    return {
        name: LibraryStatusNames[currentStatus],
        color: LibraryStatusColors[currentStatus],
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
    comment?: string,
    options?: {
        mode?: 'simple' | 'complex';
        objScore?: LibraryExtra['objScore'];
        subScore?: LibraryExtra['subScore'];
        innovateScore?: LibraryExtra['innovateScore'];
    }
): LibraryExtra {
    const now = new Date().toISOString();
    const currentRound = extra.rounds[extra.currentRound];
    if (currentRound) {
        const resolvedMode = options?.mode === 'complex' ? 'complex' : 'simple';
        currentRound.logs.push({
            type: LibraryLogType.score,
            time: now,
            score: score,
            scorePlus: plus,
            scoreSub: sub,
            comment: comment,
            scoreMode: resolvedMode,
            objScore: resolvedMode === 'complex' ? options?.objScore : undefined,
            subScore: resolvedMode === 'complex' ? options?.subScore : undefined,
            innovateScore: resolvedMode === 'complex' ? options?.innovateScore : undefined,
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
        return legacyMainScoreToLog(extra);
    }
    const round = extra.rounds[extra.mainScoreRoundIndex];
    if (!round) return legacyMainScoreToLog(extra);
    const scoreLog = round.logs[extra.mainScoreLogIndex];
    if (scoreLog?.type === LibraryLogType.score) {
        return scoreLog;
    }
    return legacyMainScoreToLog(extra);
}

export interface LibraryComplexScoreSnapshot {
    mode: 'simple' | 'complex';
    objScore?: LibraryExtra['objScore'];
    subScore?: LibraryExtra['subScore'];
    innovateScore?: LibraryExtra['innovateScore'];
}

/**
 * 复杂评分相关数据优先从评分日志读取；
 * 若日志中不存在（历史数据），再兜底读取已废弃的 extra 字段。
 */
export function getComplexScoreSnapshot(extra: LibraryExtra, scoreLog?: LibraryLogEntry | null): LibraryComplexScoreSnapshot {
    const targetScoreLog = scoreLog || getMainScore(extra);
    if (targetScoreLog?.type === LibraryLogType.score) {
        let mode = targetScoreLog.scoreMode;
        if (!mode && (targetScoreLog.objScore || targetScoreLog.subScore || targetScoreLog.innovateScore)) {
            mode = 'complex';
        }
        if (mode === 'complex') {
            return {
                mode: 'complex',
                objScore: targetScoreLog.objScore,
                subScore: targetScoreLog.subScore,
                innovateScore: targetScoreLog.innovateScore,
            };
        }
        if (mode === 'simple') {
            return {mode: 'simple'};
        }
    }

    const legacyMode = extra.scoreMode === 'complex' ? 'complex' : 'simple';
    if (legacyMode === 'complex') {
        return {
            mode: 'complex',
            objScore: extra.objScore,
            subScore: extra.subScore,
            innovateScore: extra.innovateScore,
        };
    }
    return {mode: 'simple'};
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
    // 兼容历史存量：早期仅写项目层 timelineCutoffTime。
    if (extra.timelineCutoffTime) {
        const value = new Date(extra.timelineCutoffTime).getTime();
        if (!Number.isNaN(value)) {
            return value;
        }
    }
    return undefined;
}

function legacyMainScoreToLog(extra: LibraryExtra): LibraryLogEntry | null {
    // 兼容历史存量：无评分日志时，兜底读取已废弃的 extra.mainScore / extra.comment。
    if (!extra.mainScore || extra.mainScore.value <= 0) {
        return null;
    }
    const legacyMode = extra.scoreMode === 'complex' ? 'complex' : 'simple';
    return {
        type: LibraryLogType.score,
        time: extra.updatedAt || extra.createdAt,
        score: extra.mainScore.value,
        scorePlus: extra.mainScore.plus,
        scoreSub: extra.mainScore.sub,
        comment: (extra.mainScore.comment || extra.comment || '').trim() || undefined,
        scoreMode: legacyMode,
        objScore: legacyMode === 'complex' ? extra.objScore : undefined,
        subScore: legacyMode === 'complex' ? extra.subScore : undefined,
        innovateScore: legacyMode === 'complex' ? extra.innovateScore : undefined,
    };
}

function migrateLegacyComplexScoreFields(extra: LibraryExtra): void {
    if (extra.scoreMode !== 'complex') {
        return;
    }
    if (!extra.objScore && !extra.subScore && !extra.innovateScore) {
        return;
    }

    const selectedRoundIndex = extra.mainScoreRoundIndex;
    const selectedLogIndex = extra.mainScoreLogIndex;
    if (selectedRoundIndex !== undefined && selectedLogIndex !== undefined) {
        const selectedLog = extra.rounds[selectedRoundIndex]?.logs[selectedLogIndex];
        if (selectedLog?.type === LibraryLogType.score) {
            selectedLog.scoreMode = 'complex';
            if (selectedLog.objScore === undefined) selectedLog.objScore = extra.objScore;
            if (selectedLog.subScore === undefined) selectedLog.subScore = extra.subScore;
            if (selectedLog.innovateScore === undefined) selectedLog.innovateScore = extra.innovateScore;
            return;
        }
    }

    // 没有主评分索引时，回填到最新一条评分日志，避免保存时丢失历史复杂评分信息。
    for (let i = extra.rounds.length - 1; i >= 0; i--) {
        const round = extra.rounds[i];
        for (let j = round.logs.length - 1; j >= 0; j--) {
            const log = round.logs[j];
            if (log.type !== LibraryLogType.score) continue;
            log.scoreMode = 'complex';
            if (log.objScore === undefined) log.objScore = extra.objScore;
            if (log.subScore === undefined) log.subScore = extra.subScore;
            if (log.innovateScore === undefined) log.innovateScore = extra.innovateScore;
            return;
        }
    }
}
