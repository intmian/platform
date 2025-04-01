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
    HaveSubTask: boolean;

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