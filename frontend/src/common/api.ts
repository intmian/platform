// 全站唯一的请求内核。后端约定：几乎所有接口都是 JSON POST，返回 {code, msg, data}，code=0 表示成功。
// 其他请求封装（UniPost、Todone 的 send_back、记账、AI 配置……）都只是在它上面套一层。
//
// 登录过期的处理：请求失败时不一定是登录问题（后端很多接口无权限时也只回 code=1），
// 所以失败后再节流地调一次 /check 确认；确认确实掉了登录，就通知外壳弹出锁屏。

export const API_BASE = '/api';

export interface ApiResult<T> {
    ok: boolean;
    code: number;
    msg: string;
    data: T;
}

export class ApiError extends Error {
    code: number;

    constructor(msg: string, code: number) {
        super(msg);
        this.code = code;
    }
}

type Listener = () => void;
const authLostListeners = new Set<Listener>();
let lastAuthProbe = 0;
let authKnownGood = false;

// 外壳在确认已登录后调用，只有“曾经登录过”的会话才需要探测掉线
export function setAuthKnownGood(good: boolean) {
    authKnownGood = good;
}

export function onAuthLost(listener: Listener): () => void {
    authLostListeners.add(listener);
    return () => authLostListeners.delete(listener);
}

function probeAuth() {
    if (!authKnownGood) return;
    const now = Date.now();
    if (now - lastAuthProbe < 10_000) return;
    lastAuthProbe = now;
    checkLogin().then((info) => {
        if (info === null && authKnownGood) {
            authKnownGood = false;
            authLostListeners.forEach((l) => l());
        }
    });
}

function fullUrl(path: string) {
    if (path.startsWith('http') || path.startsWith(API_BASE + '/')) return path;
    return API_BASE + (path.startsWith('/') ? path : '/' + path);
}

// 发请求，永不抛异常。path 可以写 '/misc/xxx'，也可以写完整的 '/api/misc/xxx'
export async function request<T = unknown>(path: string, body?: unknown, init?: RequestInit): Promise<ApiResult<T>> {
    const fail = (msg: string, code = -1): ApiResult<T> => ({ok: false, code, msg, data: undefined as T});
    let response: Response;
    try {
        const isForm = body instanceof FormData;
        response = await fetch(fullUrl(path), {
            method: 'POST',
            headers: isForm ? undefined : {'Content-Type': 'application/json'},
            body: isForm ? body : JSON.stringify(body ?? {}),
            credentials: 'same-origin',
            ...init,
        });
    } catch (e) {
        return fail(e instanceof Error ? e.message : '网络错误');
    }
    if (!response.ok) {
        if (response.status === 401 || response.status === 403) probeAuth();
        return fail(`HTTP ${response.status}`, response.status);
    }
    let json: { code?: number; msg?: string; data?: T };
    try {
        json = await response.json();
    } catch {
        return fail('返回的不是 JSON');
    }
    if (json.code !== 0) {
        probeAuth();
        return {ok: false, code: json.code ?? -1, msg: json.msg ?? '', data: json.data as T};
    }
    return {ok: true, code: 0, msg: json.msg ?? '', data: json.data as T};
}

// 需要“失败就抛异常”写法时用它
export async function post<T = unknown>(path: string, body?: unknown, init?: RequestInit): Promise<T> {
    const ret = await request<T>(path, body, init);
    if (!ret.ok) throw new ApiError(ret.msg || '请求失败', ret.code);
    return ret.data;
}

export interface LoginInfoData {
    User: string;
    Permission: string[] | null;
    ValidTime: number;
}

// 不走 request，避免和掉线探测互相触发
export async function checkLogin(): Promise<LoginInfoData | null> {
    try {
        const response = await fetch(API_BASE + '/check', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: '{}'});
        if (!response.ok) return null;
        const json = await response.json();
        return json.code === 0 ? json.data as LoginInfoData : null;
    } catch {
        return null;
    }
}

export async function login(username: string, password: string): Promise<LoginInfoData | null> {
    try {
        const response = await fetch(API_BASE + '/login', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({username, password}),
        });
        const json = await response.json();
        return json.code === 0 ? json.data as LoginInfoData : null;
    } catch {
        return null;
    }
}

export async function logout(): Promise<void> {
    try {
        await fetch(API_BASE + '/logout', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: '{}'});
    } catch {
        // 登出失败也照样清本地状态
    }
}
