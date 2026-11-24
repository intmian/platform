import dayjs, {Dayjs} from "dayjs";
import {GroupType, PRoutineNode, PSubGroup, PTask} from "./net/protocal";
import type {GetOverviewRet, OverviewGroup, OverviewTask} from "./net/send_back";
import {buildModel, Model, nodeKey, Owner} from "./routineModel";
import {DATE_FMT, roundView, shortDate} from "./routineRule";
import {IsDateEmptyFromGoEmpty} from "../common/tool";
import type {LocateTarget} from "./locate";

/**
 * 关注页上半部分的归类规则：从收藏里挑出带日期的事，分到逾期、今天、进行中、接下来。
 * 关注页（Overview.tsx）和桌面的“今天”卡片（shellApi.ts）共用，规则只改这一处。
 */

export const SOON_DAYS = 7;

export type Bucket = 'overdue' | 'today' | 'doing' | 'soon';
export type Tone = 'error' | 'warning' | 'primary' | 'plain';

export interface Timing {
    bucket: Bucket
    label: string
    tone: Tone
    sort: number // 同一组里越小越靠前
}

export interface TaskItem {
    kind: 'task'
    key: string
    timing: Timing
    ot: OverviewTask
    group: OverviewGroup
}

export interface RoutineItem {
    kind: 'routine'
    key: string
    timing: Timing
    title: string
    owner: Owner
    group: OverviewGroup
    subTitle: string // 节奏层所在的子分组（如果不是清单本身）
    target: LocateTarget // 跳到清单里的哪个位置
}

export type FocusItem = TaskItem | RoutineItem;
export type Focus = Record<Bucket, FocusItem[]>;

// ---------------- 时间判断 ----------------

function dateOf(s: string): Dayjs | null {
    if (!s || IsDateEmptyFromGoEmpty(s)) return null;
    const d = dayjs(s);
    return d.isValid() && d.year() > 1 ? d.startOf('day') : null;
}

/** 明天、后天、周四；一周以外写日期。 */
function dayWord(d: Dayjs, today: Dayjs): string {
    const n = d.diff(today, 'day');
    if (n === 1) return '明天';
    if (n === 2) return '后天';
    if (n < SOON_DAYS) return '周' + '日一二三四五六'[d.day()];
    return shortDate(d);
}

/**
 * 普通任务进哪一栏。只看日期：开始和截止都没设的返回 null（不进上半部分）。
 * - 开始日期还没到：7 天内的进“接下来”，更远的先不显示；
 * - 过了截止日期，或者标成“未开始”却过了开始日期：逾期；
 * - 其余（已经开始、还没过期）：进行中。
 */
export function taskTiming(t: PTask, today: Dayjs): Timing | null {
    const begin = dateOf(t.BeginTime);
    const end = dateOf(t.EndTime);
    if (!begin && !end) return null;

    if (begin && begin.isAfter(today)) {
        const n = begin.diff(today, 'day');
        return n <= SOON_DAYS ? {bucket: 'soon', label: `${dayWord(begin, today)}开始`, tone: 'plain', sort: n} : null;
    }
    if (begin && !t.Started && begin.isBefore(today)) {
        const n = today.diff(begin, 'day');
        return {bucket: 'overdue', label: `晚开始 ${n} 天`, tone: 'error', sort: -n};
    }
    if (end) {
        const n = end.diff(today, 'day');
        if (n < 0) return {bucket: 'overdue', label: `逾期 ${-n} 天`, tone: 'error', sort: n};
        if (n === 0) return {bucket: 'today', label: '今天截止', tone: 'warning', sort: 0};
        if (n <= SOON_DAYS) return {bucket: 'doing', label: `${dayWord(end, today)}截止`, tone: 'plain', sort: n};
        return {bucket: 'doing', label: `还剩 ${n} 天`, tone: 'plain', sort: n};
    }
    // 只设了开始日期、没有截止：排在有截止日期的后面
    if (begin!.isSame(today)) return {bucket: 'today', label: '今天开始', tone: 'warning', sort: 1};
    return {bucket: 'doing', label: `${shortDate(begin!)} 起`, tone: 'plain', sort: 1e5 + today.diff(begin!, 'day')};
}

