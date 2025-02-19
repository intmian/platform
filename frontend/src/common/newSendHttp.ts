import {EnvData, TaskIO, TaskStatus, ToolData} from "./backHttpDefine";
import config from "../config.json";

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
export async function UniPost(url: string, req: object) {
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

        if (!response.ok || (response.status !== undefined && response.status !== 200)) {
            console.debug('UniPost failed:', response)
            result.ok = false
            return result
        }
        const data: UniReturn = await response.json()
        if (data.code !== 0) {
            console.debug('UniPost failed:', data.msg)
            return result
        } else {
            result.ok = true
        }
        if (data.data !== undefined) {
            result.data = data.data
        } else {
            result.data = {}
            result.ok = false
        }
        return result
    } catch (error) {
        result.ok = false
        console.debug('UniPost failed:', error)
        return result
    }
}

export interface DebugParam {
    ints: number[]
    f64s: number[]
    strs: string[]
}

export function sendDebug(svr: string, cmd: string, req: DebugParam, callback: (ret: {
    data: never,
    ok: boolean
}) => void) {
    UniPost(config.api_base_url + '/debug/' + svr + '/' + cmd, req).then((res: UniResult) => {
        const result: { data: never, ok: boolean } = {
            data: res.data as never,
            ok: res.ok
        };
        callback(result);
    })
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

const cmd_api_base_url = config.api_base_url + '/service/cmd/';

export function sendCreateTool(req: CreateToolReq, callback: (ret: { data: CreateToolRet, ok: boolean }) => void) {
    UniPost(cmd_api_base_url + 'createTool', req).then((res: UniResult) => {
        const result: { data: CreateToolRet, ok: boolean } = {
            data: res.data as CreateToolRet,
            ok: res.ok
        };
        callback(result);
    });
}

export function sendUpdateTool(req: UpdateToolReq, callback: (ret: { data: UpdateToolRet, ok: boolean }) => void) {
    UniPost(cmd_api_base_url + 'updateTool', req).then((res: UniResult) => {
        const result: { data: UpdateToolRet, ok: boolean } = {
            data: res.data as UpdateToolRet,
            ok: res.ok
        };
        callback(result);
    });
}

export function sendGetTools(req: GetToolsReq, callback: (ret: { data: GetToolsRet, ok: boolean }) => void) {
    UniPost(cmd_api_base_url + 'getTools', req).then((res: UniResult) => {
        const result: { data: GetToolsRet, ok: boolean } = {
            data: res.data as GetToolsRet,
            ok: res.ok
        };
        if (result.ok) {
            result.data.ID2ToolData = new Map(Object.entries(result.data.ID2ToolData));
        }
        callback(result);
    });
}

export function sendGetToolScript(req: GetToolScriptReq, callback: (ret: {
    data: GetToolScriptRet,
    ok: boolean
}) => void) {
    UniPost(cmd_api_base_url + 'getToolScript', req).then((res: UniResult) => {
        const result: { data: GetToolScriptRet, ok: boolean } = {
            data: res.data as GetToolScriptRet,
            ok: res.ok
        };
        callback(result);
    });
}

export function sendCreateEnv(req: CreateEnvReq, callback: (ret: { data: CreateEnvRet, ok: boolean }) => void) {
    UniPost(cmd_api_base_url + 'createEnv', req).then((res: UniResult) => {
        const result: { data: CreateEnvRet, ok: boolean } = {
            data: res.data as CreateEnvRet,
            ok: res.ok
        };
        callback(result);
    });
}

export function sendGetEnvs(req: GetEnvsReq, callback: (ret: { data: GetEnvsRet, ok: boolean }) => void) {
    UniPost(cmd_api_base_url + 'getEnvs', req).then((res: UniResult) => {
        const result: { data: GetEnvsRet, ok: boolean } = {
            data: res.data as GetEnvsRet,
            ok: res.ok
        };
        callback(result);
    });
}

export function sendGetEnv(req: GetEnvReq, callback: (ret: { data: GetEnvRet, ok: boolean }) => void) {
    UniPost(cmd_api_base_url + 'getEnv', req).then((res: UniResult) => {
        const result: { data: GetEnvRet, ok: boolean } = {
            data: res.data as GetEnvRet,
            ok: res.ok
        };
        callback(result);
    });
}

export function sendGetFile(req: GetFileReq, callback: (ret: { data: GetFileRet, ok: boolean }) => void) {
    UniPost(cmd_api_base_url + 'getFile', req).then((res: UniResult) => {
        const result: { data: GetFileRet, ok: boolean } = {
            data: res.data as GetFileRet,
            ok: res.ok
        };
        callback(result);
    });
}

export function sendSetFile(req: SetFileReq, callback: (ret: { data: SetFileRet, ok: boolean }) => void) {
    UniPost(cmd_api_base_url + 'setFile', req).then((res: UniResult) => {
        const result: { data: SetFileRet, ok: boolean } = {
            data: res.data as SetFileRet,
            ok: res.ok
        };
        callback(result);
    });
}

export function sendSetEnv(req: SetEnvReq, callback: (ret: { data: SetEnvRet, ok: boolean }) => void) {
    UniPost(cmd_api_base_url + 'setEnv', req).then((res: UniResult) => {
        const result: { data: SetEnvRet, ok: boolean } = {
            data: res.data as SetEnvRet,
            ok: res.ok
        };
        callback(result);
    });
}

export function sendRunEnv(req: RunEnvReq, callback: (ret: { data: RunEnvRet, ok: boolean }) => void) {
    UniPost(cmd_api_base_url + 'runEnv', req).then((res: UniResult) => {
        const result: { data: RunEnvRet, ok: boolean } = {
            data: res.data as RunEnvRet,
            ok: res.ok
        };
        callback(result);
    });
}

export function sendGetTasks(req: GetTasksReq, callback: (ret: { data: GetTasksRet, ok: boolean }) => void) {
    UniPost(cmd_api_base_url + 'getTasks', req).then((res: UniResult) => {
        const result: { data: GetTasksRet, ok: boolean } = {
            data: res.data as GetTasksRet,
            ok: res.ok
        };
        callback(result);
    });
}

export function sendGetTask(req: GetTaskReq, callback: (ret: { data: GetTaskRet, ok: boolean }) => void) {
    UniPost(cmd_api_base_url + 'getTask', req).then((res: UniResult) => {
        const result: { data: GetTaskRet, ok: boolean } = {
            data: res.data as GetTaskRet,
            ok: res.ok
        };
        callback(result);
    });
}

export function sendStopTask(req: StopTaskReq, callback: (ret: { data: StopTaskRet, ok: boolean }) => void) {
    UniPost(cmd_api_base_url + 'stopTask', req).then((res: UniResult) => {
        const result: { data: StopTaskRet, ok: boolean } = {
            data: res.data as StopTaskRet,
            ok: res.ok
        };
        callback(result);
    });
}

export function sendTaskInput(req: TaskInputReq, callback: (ret: { data: TaskInputRet, ok: boolean }) => void) {
    UniPost(cmd_api_base_url + 'taskInput', req).then((res: UniResult) => {
        const result: { data: TaskInputRet, ok: boolean } = {
            data: res.data as TaskInputRet,
            ok: res.ok
        };
        callback(result);
    });
}

export interface DeleteToolReq {
    ToolID: string
}

export interface DeleteToolRet {
    Suc: boolean
}

export function sendDeleteTool(req: DeleteToolReq, callback: (ret: { data: DeleteToolRet, ok: boolean }) => void) {
    UniPost(cmd_api_base_url + 'deleteTool', req).then((res: UniResult) => {
        const result: { data: DeleteToolRet, ok: boolean } = {
            data: res.data as DeleteToolRet,
            ok: res.ok
        };
        callback(result);
    });
}

type WeatherPtl = {
    code: string;
    updateTime: string;
    fxLink: string;
    daily: {
        fxDate: string;
        sunrise: string;
        sunset: string;
        moonrise: string;
        moonset: string;
        moonPhase: string;
        moonPhaseIcon: string;
        tempMax: string;
        tempMin: string;
        iconDay: string;
        textDay: string;
        iconNight: string;
        textNight: string;
        wind360Day: string;
        windDirDay: string;
        windScaleDay: string;
        windSpeedDay: string;
        wind360Night: string;
        windDirNight: string;
        windScaleNight: string;
        windSpeedNight: string;
        humidity: string;
        precip: string;
        pressure: string;
        vis: string;
        cloud: string;
        uvIndex: string;
    }[];
    refer: {
        sources: string[];
        license: string[];
    };
};

type WeatherIndexPtl = {
    Code: string;
    UpdateTime: string;
    FxLink: string;
    Daily: {
        Date: string;
        Type: string;
        Name: string;
        Level: string;
        Category: string;
        Text: string;
    }[];
    Refer: {
        Sources: string[];
        License: string[];
    };
};

type RssItem = {
    Title: string;
    Link: string;
    PubDate: string;
};

export interface DayReport {
    Weather: WeatherPtl
    WeatherIndex: WeatherIndexPtl;
    BbcNews: RssItem[]
    NytNews: RssItem[]
    GoogleNews: {
        KeyWord: string;
        News: RssItem[];
    }[];
}

export interface WholeReport {
    BbcNews: RssItem[]
    NytNews: RssItem[]
    GoogleNews: {
        KeyWord: string;
        News: RssItem[];
    }[];
}

export interface GetReportReq {
    DayString: string
}

export interface GetReportRet {
    Suc: boolean
    Report: DayReport
}


export type GetWholeReportReq = object

export interface GetWholeReportRet {
    Suc: boolean
    Report: WholeReport
}


export type GetReportListReq = object

export interface GetReportListRet {
    Suc: boolean
    List: string[]
}


export type GenerateReportReq = object

export interface GenerateReportRet {
    Suc: boolean
}


const auto_api_base_url = config.api_base_url + '/service/auto/'

export function sendGetReport(req: GetReportReq, callback: (ret: { data: GetReportRet, ok: boolean }) => void) {
    UniPost(auto_api_base_url + 'getReport', req).then((res: UniResult) => {
        const result: { data: GetReportRet, ok: boolean } = {
            data: res.data as GetReportRet,
            ok: res.ok
        };

        callback(result);
    });
}

export function sendGetWholeReport(req: GetWholeReportReq, callback: (ret: {
    data: GetWholeReportRet,
    ok: boolean
}) => void) {
    UniPost(auto_api_base_url + 'getWholeReport', req).then((res: UniResult) => {
        const result: { data: GetWholeReportRet, ok: boolean } = {
            data: res.data as GetWholeReportRet,
            ok: res.ok
        };

        callback(result);
    });
}

export function sendGetReportList(req: GetReportListReq, callback: (ret: {
    data: GetReportListRet,
    ok: boolean
}) => void) {
    UniPost(auto_api_base_url + 'getReportList', req).then((res: UniResult) => {
        const result: { data: GetReportListRet, ok: boolean } = {
            data: res.data as GetReportListRet,
            ok: res.ok
        };

        callback(result);
    });
}

export function sendGenerateReport(req: GenerateReportReq, callback: (ret: {
    data: GenerateReportRet,
    ok: boolean
}) => void) {
    UniPost(auto_api_base_url + 'generateReport', req).then((res: UniResult) => {
        const result: { data: GenerateReportRet, ok: boolean } = {
            data: res.data as GenerateReportRet,
            ok: res.ok
        };

        callback(result);
    });
}

export async function getWebPing(url: string, attempts: number = 10): Promise<{ delays: number[], lossRate: number }> {
    const delays: number[] = [];
    let failedRequests = 0;

    const requests = Array.from({length: attempts}, async () => {
        await new Promise(resolve => setTimeout(resolve, Math.random() * 5000));
        const startTime = Date.now();

        try {
            // 发起 HTTP 请求
            await fetch(url, {
                mode: 'no-cors',
                headers: {
                    'Cache-Control': 'no-cache',  // 禁止缓存
                },
                cache: 'no-store',  // 强制不使用浏览器缓存
            });
            const endTime = Date.now();
            const latency = endTime - startTime;
            delays.push(latency);
        } catch (error) {
            console.error(`请求失败: ${error}`);
            delays.push(999); // 记录失败请求，延迟为 999ms
            failedRequests++;
        }
    });

    // 等待所有请求完成
    await Promise.all(requests);

    // 计算丢包率
    const lossRate = (failedRequests / attempts) * 100;

    return {
        delays,
        lossRate
    };
}