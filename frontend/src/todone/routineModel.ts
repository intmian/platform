import dayjs from "dayjs";
import {PRoutineNode, PSubGroup, PTask, RoutineNodeKind} from "./net/protocal";
import {DATE_FMT, doneMark, evalRound, leafChecked, MANUAL_RULE, parseRule, Round, roundView, RoundView, RoutineRule, splitMark, undoneMark} from "./routineRule";

/**
 * 例行清单的内存模型：由子分组、任务和节点状态推导出每一层的节奏、这一期和勾选状态。
 * 清单页（Routine.tsx）和总视图（Overview.tsx）共用，保证两边的判断完全一致。
 */

export const nodeKey = (kind: RoutineNodeKind, id: number) => `${kind}:${id}`;

export function defaultNode(kind: RoutineNodeKind, id: number, sgID = 0): PRoutineNode {
    return {Kind: kind, NodeID: id, SubGroupID: sgID, Folder: false, Optional: false, Temp: false, Rule: '', Mark: '', PrevMark: ''};
}

// ---------------- 模型 ----------------

/** 节奏层：设了规则的那一层。继承它的叶子共用这一期。 */
export interface Owner {
    key: string
    rule: RoutineRule
    node: PRoutineNode // 节奏层标记所在的节点
    round: Round
    leafOwner: boolean // 节奏层本身就是一个事项
    ownLeaves: VNode[] // 跟随这一层节奏的叶子
    complete: boolean
    view: RoundView
}

export interface VNode {
    task: PTask
    sgID: number
    node: PRoutineNode
    folder: boolean
    ownRule: RoutineRule | null
    inheritedRule: RoutineRule
    rule: RoutineRule
    owner: Owner
    ownsRhythm: boolean // 这一层自己设了节奏
    optional: boolean
    temp: boolean
    children: VNode[]
    leaves: VNode[]
    active: boolean // 叶子：所在节奏已开始
    checked: boolean // 叶子
}

export interface SgModel {
    sg: PSubGroup
    node: PRoutineNode
    ownRule: RoutineRule | null
    rule: RoutineRule
    owner: Owner
    roots: VNode[]
    leaves: VNode[]
}

export interface Model {
    groupRule: RoutineRule
    groupNode: PRoutineNode
    groupOwner: Owner
    sgs: SgModel[]
    leaves: VNode[]
    owners: Owner[]
    byTask: Map<number, VNode>
}

export function makeOwner(key: string, rule: RoutineRule, node: PRoutineNode, today: string): Owner {
    return {
        key, rule, node, round: evalRound(rule, node.Mark, today), leafOwner: false, ownLeaves: [],
        complete: false, view: {phase: 'manual', label: '', missed: 0},
    };
}

