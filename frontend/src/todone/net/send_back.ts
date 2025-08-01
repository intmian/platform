import {UniPost, UniResult} from "../../common/newSendHttp";
import {PDirTree, PSubGroup, PTask} from "./protocal";
import config from "../../config.json";

export interface GetDirTreeReq {
    UserID: string
}

export interface GetDirTreeRet {
    DirTree: PDirTree
}


export interface MoveDirReq {
    UserID: string
    DirID: number
    TrgDir: number// 放在哪个目录下
    AfterID: number
}

export interface MoveDirRet {
    Index: number
}


export interface MoveGroupReq {
    UserID: string
    GroupID: number
    ParentDirID: number
    TrgDir: number// 放在哪个目录下
    AfterID: number
}

export interface MoveGroupRet {
    Index: number
}


export interface CreateDirReq {
    UserID: string
    ParentDirID: number
    AfterID: number
    Title: string
    Note: string
}

export interface CreateDirRet {
    DirID: number
    Index: number
}


export interface ChangeDirReq {
    UserID: string
    DirID: number
    Title: string
    Note: string
}

export type ChangeDirRet = object


export interface DelDirReq {
    UserID: string
    DirID: number
}

export type DelDirRet = object


export interface DelGroupReq {
    UserID: string
    ParentDir: number
    GroupID: number
}

export type DelGroupRet = object


export interface CreateGroupReq {
    UserID: string
    Title: string
    Note: string
    ParentDir: number
    AfterID: number
}

export interface CreateGroupRet {
    GroupID: number
    Index: number
}


export interface ChangeGroupReq {
    UserID: string
    ParentDirID: number
    GroupID: number
    Title: string
    Note: string
}

export type ChangeGroupRet = object


export interface GetSubGroupReq {
    UserID: string
    ParentDirID: number
    GroupID: number
}

export interface GetSubGroupRet {
    SubGroups: PSubGroup[]
}


export interface GetTaskReq {
    DirID: number
    GroupID: number
    SubGroupID: number
    UserID: string
    TaskID: number
}

export interface GetTaskRet {
    Task: PTask
}


export interface ChangeTaskReq {
    DirID: number
    GroupID: number
    SubGroupID: number
    UserID: string
    Data: PTask
}

export type ChangeTaskRet = object


export interface CreateTaskReq {
    UserID: string
    DirID: number
    GroupID: number
    SubGroupID: number
    ParentTask: number
    Title: string
    Note: string
    AfterID: number
    Started: boolean
    TaskType: number
}

export interface CreateTaskRet {
    Task: PTask
}


export interface DelTaskReq {
    DirID: number
    GroupID: number
    SubGroupID: number
    UserID: string
    TaskID: number[]
}

export type DelTaskRet = object


const api_base_url = config.api_base_url + '/service/todone/';

export function sendGetDirTree(req: GetDirTreeReq, callback: (ret: { data: GetDirTreeRet, ok: boolean }) => void) {
    UniPost(api_base_url + 'getDirTree', req).then((res: UniResult) => {
        const result: { data: GetDirTreeRet, ok: boolean } = {
            data: res.data as GetDirTreeRet,
            ok: res.ok
        };

        callback(result);
    });
}

export function sendMoveDir(req: MoveDirReq, callback: (ret: { data: MoveDirRet, ok: boolean }) => void) {
    UniPost(api_base_url + 'moveDir', req).then((res: UniResult) => {
        const result: { data: MoveDirRet, ok: boolean } = {
            data: res.data as MoveDirRet,
            ok: res.ok
        };

        callback(result);
    });
}

export function sendMoveGroup(req: MoveGroupReq, callback: (ret: { data: MoveGroupRet, ok: boolean }) => void) {
    UniPost(api_base_url + 'moveGroup', req).then((res: UniResult) => {
        const result: { data: MoveGroupRet, ok: boolean } = {
            data: res.data as MoveGroupRet,
            ok: res.ok
        };

        callback(result);
    });
}

export function sendCreateDir(req: CreateDirReq, callback: (ret: { data: CreateDirRet, ok: boolean }) => void) {
    UniPost(api_base_url + 'createDir', req).then((res: UniResult) => {
        const result: { data: CreateDirRet, ok: boolean } = {
            data: res.data as CreateDirRet,
            ok: res.ok
        };

        callback(result);
    });
}

