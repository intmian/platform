export interface ToolData {
    Name: string
    Typ: number
    Content: string
    CreatedAt: string
    UpdatedAt: string
    Addr: string
}

export interface EnvData {
    Param: string[]
    DefaultToolID: string
    Note: string
}

export enum TaskStatus {
    Running = 0,
    End = 1,
    ForceEnd = 2,
}

export interface TaskIO {
    From: string
    Content: string
}
