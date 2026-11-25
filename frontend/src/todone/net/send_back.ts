import {request} from "../../common/api";
import {LibraryNote, LibraryScoreDetail, LibraryScoreDetailDimension, PDirTree, PRoutineNode, PSubGroup, PTask} from "./protocal";

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
    GroupType: number
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

export interface LibraryTaskScope {
    DirID: number
    GroupID: number
    SubGroupID: number
    TaskID: number
}

export interface GetLibraryNotesReq extends LibraryTaskScope { UserID: string }
export interface GetLibraryNotesRet { Notes: LibraryNote[] }

export interface CreateLibraryNoteReq extends LibraryTaskScope {
    UserID: string
    RoundID: string
    EventTime: string
    Content: string
    ClientRequestID: string
}
export interface CreateLibraryNoteRet { Note: LibraryNote }

export interface ChangeLibraryNoteReq extends LibraryTaskScope {
    UserID: string
    NoteID: string
    EventTime: string
    Content: string
    Revision: number
}
export interface ChangeLibraryNoteRet { Note: LibraryNote }

export interface DelLibraryNoteReq extends LibraryTaskScope {
    UserID: string
    NoteID: string
    Revision: number
}
export type DelLibraryNoteRet = object

export interface LibraryScoreDetailInput {
    Mode: 'simple' | 'complex'
    Comment: string
    ObjScore?: LibraryScoreDetailDimension
    SubScore?: LibraryScoreDetailDimension
    InnovateScore?: LibraryScoreDetailDimension
}

export interface GetLibraryScoreDetailReq extends LibraryTaskScope {
    UserID: string
    ScoreID: string
}
export interface GetLibraryScoreDetailRet { Detail: LibraryScoreDetail }

export interface CreateLibraryScoreDetailReq extends LibraryTaskScope {
    UserID: string
    ScoreID: string
    RoundID: string
    ClientRequestID: string
    Detail: LibraryScoreDetailInput
}
export interface CreateLibraryScoreDetailRet { Detail: LibraryScoreDetail }

export interface ChangeLibraryScoreDetailReq extends LibraryTaskScope {
    UserID: string
    ScoreID: string
    Revision: number
    Detail: LibraryScoreDetailInput
}
export interface ChangeLibraryScoreDetailRet { Detail: LibraryScoreDetail }


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


const TODONE_PATH = '/service/todone/';

interface TodoneResult {
    data: object
    ok: boolean
}

// 最近一次在本页改 Todone 数据的时间。读接口都叫 get*，其余都算写。
// 桌面“今天”卡片靠它判断能不能直接用上次拉到的结果（shellApi.ts）。
let lastWriteAt = 0;
export const todoneLastWriteAt = () => lastWriteAt;

// 所有 Todone 接口都走 common/api 的请求内核。沿用旧约定：成功但没有 data 字段也算失败。
async function todoneRequest(cmd: string, req: object): Promise<TodoneResult> {
    const ret = await request<object>(TODONE_PATH + cmd, req);
    if (!cmd.startsWith('get')) lastWriteAt = Date.now();
    return {ok: ret.ok && ret.data !== undefined, data: ret.data ?? {}};
}

export function sendGetDirTree(req: GetDirTreeReq, callback: (ret: { data: GetDirTreeRet, ok: boolean }) => void) {
    todoneRequest('getDirTree', req).then((res: TodoneResult) => {
        const result: { data: GetDirTreeRet, ok: boolean } = {
            data: res.data as GetDirTreeRet,
            ok: res.ok
        };

        callback(result);
    });
}

export function sendMoveDir(req: MoveDirReq, callback: (ret: { data: MoveDirRet, ok: boolean }) => void) {
    todoneRequest('moveDir', req).then((res: TodoneResult) => {
        const result: { data: MoveDirRet, ok: boolean } = {
            data: res.data as MoveDirRet,
            ok: res.ok
        };

        callback(result);
    });
}

export function sendMoveGroup(req: MoveGroupReq, callback: (ret: { data: MoveGroupRet, ok: boolean }) => void) {
    todoneRequest('moveGroup', req).then((res: TodoneResult) => {
        const result: { data: MoveGroupRet, ok: boolean } = {
            data: res.data as MoveGroupRet,
            ok: res.ok
        };

        callback(result);
    });
}

export function sendCreateDir(req: CreateDirReq, callback: (ret: { data: CreateDirRet, ok: boolean }) => void) {
    todoneRequest('createDir', req).then((res: TodoneResult) => {
        const result: { data: CreateDirRet, ok: boolean } = {
            data: res.data as CreateDirRet,
            ok: res.ok
        };

        callback(result);
    });
}

