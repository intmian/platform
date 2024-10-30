export interface ToolData {
    Name: string
    Typ: number
    Content: string
    Created: string
    Updated: string
    Addr: string
}

export interface EnvData {
    ID: number
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