export function buildModel(groupID: number, subGroups: PSubGroup[], tasks: Record<number, PTask[]>,
                    nodes: Record<string, PRoutineNode>, today: string): Model {
    const groupNode = nodes[nodeKey(RoutineNodeKind.Group, groupID)] ?? defaultNode(RoutineNodeKind.Group, groupID);
    const groupRule = parseRule(groupNode.Rule) ?? MANUAL_RULE;
    const groupOwner = makeOwner('g', groupRule, groupNode, today);
    const owners: Owner[] = [groupOwner];
    const byTask = new Map<number, VNode>();

    const sgs: SgModel[] = subGroups.map((sg) => {
        const sgNode = nodes[nodeKey(RoutineNodeKind.SubGroup, sg.ID)] ?? defaultNode(RoutineNodeKind.SubGroup, sg.ID);
        const sgOwn = parseRule(sgNode.Rule);
        const sgOwner = sgOwn ? makeOwner(`s${sg.ID}`, sgOwn, sgNode, today) : groupOwner;
        if (sgOwn) owners.push(sgOwner);
        const kids = new Map<number, PTask[]>();
        (tasks[sg.ID] ?? []).forEach((t) => {
            const arr = kids.get(t.ParentID) ?? [];
            arr.push(t);
            kids.set(t.ParentID, arr);
        });
        kids.forEach((arr) => arr.sort((a, b) => a.Index - b.Index));

        const build = (t: PTask, parentOwner: Owner, inheritedOptional: boolean, inheritedTemp: boolean): VNode => {
            const node = {...(nodes[nodeKey(RoutineNodeKind.Task, t.ID)] ?? defaultNode(RoutineNodeKind.Task, t.ID, sg.ID)), SubGroupID: sg.ID};
            const temp = inheritedTemp || node.Temp;
            // 本次补充没有自己的节奏，跟随上级
            const ownRule = temp ? null : parseRule(node.Rule);
            const owner = ownRule ? makeOwner(`t${t.ID}`, ownRule, node, today) : parentOwner;
            if (ownRule) owners.push(owner);
            const optional = inheritedOptional || node.Optional;
            const children = (kids.get(t.ID) ?? []).map((c) => build(c, owner, optional, temp));
            const folder = node.Folder || children.length > 0;
            const v: VNode = {
                task: t, sgID: sg.ID, node, folder, ownRule, inheritedRule: parentOwner.rule, rule: owner.rule, owner,
                ownsRhythm: !!ownRule, optional, temp, children, leaves: [], active: false, checked: false,
            };
            if (!folder) {
                v.leaves = [v];
                v.active = !owner.round.waiting;
                if (ownRule) {
                    owner.leafOwner = true;
                    v.checked = v.active && owner.round.markDone;
                } else {
                    v.checked = v.active && leafChecked(owner.round, node.Mark);
                }
                owner.ownLeaves.push(v);
            } else {
                v.leaves = children.flatMap((c) => c.leaves);
            }
            byTask.set(t.ID, v);
            return v;
        };
        const roots = (kids.get(0) ?? []).map((t) => build(t, sgOwner, false, false));
        return {sg, node: sgNode, ownRule: sgOwn, rule: sgOwner.rule, owner: sgOwner, roots, leaves: roots.flatMap((r) => r.leaves)};
    });

    owners.forEach((o) => {
        const act = o.ownLeaves.filter((l) => l.active);
        const req = act.filter((l) => !l.optional);
        const scope = req.length ? req : act;
        o.complete = o.leafOwner ? o.round.markDone : scope.length > 0 && scope.every((l) => l.checked);
        o.view = roundView(o.round, o.complete, today);
    });
    return {groupRule, groupNode, groupOwner, sgs, leaves: sgs.flatMap((s) => s.leaves), owners, byTask};
}

export interface Agg {
    done: number
    total: number
    reqDone: number
    reqTotal: number
    overdue: number
    today: number
    waiting: number
    nextStart?: string // 最早开始的未开始节奏
}

export function aggregate(leaves: VNode[]): Agg {
    const a: Agg = {done: 0, total: 0, reqDone: 0, reqTotal: 0, overdue: 0, today: 0, waiting: 0};
    leaves.forEach((l) => {
        if (!l.active) {
            a.waiting++;
            const s = l.owner.round.start;
            if (s && (!a.nextStart || s < a.nextStart)) a.nextStart = s;
            return;
        }
        a.total++;
        if (l.checked) a.done++;
        if (!l.optional) {
            a.reqTotal++;
            if (l.checked) a.reqDone++;
        }
        if (!l.checked && l.owner.view.phase === 'overdue') a.overdue++;
        if (!l.checked && l.owner.view.phase === 'today') a.today++;
    });
    return a;
}

/**
 * 叶子变化后同步节奏层的完成记录：这一期做齐了就记下完成日（“完成后 N 天”据此算下次刷新），
 * 取消勾选导致不再齐全时恢复之前的记录。返回需要写入的全部节点（含传入的 changed）。
 */
