import {post} from "../common/api";
import {EnvData, ToolData} from "../common/backHttpDefine";
import {ToolType} from "./def";

// 脚本服务（/service/cmd/*）的接口，失败抛 ApiError
const base = "/service/cmd/";

export async function getTools(): Promise<Record<string, ToolData>> {
    const data = await post<{ ID2ToolData?: Record<string, ToolData> }>(base + "getTools", {});
    return data?.ID2ToolData ?? {};
}

export async function createTool(name: string, typ: ToolType): Promise<string> {
    const data = await post<{ ToolID: string }>(base + "createTool", {Name: name, Typ: typ});
    return data?.ToolID ?? "";
}

export async function updateTool(toolID: string, name: string, content: string): Promise<void> {
    await post(base + "updateTool", {ToolID: toolID, Name: name, Content: content});
}

export async function deleteTool(toolID: string): Promise<void> {
    await post(base + "deleteTool", {ToolID: toolID});
}

export async function getToolScript(toolID: string): Promise<string> {
    const data = await post<{ Script: string }>(base + "getToolScript", {ToolID: toolID});
    return data?.Script ?? "";
}

export async function getEnvs(): Promise<EnvData[]> {
    const data = await post<{ EnvData?: EnvData[] | null }>(base + "getEnvs", {});
    return data?.EnvData ?? [];
}

export async function setEnvNote(env: EnvData, note: string): Promise<void> {
    await post(base + "setEnv", {EnvID: env.ID, note, params: env.Param ?? [], bindToolID: env.DefaultToolID ?? ""});
}
