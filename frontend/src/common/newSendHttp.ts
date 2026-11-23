import {TaskIO, TaskStatus} from "./backHttpDefine";
import {message} from "antd";
import {request} from "./api";

export interface UniResult {
    data: object
    ok: boolean
}

// 旧调用方用的返回形状；底层走 common/api.ts 的统一请求内核
export async function UniPost(url: string, req: object): Promise<UniResult> {
    const ret = await request<object>(url, req);
    // 历史行为：成功但没有 data 字段也算失败
    const ok = ret.ok && ret.data !== undefined;
    return {ok, data: ret.data ?? {}};
}

// 回调式的旧接口统一走这里
function uniCallback<T>(url: string, req: object, callback: (ret: { data: T, ok: boolean }) => void) {
    UniPost(url, req).then((res) => callback({data: res.data as T, ok: res.ok}));
}

export interface SubscriptionItem {
    id: string
    name: string
    upstreamUrl: string
    workerForwardUrl: string
    workerForwardEnabled: boolean
    monitorEnabled: boolean
    cacheEnabled: boolean
    cacheAvailable: boolean
    cachedAt: string
    shareUrl: string
    lastCheckAt: string
    lastCheckStatus: string
    lastError: string
    trafficSummary: string
    usagePercent: number
    expireAt: string
    expireRemainDays: number
}

export interface SubscriptionListRet {
    items: SubscriptionItem[]
}

export interface SubscriptionMutationRet {
    item: SubscriptionItem
}

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

const cmd_api_base_url = '/service/cmd/';

export function sendGetTasks(req: GetTasksReq, callback: (ret: { data: GetTasksRet, ok: boolean }) => void) {
    uniCallback<GetTasksRet>(cmd_api_base_url + 'getTasks', req, callback);
}

export function sendGetTask(req: GetTaskReq, callback: (ret: { data: GetTaskRet, ok: boolean }) => void) {
    uniCallback<GetTaskRet>(cmd_api_base_url + 'getTask', req, callback);
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
    code: string;
    updateTime: string;
    fxLink: string;
    daily: {
        date: string;
        type: string;
        name: string;
        level: string;
        category: string;
        text: string;
    }[];
    refer: {
        sources: string[];
        license: string[];
    };
};

export interface RssItem {
    title: string;
    description?: string;
    link: string;
    pubDate: string;
    Title?: string;
    Description?: string;
    Link?: string;
    PubDate?: string;
}

export interface DigestItem {
    title: string;
    summary: string;
    topic: string;
    importance: number;
    sourceRefs: string[];
}

export interface KeywordBrief {
    keyword: string;
    summary: string;
    count: number;
    sourceRefs: string[];
}

export interface TopicBrief {
    topic: string;
    summary: string;
    sourceRefs: string[];
}

export interface DigestCoverage {
    ref: string;
    topic: string;
    inPush: boolean;
    importance: number;
}

export interface DailyPushBrief {
    weatherLine: string;
    overview: string;
    importantNews: DigestItem[];
    keywordBriefs: KeywordBrief[];
}

export interface DayDigest {
    pushBrief: DailyPushBrief;
    overview: string;
    importantNews: DigestItem[];
    keywordBriefs: KeywordBrief[];
    topicBriefs: TopicBrief[];
    coverage: DigestCoverage[];
}

// 关注关键词的搜索结果（DeepSeek Search API + cheap 队列筛选），取代旧的 GoogleNews
export interface KeywordNewsItem {
    title: string;
    url: string;
    source: string;
    published: string; // 新数据是 YYYY-MM-DD（拿不准时为空）；从旧 GoogleNews 转换来的是完整时间
    summary: string;
    kind?: string; // 新闻、爆料、前瞻、讨论
    caution?: string; // 来源可靠性提醒，例如"内宣媒体"
}