export function sendChangeDir(req: ChangeDirReq, callback: (ret: { data: ChangeDirRet, ok: boolean }) => void) {
    todoneRequest('changeDir', req).then((res: TodoneResult) => {
        const result: { data: ChangeDirRet, ok: boolean } = {
            data: res.data as ChangeDirRet,
            ok: res.ok
        };

        callback(result);
    });
}

export function sendDelDir(req: DelDirReq, callback: (ret: { data: DelDirRet, ok: boolean }) => void) {
    todoneRequest('delDir', req).then((res: TodoneResult) => {
        const result: { data: DelDirRet, ok: boolean } = {
            data: res.data as DelDirRet,
            ok: res.ok
        };

        callback(result);
    });
}

export function sendDelGroup(req: DelGroupReq, callback: (ret: { data: DelGroupRet, ok: boolean }) => void) {
    todoneRequest('delGroup', req).then((res: TodoneResult) => {
        const result: { data: DelGroupRet, ok: boolean } = {
            data: res.data as DelGroupRet,
            ok: res.ok
        };

        callback(result);
    });
}

export function sendCreateGroup(req: CreateGroupReq, callback: (ret: { data: CreateGroupRet, ok: boolean }) => void) {
    todoneRequest('createGroup', req).then((res: TodoneResult) => {
        const result: { data: CreateGroupRet, ok: boolean } = {
            data: res.data as CreateGroupRet,
            ok: res.ok
        };

        callback(result);
    });
}

export function sendChangeGroup(req: ChangeGroupReq, callback: (ret: { data: ChangeGroupRet, ok: boolean }) => void) {
    todoneRequest('changeGroup', req).then((res: TodoneResult) => {
        const result: { data: ChangeGroupRet, ok: boolean } = {
            data: res.data as ChangeGroupRet,
            ok: res.ok
        };

        callback(result);
    });
}

export function sendGetSubGroup(req: GetSubGroupReq, callback: (ret: { data: GetSubGroupRet, ok: boolean }) => void) {
    todoneRequest('getSubGroup', req).then((res: TodoneResult) => {
        const result: { data: GetSubGroupRet, ok: boolean } = {
            data: res.data as GetSubGroupRet,
            ok: res.ok
        };

        callback(result);
    });
}

export function sendGetTask(req: GetTaskReq, callback: (ret: { data: GetTaskRet, ok: boolean }) => void) {
    todoneRequest('getTask', req).then((res: TodoneResult) => {
        const result: { data: GetTaskRet, ok: boolean } = {
            data: res.data as GetTaskRet,
            ok: res.ok
        };

        callback(result);
    });
}

export function sendChangeTask(req: ChangeTaskReq, callback: (ret: { data: ChangeTaskRet, ok: boolean }) => void) {
    todoneRequest('changeTask', req).then((res: TodoneResult) => {
        const result: { data: ChangeTaskRet, ok: boolean } = {
            data: res.data as ChangeTaskRet,
            ok: res.ok
        };

        callback(result);
    });
}

export function sendGetLibraryNotes(req: GetLibraryNotesReq, callback: (ret: {data: GetLibraryNotesRet, ok: boolean}) => void) {
    todoneRequest('getLibraryNotes', req).then((res: TodoneResult) => callback({
        data: res.data as GetLibraryNotesRet,
        ok: res.ok,
    }));
}

export function sendCreateLibraryNote(req: CreateLibraryNoteReq, callback: (ret: {data: CreateLibraryNoteRet, ok: boolean}) => void) {
    todoneRequest('createLibraryNote', req).then((res: TodoneResult) => callback({
        data: res.data as CreateLibraryNoteRet,
        ok: res.ok,
    }));
}

export function sendChangeLibraryNote(req: ChangeLibraryNoteReq, callback: (ret: {data: ChangeLibraryNoteRet, ok: boolean}) => void) {
    todoneRequest('changeLibraryNote', req).then((res: TodoneResult) => callback({
        data: res.data as ChangeLibraryNoteRet,
        ok: res.ok,
    }));
}

export function sendDelLibraryNote(req: DelLibraryNoteReq, callback: (ret: {data: DelLibraryNoteRet, ok: boolean}) => void) {
    todoneRequest('delLibraryNote', req).then((res: TodoneResult) => callback({
        data: res.data as DelLibraryNoteRet,
        ok: res.ok,
    }));
}

export function sendGetLibraryScoreDetail(req: GetLibraryScoreDetailReq, callback: (ret: {data: GetLibraryScoreDetailRet, ok: boolean}) => void) {
    todoneRequest('getLibraryScoreDetail', req).then((res: TodoneResult) => callback({
        data: res.data as GetLibraryScoreDetailRet,
        ok: res.ok,
    }));
}

export function sendCreateLibraryScoreDetail(req: CreateLibraryScoreDetailReq, callback: (ret: {data: CreateLibraryScoreDetailRet, ok: boolean}) => void) {
    todoneRequest('createLibraryScoreDetail', req).then((res: TodoneResult) => callback({
        data: res.data as CreateLibraryScoreDetailRet,
        ok: res.ok,
    }));
}

