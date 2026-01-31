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
}

export enum LibraryLogType {
    changeStatus = 0, // 改变状态
    score = 1, // 评分
    note = 2, // 备注
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
}

export interface LibraryItem {
    id: number
    name: string
    note: string
}


