import config from "../config.json"
import {EnvData, TaskIO, TaskStatus, ToolData} from "./backHttpDefine";

export interface UniReturn {
    code: number
    msg: string
    data: object
}

export interface UniResult {
    data: object
    ok: boolean
}

// 通用的异步POST请求，只适配platform的通用后端返回格式，如果code不为0，或者没有code字段，返回null或者不为200的状态码，返回null
async function UniPost(url: string, req: object) {
    const result: UniResult = {
        data: {},
        ok: false
    }
    try {
        const response: Response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(req),
        });

        if (!response.ok || (response.status !== undefined && response.status !== 0)) {
            console.debug('UniPost failed:', response)
            result.ok = false
            return result
        }
        result.ok = true
        const data: UniReturn = await response.json()
        if (data.data !== undefined) {
            result.data = data.data
        }
        return result
    } catch (error) {
        result.ok = false
        console.debug('UniPost failed:', error)
        return result
    }
}

//=====以下为自动生成的代码=====
export interface CreateToolReq {
    Name: string
    Typ: number
}

export interface CreateToolRet {
    Suc: boolean
    ToolID: string
}


export interface UpdateToolReq {
    ToolID: string
    Name: string
    Content: string
}

export interface UpdateToolRet {
    Suc: boolean
}


export type GetToolsReq = object

export interface GetToolsRet {
    ID2ToolData: Map<string, ToolData>
}


export interface GetToolScriptReq {
    ToolID: string
}

export interface GetToolScriptRet {
    Script: string
}


export type CreateEnvReq = object

export interface CreateEnvRet {
    Suc: boolean
    EnvID: number
}


export type GetEnvsReq = object

export interface GetEnvsRet {
    EnvData: EnvData[]
}


export interface GetEnvReq {
    EnvID: number
}

export interface GetEnvRet {
    EnvData: EnvData
    AllFiles: string[]
}


export interface GetFileReq {
    EnvID: number
    FileName: string
}

export interface GetFileRet {
    Content: string
}


export interface SetFileReq {
    EnvID: number
    FileName: string
    Content: string
}

export type SetFileRet = object


export interface SetEnvReq {
    EnvID: number
    params: string[]
    note: string
    bindToolID: string
}

export type SetEnvRet = object


export interface RunEnvReq {
    EnvID: number
    ToolID: string
    Params: string[]
}

export type RunEnvRet = object


export interface GetTasksReq {
    EvnID: number
}

export interface GetTasksRet {
    TaskData: {
        TaskIndex: number
        Status: TaskStatus
    }
    TaskIndex: number
    Status: number
}


export interface GetTaskReq {
    EnvID: number
    TaskIndex: number
    LastIndex: number
}

export interface GetTaskRet {
    IOs: TaskIO[]
    Status: TaskStatus
}


export interface StopTaskReq {
    EvnID: number
    TaskIndex: number
}

export type StopTaskRet = object


export interface TaskInputReq {
    EvnID: number
    TaskIndex: number
    Content: string
}

export type TaskInputRet = object


export function sendCreateTool(req: CreateToolReq, callback: (ret: { data: CreateToolRet, ok: boolean }) => void) {
    UniPost(config.api_base_url + 'createTool', req).then((res: UniResult) => {
        const result: { data: CreateToolRet, ok: boolean } = {
            data: res.data as CreateToolRet,
            ok: res.ok
        };
        callback(result);
    });
}

export function sendUpdateTool(req: UpdateToolReq, callback: (ret: { data: UpdateToolRet, ok: boolean }) => void) {
    UniPost(config.api_base_url + 'updateTool', req).then((res: UniResult) => {
        const result: { data: UpdateToolRet, ok: boolean } = {
            data: res.data as UpdateToolRet,
            ok: res.ok
        };
        callback(result);
    });
}

export function sendGetTools(req: GetToolsReq, callback: (ret: { data: GetToolsRet, ok: boolean }) => void) {
    UniPost(config.api_base_url + 'getTools', req).then((res: UniResult) => {
        const result: { data: GetToolsRet, ok: boolean } = {
            data: res.data as GetToolsRet,
            ok: res.ok
        };
        callback(result);
    });
}