export function sendChangeLibraryScoreDetail(req: ChangeLibraryScoreDetailReq, callback: (ret: {data: ChangeLibraryScoreDetailRet, ok: boolean}) => void) {
    todoneRequest('changeLibraryScoreDetail', req).then((res: TodoneResult) => callback({
        data: res.data as ChangeLibraryScoreDetailRet,
        ok: res.ok,
    }));
}

export function sendCreateTask(req: CreateTaskReq, callback: (ret: { data: CreateTaskRet, ok: boolean }) => void) {
    todoneRequest('createTask', req).then((res: TodoneResult) => {
        const result: { data: CreateTaskRet, ok: boolean } = {
            data: res.data as CreateTaskRet,
            ok: res.ok
        };

        callback(result);
    });
}

export function sendDelTask(req: DelTaskReq, callback: (ret: { data: DelTaskRet, ok: boolean }) => void) {
    todoneRequest('delTask', req).then((res: TodoneResult) => {
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
    todoneRequest('createSubGroup', req).then((res: TodoneResult) => {
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
    todoneRequest('delSubGroup', req).then((res: TodoneResult) => {
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
    todoneRequest('getTasks', req).then((res: TodoneResult) => {
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
    todoneRequest('changeSubGroup', req).then((res: TodoneResult) => {
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
    todoneRequest('taskMove', req).then((res: TodoneResult) => {
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
    todoneRequest('taskAddTag', req).then((res: TodoneResult) => {
        const result: { data: TaskAddTagRet, ok: boolean } = {
            data: res.data as TaskAddTagRet,
            ok: res.ok
        };

        callback(result);
    });
}

export function sendTaskDelTag(req: TaskDelTagReq, callback: (ret: { data: TaskDelTagRet, ok: boolean }) => void) {
    todoneRequest('taskDelTag', req).then((res: TodoneResult) => {
        const result: { data: TaskDelTagRet, ok: boolean } = {
            data: res.data as TaskDelTagRet,
            ok: res.ok
        };

        callback(result);
    });
}

export interface GetRoutineReq {
    UserID: string
    DirID: number
    GroupID: number
}

export interface GetRoutineRet {
    Nodes: PRoutineNode[] | null
}

export interface RoutineDelTasks {
    SubGroupID: number
    TaskIDs: number[]
}

// 在同一把用户锁内删除临时任务并批量写入节点状态
export interface SaveRoutineReq {
    UserID: string
    DirID: number
    GroupID: number
    Nodes: PRoutineNode[]
    DelTasks: RoutineDelTasks[]
}

export type SaveRoutineRet = object

export async function postTodone<T>(cmd: string, req: object): Promise<{ data: T, ok: boolean }> {
    const res = await todoneRequest(cmd, req);
    return {data: res.data as T, ok: res.ok};
}

export function sendGetRoutine(req: GetRoutineReq) {
    return postTodone<GetRoutineRet>('getRoutine', req);
}

export function sendSaveRoutine(req: SaveRoutineReq) {
    return postTodone<SaveRoutineRet>('saveRoutine', req);
}

// ---------------- 总视图 ----------------

export interface OverviewGroup {
    DirID: number
    GroupID: number
    Type: number
    Title: string
    Path: string[] | null
}

/** 收藏项，按收藏先后排列。SubGroupID 为 0 表示整个分组。 */
export interface OverviewFavorite {
    GroupID: number
    SubGroupID: number
}

export interface OverviewSubGroup {
    ID: number
    GroupID: number
    Title: string
    Index: number
}

export interface OverviewTask {
    GroupID: number
    SubGroupID: number
    ParentTitle: string
    Task: PTask // 不含 Note
}

export interface OverviewRoutineNode {
    GroupID: number
    Node: PRoutineNode
}

export interface GetOverviewRet {
    Groups: OverviewGroup[] | null
    SubGroups: OverviewSubGroup[] | null
    Tasks: OverviewTask[] | null
    RoutineNodes: OverviewRoutineNode[] | null
    Favorites: OverviewFavorite[] | null
}

export function sendGetOverview(req: { UserID: string }) {
    return postTodone<GetOverviewRet>('getOverview', req);
}

export function sendSetGroupFavorite(req: { UserID: string, ParentDirID: number, GroupID: number, SubGroupID: number, Favorite: boolean }) {
    return postTodone<object>('setGroupFavorite', req);
}

/** 只改完成状态；总视图的任务不含 Note，不能用 changeTask 整体覆盖。 */
export function sendSetTaskDone(req: { UserID: string, DirID: number, GroupID: number, SubGroupID: number, TaskID: number, Done: boolean }) {
    return postTodone<object>('setTaskDone', req);
}
