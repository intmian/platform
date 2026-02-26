export interface PDir {
    ID: number;
    Title: string;
    Note: string;
    Index: number;
}

export interface PGroup {
    ID: number;
    Title: string;
    Note: string;
    Index: number;
    Type?: number; // GroupType: 0=Normal, 1=Library
}

export interface PDirTree {
    RootDir: PDir;
    ChildrenDir: PDirTree[];
    ChildrenGrp: PGroup[];

    // 以下是前端补充数据
    Delete: boolean;
}

export interface PSubGroup {
    ID: number;
    Title: string;
    Note: string;
    Index: number;
}

export interface PTask {
    ID: number;
    Title: string;
    Note: string;
    Index: number;
    Tags: string[] | null;
    Done: boolean;
    ParentID: number;

    // 额外信息
    TaskType: number
    Started: boolean // 是否开始
    // 开始时间
    BeginTime: string
    // 结束时间或者截止时间
    EndTime: string

    Wait4: string
}

export enum TaskType {
    TODO = 0,
    DOING = 1,
}

export interface TaskKey {
    DirID: number
    GroupID: number
    SubGroupID: number
    TaskID: number
}

export enum LibraryItemStatus {
    TODO = 0,
    DOING = 1,
    DONE = 2,
    WAIT = 3,
    GIVE_UP = 4,
    ARCHIVED = 5,
}

export enum LibraryLogType {
    changeStatus = 0, // 改变状态
    score = 1, // 评分
    note = 2, // 备注
    timelineCutoff = 3, // 时间线截断（此前历史不进入总时间线）
    addToLibrary = 4, // 添加到库（独立事件）
}

export interface LibraryLog {
    type: LibraryLogType
    time: string
    score?: number // 评分
    note?: LibraryNote // 备注
}

// 单个体验周目
export interface LibrarySubLogs {
    name: string
    logs: LibraryLog[]
}

// 全周期
export interface LibraryLogs {
    subLogs: LibrarySubLogs[]
}

// 备注
export interface LibraryNote {
    name: string
    author: string
    pictureAddress: string
    time: string
    logs: LibraryLogs
}

export interface LibraryScore {
    mainScore: boolean // 是否为主评分
    score: number // 评分
    comment?: string // 评分备注
}

export interface LibraryItem {
    id: number
    name: string
    note: string
}

// 复杂评分数据（与 jianxing 一致）
export interface LibraryScoreData {
    value: number       // 1-5分
    plus: boolean       // 加分
    sub: boolean        // 减分
    comment: string     // 评分说明
}

// Library 扩展数据，存储在 Task.Note 字段中（JSON 格式）
export interface LibraryExtra {
    pictureAddress: string          // 原始封面图地址
    pictureAddressDetail?: string   // 详情封面图地址（裁剪后）
    picturePreview?: string         // 预览封面图地址（照片墙/时间线）
    pictureAddressPreview?: string  // [deprecated] 旧预览字段，兼容历史数据
    author: string                  // 作者/制作方
    year?: number                   // 作品年份
    remark?: string                 // 作品备注
    waitReason?: string             // [deprecated] 项目层搁置原因（已停用，统一使用最新搁置日志）
    waitSince?: string              // [deprecated] 最近一次搁置开始时间（改为从最新状态日志推导）
    todoReason?: string             // [deprecated] 等待二级状态（改为从最新状态日志推导）
    todoSince?: string              // [deprecated] 最近一次等待设置时间（改为从最新状态日志推导）
    category: string                // 分类（动漫/电影/游戏/小说等）
    isFavorite?: boolean            // 是否收藏
    status?: LibraryItemStatus      // [deprecated] 当前状态（改为从最新状态日志推导）
    currentRound: number            // 当前周目索引
    rounds: LibraryRound[]          // 所有周目数据
    mainScoreRoundIndex?: number    // 主评分所在周目索引
    mainScoreLogIndex?: number      // 主评分所在日志索引
    createdAt: string               // 创建时间
    updatedAt: string               // 更新时间
    
    // 复杂评分模式字段（可选）
    scoreMode?: 'simple' | 'complex'  // [deprecated] 评分模式（改为从评分日志推导）
    objScore?: LibraryScoreData       // [deprecated] 客观评分（改为从评分日志推导）
    subScore?: LibraryScoreData       // [deprecated] 主观评分（改为从评分日志推导）
    innovateScore?: LibraryScoreData  // [deprecated] 创新评分（改为从评分日志推导）
    mainScore?: LibraryScoreData      // [deprecated] 主评分快照（改为从评分日志推导）
    comment?: string                  // [deprecated] 总评（改为从主评分日志 comment 读取）
    timelineCutoffTime?: string       // [deprecated] 时间线截断时间（改为从 timelineCutoff 日志推导）
}

// 单个周目
export interface LibraryRound {
    name: string                    // 周目名称（如：首周目、二周目、DLC1等）
    logs: LibraryLogEntry[]         // 该周目的日志
    startTime: string               // 开始时间
    endTime?: string                // 结束时间
}

// 日志条目（扩展 LibraryLog）
export interface LibraryLogEntry {
    type: LibraryLogType
    time: string
    status?: LibraryItemStatus      // 状态变更时的新状态
    score?: number                  // 评分（1-5）
    scorePlus?: boolean             // 评分加分
    scoreSub?: boolean              // 评分减分
    comment?: string                // 备注/评论
    scoreMode?: 'simple' | 'complex' // 评分模式（仅 score 日志）
    objScore?: LibraryScoreData      // 客观评分（仅 complex score 日志）
    subScore?: LibraryScoreData      // 主观评分（仅 complex score 日志）
    innovateScore?: LibraryScoreData // 创新评分（仅 complex score 日志）
}

// 从 Task 解析出的 Library 完整数据
export interface LibraryItemFull {
    taskId: number
    title: string
    extra: LibraryExtra
    index: number
    tags: string[] | null
}

// 时间线条目
export interface TimelineEntry {
    time: string
    itemTitle: string
    itemId: number
    pictureAddress: string
    pictureAddressDetail?: string
    picturePreview?: string
    pictureAddressPreview?: string
    roundName: string
    logType: LibraryLogType
    status?: LibraryItemStatus
    score?: number
    comment?: string
}

// 状态显示名称映射
export const LibraryStatusNames: Record<LibraryItemStatus, string> = {
    [LibraryItemStatus.TODO]: '等待',
    [LibraryItemStatus.DOING]: '进行中',
    [LibraryItemStatus.DONE]: '已完成',
    [LibraryItemStatus.WAIT]: '搁置',
    [LibraryItemStatus.GIVE_UP]: '放弃',
    [LibraryItemStatus.ARCHIVED]: '归档',
}

// 状态颜色映射
export const LibraryStatusColors: Record<LibraryItemStatus, string> = {
    [LibraryItemStatus.TODO]: '#d9d9d9',
    [LibraryItemStatus.DOING]: '#1890ff',
    [LibraryItemStatus.DONE]: '#52c41a',
    [LibraryItemStatus.WAIT]: '#faad14',
    [LibraryItemStatus.GIVE_UP]: '#ff4d4f',
    [LibraryItemStatus.ARCHIVED]: '#595959',
}

// GroupType 枚举
export enum GroupType {
    Normal = 0,
    Library = 1,
}
