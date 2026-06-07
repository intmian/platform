import config from "../config.json";
import {UniPost} from "../common/newSendHttp";

async function hardwarePost<T>(cmd: string, req: object): Promise<T> {
    const ret = await UniPost(`${config.api_base_url}/service/hardware/${cmd}`, req);
    if (!ret.ok) {
        throw new Error("请求失败");
    }
    return ret.data as T;
}

export type Credential = {
    id: string
    name: string
    tokenPrefix: string
    enabled: boolean
    lastUsedAt: string
    createdAt: string
    updatedAt: string
}

export type Sample = {
    id: string
    deviceId: string
    gatewayDeviceId: string
    hardwareKey: string
    sessionId: string
    seq: number
    epochSec: number
    protocolVersion: number
    tempC10: number | null
    humiRh: number | null
    battPct: number | null
    scd41Co2Ppm: number | null
    tvocPpb: number | null
    vocAqi: number | null
    eco2Ppm: number | null
    flags: number
    crc16: number
    createdAt: string
}

export type Device = {
    id: string
    hardwareKey: string
    type: string
    name: string
    hidden: boolean
    deleted: boolean
    status: string
    lastSeenAt: string
    lastSampleAt: string
    lastGatewayDeviceId: string
    lastEpochSec: number
    lastIp: string
    userAgent: string
    latestSample?: Sample
    createdAt: string
    updatedAt: string
}

export type Command = {
    id: string
    deviceId: string
    gatewayDeviceId: string
    type: string
    status: string
    leaseUntil: string
    deliveredAt: string
    ackedAt: string
    createdBy: string
    lastError: string
    createdAt: string
    updatedAt: string
}

export type Dashboard = {
    name: string
    timeRange: string
    refreshSec: number
    layoutJson: string
    updatedAt: string
}

export type DashboardWidget = {
    id: string
    title: string
    type: "value" | "line"
    deviceIds: string[]
    metrics: string[]
    timeRange: string
    bucket: string
    agg: string
    optionsJson: string
    sortIndex: number
}

export type DashboardWidgetResult = {
    widget: DashboardWidget
    devices: Device[]
    samples: Sample[]
    latest: Sample[]
}

export function listDevices(req: { includeHidden?: boolean, includeDeleted?: boolean } = {}) {
    return hardwarePost<{ devices: Device[] }>("listDevices", req);
}

export function updateDevice(req: { id: string, name: string, hidden: boolean }) {
    return hardwarePost<{ device: Device }>("updateDevice", req);
}

export function deleteDevice(id: string) {
    return hardwarePost<{ deleted: boolean }>("deleteDevice", {id});
}

export function listCredentials() {
    return hardwarePost<{ credentials: Credential[] }>("listCredentials", {});
}

export function createCredential(name: string) {
    return hardwarePost<{ credential: Credential, token: string }>("createCredential", {name});
}

export function rotateCredential(id: string) {
    return hardwarePost<{ credential: Credential, token: string }>("rotateCredential", {id});
}

export function updateCredential(req: { id: string, name: string, enabled: boolean }) {
    return hardwarePost<{ credential: Credential }>("updateCredential", req);
}

export function deleteCredential(id: string) {
    return hardwarePost<{ deleted: boolean }>("deleteCredential", {id});
}

export function querySamples(req: {
    deviceIds?: string[]
    deviceId?: string
    metric: string
    fromEpochSec?: number
    toEpochSec?: number
    timeRange?: string
    bucket?: string
    agg?: string
    limit?: number
}) {
    return hardwarePost<{ samples: Sample[] }>("querySamples", req);
}

export function listCommands(req: { deviceId?: string, limit?: number }) {
    return hardwarePost<{ commands: Command[] }>("listCommands", req);
}

export function createCommand(req: { deviceId: string, type: string, payloadJson?: string }) {
    return hardwarePost<{ command: Command }>("createCommand", req);
}

export function cancelCommand(id: string) {
    return hardwarePost<{ command: Command }>("cancelCommand", {id});
}

export function getDashboard() {
    return hardwarePost<{ dashboard: Dashboard, widgets: DashboardWidget[] }>("getDashboard", {});
}

export function saveDashboard(req: {
    name: string
    timeRange: string
    refreshSec: number
    layoutJson: string
    widgets: DashboardWidget[]
}) {
    return hardwarePost<{ dashboard: Dashboard, widgets: DashboardWidget[] }>("saveDashboard", req);
}

export function queryDashboard() {
    return hardwarePost<{ widgets: DashboardWidgetResult[] }>("queryDashboard", {});
}