export function sendGetToolScript(req: GetToolScriptReq, callback: (ret: {
    data: GetToolScriptRet,
    ok: boolean
}) => void) {
    UniPost(config.api_base_url + 'getToolScript', req).then((res: UniResult) => {
        const result: { data: GetToolScriptRet, ok: boolean } = {
            data: res.data as GetToolScriptRet,
            ok: res.ok
        };
        callback(result);
    });
}

export function sendCreateEnv(req: CreateEnvReq, callback: (ret: { data: CreateEnvRet, ok: boolean }) => void) {
    UniPost(config.api_base_url + 'createEnv', req).then((res: UniResult) => {
        const result: { data: CreateEnvRet, ok: boolean } = {
            data: res.data as CreateEnvRet,
            ok: res.ok
        };
        callback(result);
    });
}

export function sendGetEnvs(req: GetEnvsReq, callback: (ret: { data: GetEnvsRet, ok: boolean }) => void) {
    UniPost(config.api_base_url + 'getEnvs', req).then((res: UniResult) => {
        const result: { data: GetEnvsRet, ok: boolean } = {
            data: res.data as GetEnvsRet,
            ok: res.ok
        };
        callback(result);
    });
}

export function sendGetEnv(req: GetEnvReq, callback: (ret: { data: GetEnvRet, ok: boolean }) => void) {
    UniPost(config.api_base_url + 'getEnv', req).then((res: UniResult) => {
        const result: { data: GetEnvRet, ok: boolean } = {
            data: res.data as GetEnvRet,
            ok: res.ok
        };
        callback(result);
    });
}

export function sendGetFile(req: GetFileReq, callback: (ret: { data: GetFileRet, ok: boolean }) => void) {
    UniPost(config.api_base_url + 'getFile', req).then((res: UniResult) => {
        const result: { data: GetFileRet, ok: boolean } = {
            data: res.data as GetFileRet,
            ok: res.ok
        };
        callback(result);
    });
}

export function sendSetFile(req: SetFileReq, callback: (ret: { data: SetFileRet, ok: boolean }) => void) {
    UniPost(config.api_base_url + 'setFile', req).then((res: UniResult) => {
        const result: { data: SetFileRet, ok: boolean } = {
            data: res.data as SetFileRet,
            ok: res.ok
        };
        callback(result);
    });
}

export function sendSetEnv(req: SetEnvReq, callback: (ret: { data: SetEnvRet, ok: boolean }) => void) {
    UniPost(config.api_base_url + 'setEnv', req).then((res: UniResult) => {
        const result: { data: SetEnvRet, ok: boolean } = {
            data: res.data as SetEnvRet,
            ok: res.ok
        };
        callback(result);
    });
}

export function sendRunEnv(req: RunEnvReq, callback: (ret: { data: RunEnvRet, ok: boolean }) => void) {
    UniPost(config.api_base_url + 'runEnv', req).then((res: UniResult) => {
        const result: { data: RunEnvRet, ok: boolean } = {
            data: res.data as RunEnvRet,
            ok: res.ok
        };
        callback(result);
    });
}

export function sendGetTasks(req: GetTasksReq, callback: (ret: { data: GetTasksRet, ok: boolean }) => void) {
    UniPost(config.api_base_url + 'getTasks', req).then((res: UniResult) => {
        const result: { data: GetTasksRet, ok: boolean } = {
            data: res.data as GetTasksRet,
            ok: res.ok
        };
        callback(result);
    });
}

export function sendGetTask(req: GetTaskReq, callback: (ret: { data: GetTaskRet, ok: boolean }) => void) {
    UniPost(config.api_base_url + 'getTask', req).then((res: UniResult) => {
        const result: { data: GetTaskRet, ok: boolean } = {
            data: res.data as GetTaskRet,
            ok: res.ok
        };
        callback(result);
    });
}

export function sendStopTask(req: StopTaskReq, callback: (ret: { data: StopTaskRet, ok: boolean }) => void) {
    UniPost(config.api_base_url + 'stopTask', req).then((res: UniResult) => {
        const result: { data: StopTaskRet, ok: boolean } = {
            data: res.data as StopTaskRet,
            ok: res.ok
        };
        callback(result);
    });
}

export function sendTaskInput(req: TaskInputReq, callback: (ret: { data: TaskInputRet, ok: boolean }) => void) {
    UniPost(config.api_base_url + 'taskInput', req).then((res: UniResult) => {
        const result: { data: TaskInputRet, ok: boolean } = {
            data: res.data as TaskInputRet,
            ok: res.ok
        };
        callback(result);
    });
}