/** 例行清单的节奏层进哪一栏。手动节奏没有日期，只在收藏卡片里出现。 */
export function ownerTiming(o: Owner, today: Dayjs): Timing | null {
    if (o.round.manual || o.ownLeaves.length === 0) return null;
    if (o.round.waiting) {
        if (!o.round.start) return null;
        const n = dayjs(o.round.start).diff(today, 'day');
        return n > 0 && n <= SOON_DAYS ? {bucket: 'soon', label: `${dayWord(dayjs(o.round.start), today)}开始`, tone: 'plain', sort: n} : null;
    }
    // 这次勾完的层按“没做完”时的状态归栏，免得一勾就跳到别的栏里
    const v = o.complete ? roundView(o.round, false, today.format(DATE_FMT)) : o.view;
    if (v.phase === 'overdue') return {bucket: 'overdue', label: v.label, tone: 'error', sort: -1};
    if (v.phase === 'today') return {bucket: 'today', label: v.label, tone: 'warning', sort: 0};
    if (v.phase === 'grace') {
        const left = o.round.deadline ? dayjs(o.round.deadline).diff(today, 'day') : 99;
        return {bucket: 'doing', label: v.label, tone: 'plain', sort: left};
    }
    return null;
}

export function itemDone(it: FocusItem): boolean {
    return it.kind === 'task' ? it.ot.Task.Done : it.owner.complete;
}

// ---------------- 由 getOverview 的数据推导 ----------------

export type NodesByGroup = Record<number, Record<string, PRoutineNode>>;

export interface RoutineData {
    group: OverviewGroup
    subGroups: PSubGroup[]
    tasks: Record<number, PTask[]>
}

export interface FavScope {
    groups: Set<number>    // 整个收藏的分组
    subGroups: Set<number> // 单独收藏的栏（子分组）
}

export function overviewNodes(data: GetOverviewRet | null): NodesByGroup {
    const out: NodesByGroup = {};
    (data?.RoutineNodes ?? []).forEach((n) => {
        out[n.GroupID] = out[n.GroupID] ?? {};
        out[n.GroupID][nodeKey(n.Node.Kind, n.Node.NodeID)] = n.Node;
    });
    return out;
}

/** 例行清单的原始数据，按清单分好。 */
export function routineDataOf(data: GetOverviewRet | null): Map<number, RoutineData> {
    const out = new Map<number, RoutineData>();
    (data?.Groups ?? []).filter((g) => g.Type === GroupType.Routine)
        .forEach((g) => out.set(g.GroupID, {group: g, subGroups: [], tasks: {}}));
    (data?.SubGroups ?? []).forEach((sg) => {
        const rd = out.get(sg.GroupID);
        if (rd) rd.subGroups.push({ID: sg.ID, Title: sg.Title, Note: '', Index: sg.Index});
    });
    (data?.Tasks ?? []).forEach((ot) => {
        const rd = out.get(ot.GroupID);
        if (rd) (rd.tasks[ot.SubGroupID] = rd.tasks[ot.SubGroupID] ?? []).push(ot.Task);
    });
    out.forEach((rd) => rd.subGroups.sort((a, b) => a.Index - b.Index));
    return out;
}

export function buildModels(routineData: Map<number, RoutineData>, nodes: NodesByGroup, today: string): Map<number, Model> {
    const out = new Map<number, Model>();
    routineData.forEach((rd, id) => out.set(id, buildModel(id, rd.subGroups, rd.tasks, nodes[id] ?? {}, today)));
    return out;
}

export function favScopeOf(data: GetOverviewRet | null): FavScope {
    const favs = data?.Favorites ?? [];
    return {
        groups: new Set(favs.filter((f) => f.SubGroupID === 0).map((f) => f.GroupID)),
        subGroups: new Set(favs.filter((f) => f.SubGroupID !== 0).map((f) => f.SubGroupID)),
    };
}

