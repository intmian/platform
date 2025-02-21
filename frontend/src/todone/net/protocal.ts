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
    Tags: string[];
    Done: boolean;
    HaveSubTask: boolean;
}