export function withOwnerSync(groupID: number, subGroups: PSubGroup[], tasks: Record<number, PTask[]>,
                              nodes: Record<string, PRoutineNode>, changed: PRoutineNode[], today: string,
                              drop: Set<number> = new Set()): PRoutineNode[] {
    const map = {...nodes};
    changed.forEach((c) => {
        map[nodeKey(c.Kind, c.NodeID)] = c;
    });
    const nextTasks: Record<number, PTask[]> = {};
    Object.entries(tasks).forEach(([sg, list]) => {
        nextTasks[Number(sg)] = list.filter((t) => !drop.has(t.ID));
    });
    const next = buildModel(groupID, subGroups, nextTasks, map, today);
    const out = new Map<string, PRoutineNode>(changed.map((c) => [nodeKey(c.Kind, c.NodeID), c]));
    next.owners.forEach((o) => {
        if (o.round.manual || o.round.waiting || o.leafOwner || o.ownLeaves.length === 0) return;
        const key = nodeKey(o.node.Kind, o.node.NodeID);
        const cur = out.get(key) ?? o.node;
        if (o.complete && !o.round.markDone) out.set(key, {...cur, PrevMark: cur.Mark, Mark: doneMark(o.round, today)});
        else if (!o.complete && o.round.markDone) out.set(key, {...cur, Mark: cur.PrevMark || undoneMark(o.rule, o.round), PrevMark: ''});
    });
    return Array.from(out.values());
}

/**
 * 勾选/取消一组叶子要写的节点：全部已勾则全部取消，否则补齐未勾的。
 * 全都没开始时返回 null，waitingStart 是最早的开始日（可能为空）。
 */
export function toggleLeaves(leaves: VNode[], today: string): { changed: PRoutineNode[] } | { changed: null, waitingStart?: string } {
    const act = leaves.filter((l) => l.active);
    if (act.length === 0) {
        const w = leaves.find((l) => !l.active);
        return {changed: null, waitingStart: w?.owner.round.start};
    }
    const allOn = act.every((l) => l.checked);
    const targets = allOn ? act : act.filter((l) => !l.checked);
    const now = dayjs().toISOString();
    const changed = targets.map((l): PRoutineNode => {
        if (l.ownsRhythm) {
            return allOn
                ? {...l.node, Mark: l.node.PrevMark || undoneMark(l.rule, l.owner.round), PrevMark: ''}
                : {...l.node, PrevMark: l.node.Mark, Mark: doneMark(l.owner.round, today)};
        }
        return {...l.node, Mark: allOn ? '' : now};
    });
    return {changed};
}

// ---------------- 页面上的三种状态 ----------------

/**
 * 叶子在页面上的归类（只影响摆放，不影响勾选和进度）：
 * - pending：这一期已开始、还没勾
 * - doneToday：今天勾的；手动节奏没有“下一次”，勾了就一直算这一类，直到清空重来
 * - rest：暂不用做，之前就做完了在等下一次，或者第一次还没到
 */
export type LeafState = 'pending' | 'doneToday' | 'rest';

export function leafState(v: VNode, today: string): LeafState {
    if (!v.active) return 'rest';
    if (!v.checked) return 'pending';
    if (v.owner.round.manual) return 'doneToday';
    const done = leafDoneDate(v);
    return !done || done >= today ? 'doneToday' : 'rest';
}

/** 叶子的勾选日期：自己有节奏的记在标记的完成日里，跟随上级的标记就是勾选时间。 */
function leafDoneDate(v: VNode): string {
    if (v.ownsRhythm) return splitMark(v.node.Mark).done;
    const d = dayjs(v.node.Mark);
    return d.isValid() ? d.format(DATE_FMT) : '';
}

/** 暂不用做的叶子下一次要做的日子：做完的看下次刷新，没开始的看开始日。 */
export function restDate(v: VNode): string {
    return (v.active ? v.owner.round.next : v.owner.round.start) ?? '';
}