export interface KeywordNewsGroup {
    keyword: string;
    summary: string; // 空表示当天没有新动态
    news: KeywordNewsItem[];
    error?: string; // 非空表示这个关键词搜索失败
}

// 旧日报里的 Google News RSS 结果，只读兼容
export interface LegacyGoogleNewsGroup {
    KeyWord: string;
    News: RssItem[];
}

export interface DayReport {
    Weather: WeatherPtl
    WeatherIndex: WeatherIndexPtl;
    Summary?: string;
    digest?: DayDigest;
    BbcNews: RssItem[]
    NytNews: RssItem[]
    KeywordNews?: KeywordNewsGroup[];
    GoogleNews?: LegacyGoogleNewsGroup[];
}

export interface WholeReport {
    BbcNews: RssItem[]
    NytNews: RssItem[]
    KeywordNews?: KeywordNewsGroup[];
    GoogleNews?: LegacyGoogleNewsGroup[];
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

const auto_api_base_url = '/service/auto/'

export function sendGetReport(req: GetReportReq, callback: (ret: { data: GetReportRet, ok: boolean }) => void) {
    uniCallback<GetReportRet>(auto_api_base_url + 'getReport', req, callback);
}

export function sendGetWholeReport(req: GetWholeReportReq, callback: (ret: {
    data: GetWholeReportRet,
    ok: boolean
}) => void) {
    uniCallback<GetWholeReportRet>(auto_api_base_url + 'getWholeReport', req, callback);
}

export function sendGetReportList(req: GetReportListReq, callback: (ret: {
    data: GetReportListRet,
    ok: boolean
}) => void) {
    uniCallback<GetReportListRet>(auto_api_base_url + 'getReportList', req, callback);
}

export function sendGenerateReport(req: GenerateReportReq, callback: (ret: {
    data: GenerateReportRet,
    ok: boolean
}) => void) {
    uniCallback<GenerateReportRet>(auto_api_base_url + 'generateReport', req, callback);
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

export async function sendGptRewrite(text: string): Promise<string> {
    const res: UniResult = await UniPost('/misc/gpt-rewrite', {content: text});
    return res.ok ? (res.data as unknown as string) : '';
}

export interface FileShow {
    isImage: boolean;
    name: string;
    publishUrl: string;
    detailUrl?: string;
    previewUrl?: string;
}

export async function UploadFile(file: File): Promise<FileShow | null> {
    const ret = await request<{ UploadURL?: string, PublicURL?: string }>('/misc/r2-presigned-url', {
        fileName: file.name,
        fileType: file.type,
    });
    if (!ret.ok || !ret.data) {
        message.error("获取上传地址失败").then();
        return null;
    }
    const data = ret.data;
    const {UploadURL, PublicURL} = data;

    if (!UploadURL || !PublicURL) {
        message.error("上传失败").then();
        return null;
    }

    const res2 = await fetch(UploadURL, {
        method: 'PUT',
        headers: {'Content-Type': file.type},
        body: file,
    });
    if (!res2.ok) {
        message.error("上传文件失败").then();
        return null;
    }

    const isImage = file.type.startsWith('image/');

    return {
        isImage: isImage,
        name: file.name,
        publishUrl: PublicURL
    };
}

export interface SearchBiLogReq {
    conditions?: Record<string, any>;
    pageNum: number;
    pageSize: number;
    orderBy?: string;
    desc?: boolean;
}

export interface DbLogData<T> {
    RecordTime: number;
    Data: T;
}

export interface TodoneDbLog {
    Sql: string;
    Rows: number;
    Duration: number;
    Err: string;
}

export type SearchBiLogRet<T> = {
    List: DbLogData<T>[]
    Total: number
}

export function sendSearchBiLog<T>(table: string, req: SearchBiLogReq, callback: (ret: { data: SearchBiLogRet<T>, ok: boolean }) => void) {
    uniCallback<SearchBiLogRet<T>>('/admin/bi_log/' + table + '/search', req, callback);
}