export function sendChangeDir(req: ChangeDirReq, callback: (ret: { data: ChangeDirRet, ok: boolean }) => void) {
    UniPost(api_base_url + 'changeDir', req).then((res: UniResult) => {
        const result: { data: ChangeDirRet, ok: boolean } = {
            data: res.data as ChangeDirRet,
            ok: res.ok
        };

        callback(result);
    });
}

export function sendDelDir(req: DelDirReq, callback: (ret: { data: DelDirRet, ok: boolean }) => void) {
    UniPost(api_base_url + 'delDir', req).then((res: UniResult) => {
        const result: { data: DelDirRet, ok: boolean } = {
            data: res.data as DelDirRet,
            ok: res.ok
        };

        callback(result);
    });
}

export function sendDelGroup(req: DelGroupReq, callback: (ret: { data: DelGroupRet, ok: boolean }) => void) {
    UniPost(api_base_url + 'delGroup', req).then((res: UniResult) => {
        const result: { data: DelGroupRet, ok: boolean } = {
            data: res.data as DelGroupRet,
            ok: res.ok
        };

        callback(result);
    });
}

export function sendCreateGroup(req: CreateGroupReq, callback: (ret: { data: CreateGroupRet, ok: boolean }) => void) {
    UniPost(api_base_url + 'createGroup', req).then((res: UniResult) => {
        const result: { data: CreateGroupRet, ok: boolean } = {
            data: res.data as CreateGroupRet,
            ok: res.ok
        };

        callback(result);
    });
}

export function sendChangeGroup(req: ChangeGroupReq, callback: (ret: { data: ChangeGroupRet, ok: boolean }) => void) {
    UniPost(api_base_url + 'changeGroup', req).then((res: UniResult) => {
        const result: { data: ChangeGroupRet, ok: boolean } = {
            data: res.data as ChangeGroupRet,
            ok: res.ok
        };

        callback(result);
    });
}

export function sendGetSubGroup(req: GetSubGroupReq, callback: (ret: { data: GetSubGroupRet, ok: boolean }) => void) {
    UniPost(api_base_url + 'getSubGroup', req).then((res: UniResult) => {
        const result: { data: GetSubGroupRet, ok: boolean } = {
            data: res.data as GetSubGroupRet,
            ok: res.ok
        };

        callback(result);
    });
}

export function sendGetTask(req: GetTaskReq, callback: (ret: { data: GetTaskRet, ok: boolean }) => void) {
    UniPost(api_base_url + 'getTask', req).then((res: UniResult) => {
        const result: { data: GetTaskRet, ok: boolean } = {
            data: res.data as GetTaskRet,
            ok: res.ok
        };

        callback(result);
    });
}

export function sendChangeTask(req: ChangeTaskReq, callback: (ret: { data: ChangeTaskRet, ok: boolean }) => void) {
    UniPost(api_base_url + 'changeTask', req).then((res: UniResult) => {
        const result: { data: ChangeTaskRet, ok: boolean } = {
            data: res.data as ChangeTaskRet,
            ok: res.ok
        };

        callback(result);
    });
}

export function sendCreateTask(req: CreateTaskReq, callback: (ret: { data: CreateTaskRet, ok: boolean }) => void) {
    UniPost(api_base_url + 'createTask', req).then((res: UniResult) => {
        const result: { data: CreateTaskRet, ok: boolean } = {
            data: res.data as CreateTaskRet,
            ok: res.ok
        };

        callback(result);
    });
}

export function sendDelTask(req: DelTaskReq, callback: (ret: { data: DelTaskRet, ok: boolean }) => void) {
    UniPost(api_base_url + 'delTask', req).then((res: UniResult) => {
        const result: { data: DelTaskRet, ok: boolean } = {
            data: res.data as DelTaskRet,
            ok: res.ok
        };

        callback(result);
    });
}

export interface CreateSubGroupReq {
    UserID: string
    ParentDirID: number
    GroupID: number
    Title: string
    Note: string
    AfterID: number
}

export interface CreateSubGroupRet {
    SubGroupID: number
    Index: number
}


