import {API_BASE, ApiError, post} from "../common/api";

// 管理后台用到的接口。大多数走 common/api.ts 的 post（失败抛 ApiError）；
// 少数老接口不按 {code, data} 返回（服务列表、日志直接返回数组，存储返回 {code, result}），用 postJson 拿原始 JSON。

async function postJson<T>(path: string, body?: unknown): Promise<T> {
    let response: Response;
    try {
        response = await fetch(API_BASE + path, {
            method: "POST",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify(body ?? {}),
            credentials: "same-origin",
        });
    } catch (e) {
        throw new ApiError(e instanceof Error ? e.message : "网络错误", -1);
    }
    if (!response.ok) {
        throw new ApiError(`HTTP ${response.status}`, response.status);
    }
    try {
        return await response.json() as T;
    } catch {
        throw new ApiError("返回的不是 JSON", -1);
    }
}

interface CodeResult {
    code?: number;
    msg?: string;
}

function ensureOk<T extends CodeResult>(ret: T): T {
    if (ret.code !== undefined && ret.code !== 0) {
        throw new ApiError(ret.msg || "请求失败", ret.code);
    }
    return ret;
}

// ---- 服务 ----

export interface ServiceInfo {
    Name: string;
    Status: "start" | "stop" | string;
    StartTime: string;
    Props: number;
}

export async function getServices(): Promise<ServiceInfo[]> {
    const ret = await postJson<ServiceInfo[] | CodeResult>("/admin/services");
    if (!Array.isArray(ret)) {
        ensureOk(ret);
        return [];
    }
    return ret;
}

export async function setServiceRunning(name: string, start: boolean): Promise<void> {
    ensureOk(await postJson<CodeResult>(`/admin/service/${encodeURIComponent(name)}/${start ? "start" : "stop"}`));
}

// ---- 日志 ----

export async function getLastLogs(): Promise<string[]> {
    const ret = await postJson<string[] | CodeResult | null>("/admin/log/get");
    if (ret === null) return [];
    if (!Array.isArray(ret)) {
        ensureOk(ret);
        return [];
    }
    return ret;
}

// ---- 后台数据（xstorage） ----

export interface StorageUnit {
    Type: number;
    Data: unknown;
}

export async function getAllStorage(): Promise<Record<string, StorageUnit>> {
    const ret = ensureOk(await postJson<CodeResult & { result?: Record<string, StorageUnit> }>("/admin/storage/get_all"));
    return ret.result ?? {};
}

// value 传 "" 表示删除这个键
export async function setStorage(key: string, value: unknown, type: number): Promise<void> {
    // 后端按 JSON 字符串解析 value
    ensureOk(await postJson<CodeResult>("/admin/storage/set", {key, value: JSON.stringify(value), type}));
}

// ---- 账号 ----

// 账号 -> (tokenID -> 权限列表)
export type AccountTokens = Record<string, string[] | null>;

export async function getAllAccounts(): Promise<Record<string, AccountTokens>> {
    const data = await post<{ Accounts?: Record<string, AccountTokens> }>("/service/account/getAllAccount", {});
    return data?.Accounts ?? {};
}

export async function registerAccount(account: string): Promise<void> {
    await post("/service/account/register", {account});
}

export async function deregisterAccount(account: string): Promise<void> {
    await post("/service/account/deregister", {account});
}

export async function createToken(account: string, pwd: string, pers: string[]): Promise<string> {
    const data = await post<{ tokenID: string }>("/service/account/createToken", {account, pwd, pers});
    return data?.tokenID ?? "";
}

export async function changeToken(account: string, tokenID: string, pers: string[]): Promise<void> {
    await post("/service/account/changeToken", {account, tokenID, pers});
}

export async function deleteToken(account: string, tokenID: string): Promise<void> {
    await post("/service/account/delToken", {account, tokenID});
}

// ---- 配置（cfg） ----
// 读接口返回 真实key -> {Data}；写接口的 val 是 JSON 字符串

