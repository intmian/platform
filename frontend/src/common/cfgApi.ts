import {post} from "./api";

export type CfgValues = Record<string, { Data: unknown }>;

export interface CfgScope {
    server?: string;   // 不填是平台配置
    user?: string;     // 填了是服务下的用户配置
}

function cfgPath(scope: CfgScope, op: "get" | "set"): string {
    if (!scope.server) return `/cfg/plat/${op}`;
    if (scope.user) return `/cfg/${scope.server}/${scope.user}/${op}`;
    return `/cfg/${scope.server}/${op}`;
}

export async function getCfg(scope: CfgScope = {}): Promise<CfgValues> {
    const data = await post<CfgValues | null>(cfgPath(scope, "get"), {svr: scope.server, user: scope.user});
    return data ?? {};
}

export async function setCfg(scope: CfgScope, key: string, jsonValue: string): Promise<void> {
    await post(cfgPath(scope, "set"), {key, val: jsonValue});
}