export function sendCreateSubGroup(req: CreateSubGroupReq, callback: (ret: {
    data: CreateSubGroupRet,
    ok: boolean
}) => void) {
    UniPost(api_base_url + 'createSubGroup', req).then((res: UniResult) => {
        const result: { data: CreateSubGroupRet, ok: boolean } = {
            data: res.data as CreateSubGroupRet,
            ok: res.ok
        };

        callback(result);
    });
}

export interface DelSubGroupReq {
    UserID: string
    ParentDirID: number
    GroupID: number
    SubGroupID: number
}

export type DelSubGroupRet = object


export function sendDelSubGroup(req: DelSubGroupReq, callback: (ret: { data: DelSubGroupRet, ok: boolean }) => void) {
    UniPost(api_base_url + 'delSubGroup', req).then((res: UniResult) => {
        const result: { data: DelSubGroupRet, ok: boolean } = {
            data: res.data as DelSubGroupRet,
            ok: res.ok
        };

        callback(result);
    });
}

export interface GetTasksReq {
    UserID: string
    ParentDirID: number
    GroupID: number
    SubGroupID: number
    ContainDone: boolean
}

export interface GetTasksRet {
    Tasks: PTask[] | null
}


export function sendGetTasks(req: GetTasksReq, callback: (ret: { data: GetTasksRet, ok: boolean }) => void) {
    UniPost(api_base_url + 'getTasks', req).then((res: UniResult) => {
        const result: { data: GetTasksRet, ok: boolean } = {
            data: res.data as GetTasksRet,
            ok: res.ok
        };

        callback(result);
    });
}

export interface ChangeSubGroupReq {
    UserID: string
    ParentDirID: number
    GroupID: number
    Data: PSubGroup
}

export type ChangeSubGroupRet = object


export function sendChangeSubGroup(req: ChangeSubGroupReq, callback: (ret: {
    data: ChangeSubGroupRet,
    ok: boolean
}) => void) {
    UniPost(api_base_url + 'changeSubGroup', req).then((res: UniResult) => {
        const result: { data: ChangeSubGroupRet, ok: boolean } = {
            data: res.data as ChangeSubGroupRet,
            ok: res.ok
        };

        callback(result);
    });
}

export interface TaskMoveReq {
    UserID: string
    DirID: number
    GroupID: number
    SubGroupID: number
    TaskIDs: number[]
    TrgDir: number
    TrgGroup: number
    TrgSubGroup: number// 不填taskID,则表示移动到最后面或者前面
    TrgParentID: number
    TrgTaskID: number
    After: boolean
}

export type TaskMoveRet = object


export function sendTaskMove(req: TaskMoveReq, callback: (ret: { data: TaskMoveRet, ok: boolean }) => void) {
    UniPost(api_base_url + 'taskMove', req).then((res: UniResult) => {
        const result: { data: TaskMoveRet, ok: boolean } = {
            data: res.data as TaskMoveRet,
            ok: res.ok
        };

        callback(result);
    });
}

export interface TaskAddTagReq {
    UserID: string
    DirID: number
    GroupID: number
    SubGroupID: number
    TaskID: number
    Tag: string
}

export type TaskAddTagRet = object


export interface TaskDelTagReq {
    UserID: string
    DirID: number
    GroupID: number
    SubGroupID: number
    TaskID: number
    Tag: string
}

export type TaskDelTagRet = object

export function sendTaskAddTag(req: TaskAddTagReq, callback: (ret: { data: TaskAddTagRet, ok: boolean }) => void) {
    UniPost(api_base_url + 'taskAddTag', req).then((res: UniResult) => {
        const result: { data: TaskAddTagRet, ok: boolean } = {
            data: res.data as TaskAddTagRet,
            ok: res.ok
        };

        callback(result);
    });
}

export function sendTaskDelTag(req: TaskDelTagReq, callback: (ret: { data: TaskDelTagRet, ok: boolean }) => void) {
    UniPost(api_base_url + 'taskDelTag', req).then((res: UniResult) => {
        const result: { data: TaskDelTagRet, ok: boolean } = {
            data: res.data as TaskDelTagRet,
            ok: res.ok
        };

        callback(result);
    });
}