export interface FocusInput {
    data: GetOverviewRet | null
    routineData: Map<number, RoutineData>
    models: Map<number, Model>
    favScope: FavScope
    touched: Set<string> // 这次页面里勾过的项，做完了也留在原处
    today: string
}

/** 上半部分：收藏范围内带日期的事，按栏分好、栏内排好序。 */
export function buildFocus(input: FocusInput): Focus {
    const {data, routineData, models, favScope, touched} = input;
    const t0 = dayjs(input.today).startOf('day');
    const groupByID = new Map((data?.Groups ?? []).map((g) => [g.GroupID, g]));
    const items: FocusItem[] = [];
    (data?.Tasks ?? []).forEach((ot) => {
        const g = groupByID.get(ot.GroupID);
        if (!g || g.Type !== GroupType.Normal) return;
        if (!favScope.groups.has(ot.GroupID) && !favScope.subGroups.has(ot.SubGroupID)) return;
        const key = `t${ot.Task.ID}`;
        if (ot.Task.Done && !touched.has(key)) return;
        const timing = taskTiming(ot.Task, t0);
        if (timing) items.push({kind: 'task', key, timing, ot, group: g});
    });
    models.forEach((model, gid) => {
        const g = groupByID.get(gid);
        const rd = routineData.get(gid);
        if (!g || !rd) return;
        const whole = favScope.groups.has(gid);
        model.owners.forEach((full) => {
            // 只收藏了清单里的几栏：节奏层只算这几栏里的事项
            let o = full;
            if (!whole) {
                const leaves = full.ownLeaves.filter((l) => favScope.subGroups.has(l.sgID));
                if (leaves.length === 0) return;
                if (leaves.length !== full.ownLeaves.length) {
                    const need = leaves.filter((l) => l.active && !l.optional);
                    o = {...full, ownLeaves: leaves, complete: need.length > 0 ? need.every((l) => l.checked) : full.complete};
                }
            }
            const key = `r${gid}:${o.key}`;
            if (o.complete && !touched.has(key)) return;
            const timing = ownerTiming(o, t0);
            if (!timing) return;
            let title = g.Title;
            let subTitle = '';
            let target: LocateTarget = {};
            // 清单级的节奏、但只收藏了一栏：显示成那一栏的名字
            const sgIDs = new Set(o.ownLeaves.map((l) => l.sgID));
            if (!whole && sgIDs.size === 1) {
                const sg = rd.subGroups.find((s) => sgIDs.has(s.ID));
                title = sg?.Title || title;
                target = {subGroupID: sg?.ID};
            }
            if (o.key.startsWith('s')) {
                const sg = rd.subGroups.find((s) => `s${s.ID}` === o.key);
                title = sg?.Title ?? title;
                target = {subGroupID: sg?.ID};
            } else if (o.key.startsWith('t')) {
                const v = model.byTask.get(o.node.NodeID);
                title = v?.task.Title ?? title;
                subTitle = rd.subGroups.find((s) => s.ID === v?.sgID)?.Title ?? '';
                target = {taskID: o.node.NodeID, subGroupID: v?.sgID};
            }
            items.push({kind: 'routine', key, timing, title, owner: o, group: g, subTitle, target});
        });
    });
    const by: Focus = {overdue: [], today: [], doing: [], soon: []};
    items.forEach((it) => by[it.timing.bucket].push(it));
    Object.values(by).forEach((list) => list.sort((a, b) => a.timing.sort - b.timing.sort));
    return by;
}

/** 只要一份 getOverview 数据就算出上半部分（桌面卡片用；关注页自己分步算，因为要保留中间结果）。 */
export function focusFromOverview(data: GetOverviewRet, today: string): Focus {
    const routineData = routineDataOf(data);
    return buildFocus({
        data,
        routineData,
        models: buildModels(routineData, overviewNodes(data), today),
        favScope: favScopeOf(data),
        touched: new Set(),
        today,
    });
}
