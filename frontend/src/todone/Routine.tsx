import {useCallback, useEffect, useMemo, useRef, useState} from "react";
import {Button, Drawer, Dropdown, Empty, Input, InputRef, message, Modal, Popconfirm, Segmented, Spin, Switch, theme, Tooltip} from "antd";
import {
    CheckCircleFilled,
    DeleteOutlined,
    EditOutlined,
    EyeInvisibleOutlined,
    EyeOutlined,
    HolderOutlined,
    MoreOutlined,
    PlusOutlined,
    RedoOutlined,
    SettingOutlined,
    UnorderedListOutlined,
} from "@ant-design/icons";
import {
    CollisionDetection,
    DndContext,
    DragEndEvent,
    DragMoveEvent,
    DragOverlay,
    MeasuringStrategy,
    MouseSensor,
    pointerWithin,
    TouchSensor,
    useDraggable,
    useDroppable,
    useSensor,
    useSensors,
} from "@dnd-kit/core";
import dayjs from "dayjs";
import {Addr} from "./addr";
import {PRoutineNode, PSubGroup, PTask, RoutineNodeKind} from "./net/protocal";
import {
    RoutineDelTasks,
    sendChangeSubGroup,
    sendChangeTask,
    sendCreateSubGroup,
    sendCreateTask,
    sendDelSubGroup,
    sendGetRoutine,
    sendGetSubGroup,
    sendGetTasks,
    sendSaveRoutine,
    sendTaskMove,
} from "./net/send_back";
import {
    describeRule,
    doneMark,
    undoneMark,
    evalRound,
    leafChecked,
    MANUAL_RULE,
    parseRule,
    Round,
    roundView,
    RoundView,
    RoutineRule,
    shortDate,
    stringifyRule,
    todayStr,
} from "./routineRule";
import {CheckValue, ProgressRing, RhythmChip, RoutineCheck, RuleEditor, RuleIcon} from "./RoutineParts";
import {useIsMobile} from "../common/hooksv2";
import "./Routine.css";

// ---------------- 工具 ----------------

type Cb<Ret> = (ret: { data: Ret, ok: boolean }) => void;

function call<Req, Ret>(fn: (req: Req, cb: Cb<Ret>) => void, req: Req): Promise<{ data: Ret, ok: boolean }> {
    return new Promise((resolve) => fn(req, resolve));
}

const nodeKey = (kind: RoutineNodeKind, id: number) => `${kind}:${id}`;

function defaultNode(kind: RoutineNodeKind, id: number, sgID = 0): PRoutineNode {
    return {Kind: kind, NodeID: id, SubGroupID: sgID, Folder: false, Optional: false, Temp: false, Rule: '', Mark: '', PrevMark: ''};
}

function useLocalFlag(key: string, init: boolean): [boolean, (v: boolean) => void] {
    const [v, setV] = useState<boolean>(() => {
        try {
            const raw = localStorage.getItem(key);
            return raw === null ? init : raw === '1';
        } catch {
            return init;
        }
    });
    const set = useCallback((next: boolean) => {
        setV(next);
        try {
            localStorage.setItem(key, next ? '1' : '0');
        } catch {
            // 忽略存储失败
        }
    }, [key]);
    return [v, set];
}

// ---------------- 模型 ----------------

/** 节奏层：设了规则的那一层。继承它的叶子共用这一期。 */
interface Owner {
    key: string
    rule: RoutineRule
    node: PRoutineNode // 节奏层标记所在的节点
    round: Round
    leafOwner: boolean // 节奏层本身就是一个事项
    ownLeaves: VNode[] // 跟随这一层节奏的叶子
    complete: boolean
    view: RoundView
}

interface VNode {
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

interface SgModel {
    sg: PSubGroup
    node: PRoutineNode
    ownRule: RoutineRule | null
    rule: RoutineRule
    owner: Owner
    roots: VNode[]
    leaves: VNode[]
}

interface Model {
    groupRule: RoutineRule
    groupNode: PRoutineNode
    groupOwner: Owner
    sgs: SgModel[]
    leaves: VNode[]
    owners: Owner[]
    byTask: Map<number, VNode>
}

function makeOwner(key: string, rule: RoutineRule, node: PRoutineNode, today: string): Owner {
    return {
        key, rule, node, round: evalRound(rule, node.Mark, today), leafOwner: false, ownLeaves: [],
        complete: false, view: {phase: 'manual', label: '', missed: 0},
    };
}

function buildModel(groupID: number, subGroups: PSubGroup[], tasks: Record<number, PTask[]>,
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

interface Agg {
    done: number
    total: number
    reqDone: number
    reqTotal: number
    overdue: number
    today: number
    waiting: number
    nextStart?: string // 最早开始的未开始节奏
}

function aggregate(leaves: VNode[]): Agg {
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

function checkValue(leaves: VNode[]): CheckValue {
    const act = leaves.filter((l) => l.active);
    const done = act.filter((l) => l.checked).length;
    if (act.length > 0 && done === act.length) return 'on';
    return done > 0 ? 'mixed' : 'off';
}

/** 跟随这一层节奏的叶子：一层的勾选和计数只管它们，各自有节奏的子项自己负责。 */
function ownScope(leaves: VNode[], owner: Owner): VNode[] {
    return leaves.filter((l) => l.owner === owner);
}

function collectSubtree(v: VNode): number[] {
    return [v.task.ID, ...v.children.flatMap(collectSubtree)];
}

/** 范围内的本次补充（最外层那个）。 */
function tempRoots(model: Model, leaves: VNode[]): VNode[] {
    const inScope = new Set(leaves);
    const out: VNode[] = [];
    model.byTask.forEach((v) => {
        if (!v.node.Temp) return;
        const parent = model.byTask.get(v.task.ParentID);
        if (parent?.temp) return;
        if (v.leaves.some((l) => inScope.has(l)) || (v.leaves.length === 0 && leaves.some((l) => l.sgID === v.sgID))) out.push(v);
    });
    return out;
}

function resettable(model: Model, leaves: VNode[]): { manual: number, checked: number, temps: VNode[], any: boolean } {
    const manual = leaves.filter((l) => l.rule.kind === 'manual' && !l.temp);
    const checked = manual.filter((l) => l.checked).length;
    const temps = tempRoots(model, leaves);
    return {manual: manual.length, checked, temps, any: checked > 0 || temps.length > 0};
}

// ---------------- 拖动 ----------------

type DropPos = 'before' | 'after' | 'inside';

interface DropTarget {
    kind: 'row' | 'card'
    id: number // 任务 ID 或子分组 ID
    pos: DropPos
}

/** 指针所在的行优先，其次是所在的卡片（放到卡片末尾）。 */
const dropCollision: CollisionDetection = (args) => {
    const hits = pointerWithin(args);
    const row = hits.find((h) => String(h.id).startsWith('row-'));
    if (row) return [row];
    const card = hits.find((h) => String(h.id).startsWith('card-'));
    return card ? [card] : [];
};

/** 拖动期间指针的真实位置（视口坐标）。dnd-kit 的位移不含页面滚动，自动滚动时会偏。 */
const lastPointer = {y: 0};

function trackPointer(e: MouseEvent | TouchEvent | PointerEvent) {
    const t = 'touches' in e ? (e.touches[0] ?? e.changedTouches[0]) : e;
    if (t) lastPointer.y = t.clientY;
}

function setPointerTracking(on: boolean) {
    (['mousemove', 'pointermove', 'touchmove'] as const).forEach((k) =>
        on ? window.addEventListener(k, trackPointer, {passive: true}) : window.removeEventListener(k, trackPointer));
}

function pointerY(e: DragMoveEvent | DragEndEvent): number {
    if (lastPointer.y) return lastPointer.y;
    const ae = e.activatorEvent as MouseEvent | TouchEvent;
    const y0 = 'touches' in ae ? (ae.touches[0]?.clientY ?? 0) : ae.clientY;
    return y0 + e.delta.y;
}

// ---------------- 页面 ----------------

interface RoutineProps {
    addr: Addr | null
    groupTitle: string
}

type EditorTarget =
    | { type: 'task', taskID: number }
    | { type: 'subgroup', sgID: number }
    | { type: 'group' };

interface CreateOpt {
    temp?: boolean
    folder?: boolean
}

interface ResetTarget {
    title: string
    leaves: VNode[]
}

export default function Routine(props: RoutineProps) {
    const {token} = theme.useToken();
    const isMobile = useIsMobile();
    const addr = props.addr;
    const userID = addr?.userID ?? '';
    const dirID = addr ? addr.getParentUnit().ID : 0;
    const groupID = addr ? addr.getLastUnit().ID : 0;

    const [subGroups, setSubGroups] = useState<PSubGroup[]>([]);
    const [tasks, setTasks] = useState<Record<number, PTask[]>>({});
    const [nodes, setNodes] = useState<Record<string, PRoutineNode>>({});
    const [loading, setLoading] = useState(false);
    const [today, setToday] = useState(todayStr());
    const [hideDone, setHideDone] = useLocalFlag(`todone:routine:hideDone:${groupID}`, false);
    const [editor, setEditor] = useState<EditorTarget | null>(null);
    const [reviewOpen, setReviewOpen] = useState(false);
    const [resetTarget, setResetTarget] = useState<ResetTarget | null>(null);
    const [addingSg, setAddingSg] = useState(false);
    const nodesRef = useRef(nodes);
    nodesRef.current = nodes;

    // 跨过零点或切回页面时刷新“今天”
    useEffect(() => {
        const timer = window.setInterval(() => setToday(todayStr()), 60 * 1000);
        const onFocus = () => setToday(todayStr());
        window.addEventListener('focus', onFocus);
        return () => {
            window.clearInterval(timer);
            window.removeEventListener('focus', onFocus);
        };
    }, []);

    const loadTasks = useCallback(async (sgID: number) => {
        const ret = await call(sendGetTasks, {UserID: userID, ParentDirID: dirID, GroupID: groupID, SubGroupID: sgID, ContainDone: false});
        if (ret.ok) setTasks((prev) => ({...prev, [sgID]: ret.data.Tasks ?? []}));
        return ret.ok;
    }, [userID, dirID, groupID]);

    const loadAll = useCallback(async () => {
        if (!userID || !groupID) return;
        setLoading(true);
        const [sgRet, rtRet] = await Promise.all([
            call(sendGetSubGroup, {UserID: userID, ParentDirID: dirID, GroupID: groupID}),
            sendGetRoutine({UserID: userID, DirID: dirID, GroupID: groupID}),
        ]);
        if (!sgRet.ok || !rtRet.ok) {
            message.error('加载例行清单失败');
            setLoading(false);
            return;
        }
        const sgs = (sgRet.data.SubGroups ?? []).slice().sort((a, b) => a.Index - b.Index);
        const taskRets = await Promise.all(sgs.map((sg) =>
            call(sendGetTasks, {UserID: userID, ParentDirID: dirID, GroupID: groupID, SubGroupID: sg.ID, ContainDone: false})));
        const nextTasks: Record<number, PTask[]> = {};
        sgs.forEach((sg, i) => {
            nextTasks[sg.ID] = taskRets[i].ok ? (taskRets[i].data.Tasks ?? []) : [];
        });
        const nextNodes: Record<string, PRoutineNode> = {};
        (rtRet.data.Nodes ?? []).forEach((n) => {
            nextNodes[nodeKey(n.Kind, n.NodeID)] = n;
        });
        setSubGroups(sgs);
        setTasks(nextTasks);
        setNodes(nextNodes);
        setLoading(false);
    }, [userID, dirID, groupID]);

    useEffect(() => {
        setSubGroups([]);
        setTasks({});
        setNodes({});
        loadAll().then();
    }, [loadAll]);

    const model = useMemo(() => buildModel(groupID, subGroups, tasks, nodes, today),
        [groupID, subGroups, tasks, nodes, today]);
    const total = useMemo(() => aggregate(model.leaves), [model]);

    // ---------- 写入 ----------

    const commit = useCallback(async (changed: PRoutineNode[], delTasks: RoutineDelTasks[] = []) => {
        const before = nodesRef.current;
        setNodes((prev) => {
            const next = {...prev};
            changed.forEach((c) => {
                next[nodeKey(c.Kind, c.NodeID)] = c;
            });
            return next;
        });
        if (delTasks.length) {
            setTasks((prev) => {
                const next = {...prev};
                delTasks.forEach((d) => {
                    const ids = new Set(d.TaskIDs);
                    next[d.SubGroupID] = (next[d.SubGroupID] ?? []).filter((t) => !ids.has(t.ID));
                });
                return next;
            });
        }
        const ret = await sendSaveRoutine({UserID: userID, DirID: dirID, GroupID: groupID, Nodes: changed, DelTasks: delTasks});
        if (!ret.ok) {
            message.error('保存失败，已恢复');
            setNodes(before);
            if (delTasks.length) loadAll().then();
        }
        return ret.ok;
    }, [userID, dirID, groupID, loadAll]);

    /**
     * 叶子变化后同步节奏层的完成记录：这一期做齐了就记下完成日（“完成后 N 天”据此算下次刷新），
     * 取消勾选导致不再齐全时恢复之前的记录。
     */
    const withOwnerSync = (changed: PRoutineNode[], drop: Set<number> = new Set()): PRoutineNode[] => {
        const map = {...nodesRef.current};
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
    };

    /** 勾选/取消一组叶子：全部已勾则全部取消，否则补齐未勾的。未开始的节奏不能勾。 */
    const toggle = (leaves: VNode[]) => {
        const act = leaves.filter((l) => l.active);
        if (act.length === 0) {
            const w = leaves.find((l) => !l.active);
            if (w) message.info(w.owner.round.start ? `${shortDate(w.owner.round.start)} 才开始` : '还没开始');
            return;
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
        commit(withOwnerSync(changed)).then();
    };

    /** 清空重来：清空手动节奏下的勾选；本次补充按选择留下（转常驻）或移除。 */
    const doReset = (target: ResetTarget, keep: Set<number>) => {
        const temps = tempRoots(model, target.leaves);
        const delBySg = new Map<number, number[]>();
        const changed = new Map<string, PRoutineNode>();
        const drop = new Set<number>();
        temps.forEach((v) => {
            if (keep.has(v.task.ID)) {
                changed.set(nodeKey(RoutineNodeKind.Task, v.task.ID), {...v.node, Temp: false});
                return;
            }
            const ids = collectSubtree(v);
            ids.forEach((id) => drop.add(id));
            delBySg.set(v.sgID, [...(delBySg.get(v.sgID) ?? []), ...ids]);
        });
        target.leaves.forEach((l) => {
            if (drop.has(l.task.ID) || l.rule.kind !== 'manual' || !l.node.Mark) return;
            const key = nodeKey(RoutineNodeKind.Task, l.task.ID);
            changed.set(key, {...(changed.get(key) ?? l.node), Mark: '', PrevMark: ''});
        });
        const delTasks: RoutineDelTasks[] = Array.from(delBySg.entries()).map(([sgID, ids]) => ({SubGroupID: sgID, TaskIDs: ids}));
        const list = Array.from(changed.values());
        if (!list.length && !delTasks.length) return;
        commit(withOwnerSync(list, drop), delTasks).then((ok) => ok && message.success('已重置'));
    };

    const createItem = async (sgID: number, parentID: number, title: string, opt: CreateOpt = {}) => {
        const ret = await call(sendCreateTask, {
            UserID: userID, DirID: dirID, GroupID: groupID, SubGroupID: sgID, ParentTask: parentID,
            Title: title, Note: '', AfterID: 0, Started: false, TaskType: 0,
        });
        if (!ret.ok || !ret.data.Task) {
            message.error('添加失败');
            return;
        }
        const task = ret.data.Task;
        setTasks((prev) => ({...prev, [sgID]: [...(prev[sgID] ?? []), task]}));
        if (opt.temp || opt.folder) {
            await commit([{...defaultNode(RoutineNodeKind.Task, task.ID, sgID), Temp: !!opt.temp, Folder: !!opt.folder}]);
        }
        // 服务端分配的顺序以重新拉取为准
        loadTasks(sgID).then();
    };

    const saveTask = async (v: VNode, patch: Partial<PTask>) => {
        const data = {...v.task, ...patch};
        const ret = await call(sendChangeTask, {UserID: userID, DirID: dirID, GroupID: groupID, SubGroupID: v.sgID, Data: data});
        if (ret.ok) setTasks((prev) => ({...prev, [v.sgID]: (prev[v.sgID] ?? []).map((t) => t.ID === data.ID ? data : t)}));
        else message.error('保存失败');
    };

    /** 修改某一层的节奏：这一层的完成记录从头开始。 */
    const applyRule = (target: EditorTarget, rule: RoutineRule | null) => {
        const raw = stringifyRule(rule);
        let own: PRoutineNode;
        if (target.type === 'group') own = model.groupNode;
        else if (target.type === 'subgroup') own = model.sgs.find((s) => s.sg.ID === target.sgID)!.node;
        else own = model.byTask.get(target.taskID)!.node;
        const next = {...own, Rule: target.type === 'group' ? (raw || stringifyRule(MANUAL_RULE)) : raw, Mark: '', PrevMark: ''};
        commit(withOwnerSync([next])).then((ok) => ok && message.success('节奏已更新'));
    };

    // ---------- 拖动：同层排序、跨层级、拖进分组、跨卡片 ----------

    const [dragID, setDragID] = useState<number | null>(null);
    const [drop, setDrop] = useState<DropTarget | null>(null);
    const [moving, setMoving] = useState(false);
    const sensors = useSensors(
        useSensor(MouseSensor, {activationConstraint: {distance: 5}}),
        useSensor(TouchSensor, {activationConstraint: {delay: 180, tolerance: 6}}),
    );

    const computeDrop = (e: DragMoveEvent | DragEndEvent): DropTarget | null => {
        const dragged = dragID ? model.byTask.get(dragID) : undefined;
        const over = e.over;
        if (!dragged || !over) return null;
        const d = over.data.current as { kind: 'row' | 'card', id: number } | undefined;
        if (!d) return null;
        if (d.kind === 'card') return {kind: 'card', id: d.id, pos: 'inside'};
        // 不能放到自己或自己的子孙里
        if (collectSubtree(dragged).includes(d.id)) return null;
        const t = model.byTask.get(d.id);
        if (!t) return null;
        const rel = (pointerY(e) - over.rect.top) / Math.max(1, over.rect.height);
        if (t.folder) return {kind: 'row', id: d.id, pos: rel < 0.25 ? 'before' : rel > 0.8 ? 'after' : 'inside'};
        return {kind: 'row', id: d.id, pos: rel < 0.5 ? 'before' : 'after'};
    };

    const sameDrop = (a: DropTarget | null, b: DropTarget | null) =>
        a?.kind === b?.kind && a?.id === b?.id && a?.pos === b?.pos;

    const onDragMove = (e: DragMoveEvent) => {
        const next = computeDrop(e);
        setDrop((prev) => sameDrop(prev, next) ? prev : next);
    };

    const onDragEnd = (e: DragEndEvent) => {
        const target = computeDrop(e);
        setPointerTracking(false);
        const v = dragID ? model.byTask.get(dragID) : undefined;
        setDragID(null);
        setDrop(null);
        if (!v || !target) return;
        let trgSg: number, trgParent: number, trgTask = 0, after = true;
        if (target.kind === 'card') {
            trgSg = target.id;
            trgParent = 0;
        } else {
            const t = model.byTask.get(target.id)!;
            trgSg = t.sgID;
            if (target.pos === 'inside') {
                trgParent = t.task.ID;
            } else {
                trgParent = t.task.ParentID;
                trgTask = t.task.ID;
                after = target.pos === 'after';
            }
        }
        if (trgTask === v.task.ID) return;
        // 原来的分组只剩这一项时，搬走后仍保持为分组
        const src = model.byTask.get(v.task.ParentID);
        const keepFolder = src && !src.node.Folder && src.children.length === 1 && trgParent !== src.task.ID
            ? [{...src.node, Folder: true}] : [];
        setMoving(true);
        sendTaskMove({
            UserID: userID, DirID: dirID, GroupID: groupID, SubGroupID: v.sgID, TaskIDs: [v.task.ID],
            TrgDir: dirID, TrgGroup: groupID, TrgSubGroup: trgSg, TrgParentID: trgParent, TrgTaskID: trgTask, After: after,
        }, async (ret) => {
            if (!ret.ok) message.error('移动失败');
            else if (keepFolder.length) await commit(keepFolder);
            await Promise.all([loadTasks(v.sgID), trgSg !== v.sgID ? loadTasks(trgSg) : Promise.resolve(true)]);
            setMoving(false);
        });
    };

    const draggedNode = dragID ? model.byTask.get(dragID) : undefined;

    if (!addr) return null;

    const ctx: RowCtx = {
        hideDone,
        dragID,
        drop,
        onToggle: toggle,
        onEdit: (taskID) => setEditor({type: 'task', taskID}),
        onCreate: createItem,
    };

    const rootStyle = {
        '--rt-primary': token.colorPrimary,
        '--rt-primary-bg': token.colorPrimaryBg,
        '--rt-warning': token.colorWarning,
        '--rt-warning-bg': token.colorWarningBg,
        '--rt-error': token.colorError,
        '--rt-error-bg': token.colorErrorBg,
        '--rt-text': token.colorText,
        '--rt-text-2': token.colorTextSecondary,
        '--rt-text-3': token.colorTextTertiary,
        '--rt-text-4': token.colorTextQuaternary,
        '--rt-border': token.colorBorderSecondary,
        '--rt-fill': token.colorFillQuaternary,
        '--rt-fill-2': token.colorFillTertiary,
        '--rt-card': token.colorBgContainer,
    } as React.CSSProperties;

    const roundDone = total.total > 0 && total.done >= total.total;
    const resting = total.total === 0 && total.waiting > 0;
    const editorNode = editor?.type === 'task' ? model.byTask.get(editor.taskID) : undefined;
    const groupReset = resettable(model, model.leaves);
    const groupHasRhythm = model.groupRule.kind !== 'manual';

    return <div className="rt-root" style={rootStyle}>
        {/* ---------- 头部 ---------- */}
        <div className="rt-hero">
            <ProgressRing done={total.done} total={total.total} size={isMobile ? 64 : 76}>
                {roundDone
                    ? <CheckCircleFilled className="rt-ring-ok"/>
                    : <span className="rt-ring-num">{total.done}<small>/{total.total}</small></span>}
            </ProgressRing>
            <div className="rt-hero-main">
                <div className="rt-hero-title">{props.groupTitle}</div>
                <div className="rt-hero-sub">
                    {groupHasRhythm
                        ? <RhythmChip rule={model.groupRule} view={model.groupOwner.view} onClick={() => setEditor({type: 'group'})}/>
                        : <span className="rt-rhythm-inherit" onClick={() => setEditor({type: 'group'})}><RuleIcon rule={model.groupRule}/>{describeRule(model.groupRule)}</span>}
                    {total.overdue > 0 && <span className="rt-stat rt-stat-overdue">{total.overdue} 项逾期</span>}
                    {total.today > 0 && <span className="rt-stat rt-stat-today">{total.today} 项今天</span>}
                    {total.total > 0 && total.reqTotal < total.total &&
                        <span className="rt-hero-meta">必选 {total.reqDone}/{total.reqTotal}</span>}
                </div>
                {resting && <div className="rt-hero-rest">还没开始 · {total.nextStart ? shortDate(total.nextStart) : '—'} 第一次刷新</div>}
            </div>
            <div className="rt-hero-actions">
                {(loading || moving) && <Spin size="small"/>}
                <Tooltip title={hideDone ? '显示已完成' : '隐藏已完成'}>
                    <Button type="text" icon={hideDone ? <EyeInvisibleOutlined/> : <EyeOutlined/>}
                            onClick={() => setHideDone(!hideDone)}/>
                </Tooltip>
                <Tooltip title="复核">
                    <Button type="text" icon={<UnorderedListOutlined/>} onClick={() => setReviewOpen(true)}/>
                </Tooltip>
                {(groupReset.manual > 0 || groupReset.temps.length > 0) &&
                    <Tooltip title={groupReset.any ? '清空重来' : '没有需要清空的内容'}>
                        <Button type="text" icon={<RedoOutlined/>} disabled={!groupReset.any}
                                onClick={() => setResetTarget({title: props.groupTitle, leaves: model.leaves})}/>
                    </Tooltip>}
                <Tooltip title="清单设置">
                    <Button type="text" icon={<SettingOutlined/>} onClick={() => setEditor({type: 'group'})}/>
                </Tooltip>
            </div>
        </div>

        {/* ---------- 顶层分组 ---------- */}
        {!loading && model.sgs.length === 0 &&
            <div className="rt-empty">
                <Empty description="还没有分组。比如「每周」「半月」「出门前」，分组里还能再建分组。"/>
            </div>}

        <DndContext
            sensors={sensors}
            collisionDetection={dropCollision}
            measuring={{droppable: {strategy: MeasuringStrategy.Always}}}
            onDragStart={(e) => {
                lastPointer.y = 0;
                setPointerTracking(true);
                setDragID((e.active.data.current as { id: number }).id);
            }}
            onDragMove={onDragMove}
            onDragEnd={onDragEnd}
            onDragCancel={() => {
                setPointerTracking(false);
                setDragID(null);
                setDrop(null);
            }}
        >
        {model.sgs.map((sgm) =>
            <SubGroupCard
                key={sgm.sg.ID}
                sgm={sgm}
                model={model}
                ctx={ctx}
                onReset={() => setResetTarget({title: sgm.sg.Title, leaves: sgm.leaves})}
                onEdit={() => setEditor({type: 'subgroup', sgID: sgm.sg.ID})}
                onDelete={async () => {
                    const ret = await call(sendDelSubGroup, {UserID: userID, ParentDirID: dirID, GroupID: groupID, SubGroupID: sgm.sg.ID});
                    if (ret.ok) setSubGroups((prev) => prev.filter((s) => s.ID !== sgm.sg.ID));
                    else message.error('删除失败');
                }}
            />)}
            {/* 拖动浮层：不受任何折叠容器裁剪 */}
            <DragOverlay dropAnimation={null}>
                {draggedNode && <div className="rt-overlay">
                    <HolderOutlined className="rt-overlay-handle"/>
                    <RoutineCheck value={checkValue(draggedNode.leaves)} optional={draggedNode.optional}/>
                    <span className="rt-overlay-title">{draggedNode.task.Title}</span>
                    {draggedNode.folder && draggedNode.leaves.length > 0 &&
                        <span className="rt-row-sub">含 {draggedNode.leaves.length} 项</span>}
                </div>}
            </DragOverlay>
        </DndContext>

        {addingSg
            ? <InlineAdder
                placeholder="分组名称，回车创建"
                onSubmit={async (title) => {
                    const ret = await call(sendCreateSubGroup, {UserID: userID, ParentDirID: dirID, GroupID: groupID, Title: title, Note: '', AfterID: 0});
                    if (!ret.ok) {
                        message.error('创建失败');
                        return;
                    }
                    setSubGroups((prev) => [...prev, {ID: ret.data.SubGroupID, Title: title, Note: '', Index: ret.data.Index}]);
                    setTasks((prev) => ({...prev, [ret.data.SubGroupID]: []}));
                    setAddingSg(false);
                }}
                onCancel={() => setAddingSg(false)}
            />
            : <button className="rt-add-sg" onClick={() => setAddingSg(true)}><PlusOutlined/> 新建分组</button>}

        {/* ---------- 复核 ---------- */}
        <ReviewSheet open={reviewOpen} onClose={() => setReviewOpen(false)} model={model} agg={total}
                     onToggle={toggle} isMobile={isMobile} rootStyle={rootStyle}/>

        {/* ---------- 重置 ---------- */}
        <ResetDialog target={resetTarget} model={model} rootStyle={rootStyle}
                     onClose={() => setResetTarget(null)}
                     onConfirm={(keep) => {
                         if (resetTarget) doReset(resetTarget, keep);
                         setResetTarget(null);
                     }}/>

        {/* ---------- 编辑 ---------- */}
        <Drawer
            open={!!editor}
            onClose={() => setEditor(null)}
            placement={isMobile ? 'bottom' : 'right'}
            height={isMobile ? '85%' : undefined}
            width={isMobile ? undefined : 400}
            title={editor?.type === 'group' ? '清单设置' : editor?.type === 'subgroup' ? '分组设置'
                : editorNode?.folder ? '分组' : '事项'}
            destroyOnClose
            className="rt-drawer"
            rootStyle={rootStyle}
        >
            {editor?.type === 'group' &&
                <Section title="刷新节奏" hint="没有单独设置节奏的分组和事项都跟随这里">
                    <RuleEditor value={model.groupRule} inherited={null} onApply={(r) => applyRule({type: 'group'}, r)}/>
                </Section>}
            {editor?.type === 'subgroup' && (() => {
                const sgm = model.sgs.find((s) => s.sg.ID === editor.sgID);
                if (!sgm) return null;
                const saveSg = async (patch: Partial<PSubGroup>) => {
                    const data = {...sgm.sg, ...patch};
                    const ret = await call(sendChangeSubGroup, {UserID: userID, ParentDirID: dirID, GroupID: groupID, Data: data});
                    if (ret.ok) setSubGroups((prev) => prev.map((s) => s.ID === data.ID ? data : s));
                    else message.error('保存失败');
                };
                return <>
                    <Section title="名称"><TextField value={sgm.sg.Title} onSave={(t) => saveSg({Title: t})}/></Section>
                    <Section title="备注"><TextField value={sgm.sg.Note} multiline allowEmpty placeholder="操作说明、注意事项…" onSave={(t) => saveSg({Note: t})}/></Section>
                    <Section title="刷新节奏">
                        <RuleEditor value={sgm.ownRule} inherited={model.groupRule} onApply={(r) => applyRule(editor, r)}/>
                    </Section>
                </>;
            })()}
            {editor?.type === 'task' && editorNode &&
                <TaskEditor
                    v={editorNode}
                    onSave={(patch) => saveTask(editorNode, patch)}
                    onOptional={(optional) => commit(withOwnerSync([{...editorNode.node, Optional: optional}]))}
                    onMakePermanent={() => commit([{...editorNode.node, Temp: false}]).then()}
                    onRule={(r) => applyRule(editor, r)}
                    onAdd={(title, folder) => createItem(editorNode.sgID, editorNode.task.ID, title, {folder, temp: false})}
                    onDelete={() => {
                        const ids = collectSubtree(editorNode);
                        commit(withOwnerSync([], new Set(ids)), [{SubGroupID: editorNode.sgID, TaskIDs: ids}]).then();
                        setEditor(null);
                    }}
                />}
        </Drawer>
    </div>
}

// ---------------- 顶层分组卡片 ----------------

interface RowCtx {
    hideDone: boolean
    dragID: number | null
    drop: DropTarget | null
    onToggle: (leaves: VNode[]) => void
    onEdit: (taskID: number) => void
    onCreate: (sgID: number, parentID: number, title: string, opt?: CreateOpt) => Promise<void>
}

function SubGroupCard(props: {
    sgm: SgModel
    model: Model
    ctx: RowCtx
    onReset: () => void
    onEdit: () => void
    onDelete: () => void
}) {
    const {sgm} = props;
    const [open, setOpen] = useLocalFlag(`todone:routine:sgOpen:${sgm.sg.ID}`, true);
    const scope = ownScope(sgm.leaves, sgm.owner);
    const others = sgm.leaves.length - scope.length;
    const agg = aggregate(scope);
    const overdue = aggregate(sgm.leaves).overdue; // 红点统计整块，方便扫出哪块有问题
    const cv = checkValue(scope);
    const container = scope.length === 0 && others > 0;
    const waiting = agg.total === 0 && agg.waiting > 0;
    const allDone = checkValue(sgm.leaves) === 'on';
    const reset = resettable(props.model, sgm.leaves);
    const {setNodeRef} = useDroppable({id: `card-${sgm.sg.ID}`, data: {kind: 'card', id: sgm.sg.ID}});
    const dropHere = props.ctx.drop?.kind === 'card' && props.ctx.drop.id === sgm.sg.ID;
    // 拖到收起的卡片上停一会儿自动展开
    useEffect(() => {
        if (!dropHere || open) return;
        const t = window.setTimeout(() => setOpen(true), 500);
        return () => window.clearTimeout(t);
    }, [dropHere, open, setOpen]);

    return <div ref={setNodeRef}
                className={`rt-card${allDone ? ' rt-card-done' : ''}${waiting ? ' rt-card-waiting' : ''}${dropHere ? ' rt-drop-card' : ''}`}>
        <div className="rt-card-head">
            {container
                ? <span className="rt-check-spacer" style={{width: 24}}/>
                : <RoutineCheck value={cv} size={24} disabled={waiting} onClick={() => props.ctx.onToggle(scope)}/>}
            <div className="rt-card-title" onClick={() => setOpen(!open)}>
                <span className="rt-card-name">{sgm.sg.Title}</span>
                <LayerRhythm own={!!sgm.ownRule} rule={sgm.rule} view={sgm.owner.view} onEdit={props.onEdit}/>
            </div>
            <div className="rt-card-meta" onClick={() => setOpen(!open)}>
                {overdue > 0 && <span className="rt-dot rt-dot-overdue">{overdue}</span>}
                <LayerCount agg={agg} waiting={waiting} others={others}/>
                <span className={`rt-caret${open ? ' rt-caret-open' : ''}`}/>
            </div>
            <Dropdown
                trigger={['click']}
                menu={{
                    items: [
                        {key: 'edit', icon: <EditOutlined/>, label: '名称、备注与节奏'},
                        ...(reset.manual > 0 || reset.temps.length > 0
                            ? [{key: 'reset', icon: <RedoOutlined/>, label: reset.any ? '清空重来' : '清空重来（没有可清空的）', disabled: !reset.any}] : []),
                        {type: 'divider' as const},
                        {key: 'del', icon: <DeleteOutlined/>, label: '删除分组', danger: true},
                    ],
                    onClick: ({key}) => {
                        if (key === 'edit') props.onEdit();
                        if (key === 'reset') props.onReset();
                        if (key === 'del') Modal.confirm({
                            title: `删除分组「${sgm.sg.Title}」？`, content: '分组下的事项会一起删除，无法恢复。',
                            okText: '删除', okButtonProps: {danger: true}, cancelText: '取消', onOk: props.onDelete,
                        });
                    },
                }}
            >
                <Button className="rt-card-more" type="text" icon={<MoreOutlined/>}/>
            </Dropdown>
        </div>
        {sgm.sg.Note && <Note text={sgm.sg.Note} className="rt-card-note"/>}
        <div className="rt-bar"><div style={{width: `${agg.total ? agg.done / agg.total * 100 : 0}%`}}/></div>
        <Collapse open={open}>
            <div className="rt-card-body">
                <RowList nodes={sgm.roots} ctx={props.ctx}/>
                {sgm.roots.length === 0 && <div className="rt-card-empty">还没有内容</div>}
                <Adders sgID={sgm.sg.ID} parentID={0} ctx={props.ctx}/>
            </div>
        </Collapse>
    </div>
}

// ---------------- 行 ----------------

function RowList(props: { nodes: VNode[], ctx: RowCtx }) {
    if (props.nodes.length === 0) return null;
    return <div className="rt-rows">
        {props.nodes.map((n) => <Row key={n.task.ID} v={n} ctx={props.ctx}/>)}
    </div>
}

function Row(props: { v: VNode, ctx: RowCtx }) {
    const {v, ctx} = props;
    const scope = v.folder ? ownScope(v.leaves, v.owner) : [v];
    const others = v.leaves.length - scope.length;
    const container = v.folder && scope.length === 0 && others > 0;
    const cv = checkValue(scope);
    const [open, setOpen] = useLocalFlag(`todone:routine:taskOpen:${v.task.ID}`, true);
    const drag = useDraggable({id: `drag-${v.task.ID}`, data: {id: v.task.ID}});
    const dropZone = useDroppable({id: `row-${v.task.ID}`, data: {kind: 'row', id: v.task.ID}});
    const rowRef = (el: HTMLElement | null) => {
        drag.setNodeRef(el);
        dropZone.setNodeRef(el);
    };
    const dropPos = ctx.drop?.kind === 'row' && ctx.drop.id === v.task.ID ? ctx.drop.pos : null;
    const isSource = ctx.dragID === v.task.ID;
    // 拖到收起的分组中间停一会儿自动展开
    useEffect(() => {
        if (dropPos !== 'inside' || open) return;
        const t = window.setTimeout(() => setOpen(true), 500);
        return () => window.clearTimeout(t);
    }, [dropPos, open, setOpen]);
    const waiting = scope.length > 0 && scope.every((l) => !l.active);
    const hidden = ctx.hideDone && checkValue(v.leaves) === 'on';
    const agg = v.folder ? aggregate(scope) : null;
    // 未勾的叶子所在节奏逾期时，勾选框描红
    const overdue = !v.folder && !v.checked && v.owner.view.phase === 'overdue';
    const cls = [
        'rt-row', `rt-row-${cv}`,
        v.folder ? 'rt-row-folder' : '',
        v.optional ? 'rt-row-optional' : '',
        v.temp ? 'rt-row-temp' : '',
        waiting ? 'rt-row-waiting' : '',
        overdue ? 'rt-row-overdue' : '',
        dropPos ? `rt-drop-${dropPos}` : '',
    ].filter(Boolean).join(' ');
    const stop = (fn: () => void) => (e: React.MouseEvent) => {
        e.stopPropagation();
        fn();
    };

    return <Collapse open={!hidden || isSource}>
        <div className={`rt-node${isSource ? ' rt-drag-src' : ''}`}>
            <div ref={rowRef} className={cls}
                 onClick={() => container ? setOpen(!open) : scope.length ? ctx.onToggle(scope) : ctx.onEdit(v.task.ID)}>
                {/* 把手和右侧按钮都占满整行高度，点偏也不会误勾 */}
                <span className="rt-zone rt-handle" {...drag.attributes} {...drag.listeners} onClick={(e) => e.stopPropagation()}
                      title="拖动排序，拖到分组中间可放进分组">
                    <HolderOutlined/>
                </span>
                {container
                    ? <span className="rt-check-spacer" style={{width: 22}}/>
                    : <RoutineCheck value={cv} optional={v.optional} disabled={waiting}/>}
                <div className="rt-row-main">
                    <div className="rt-row-line">
                        <span className="rt-row-title">{v.task.Title}</span>
                        <span className="rt-row-tags">
                            {v.node.Temp && <span className="rt-tag rt-tag-temp">本次</span>}
                            {v.node.Optional && <span className="rt-tag">可选</span>}
                            {(v.ownsRhythm || v.folder) &&
                                <LayerRhythm own={v.ownsRhythm} rule={v.rule} view={v.owner.view} onEdit={() => ctx.onEdit(v.task.ID)}/>}
                            {agg && v.leaves.length > 0 && <LayerCount agg={agg} waiting={waiting} others={others} small/>}
                            {v.folder && v.leaves.length === 0 && <span className="rt-row-sub">空分组</span>}
                        </span>
                    </div>
                    {v.task.Note && <Note text={v.task.Note}/>}
                </div>
                {v.folder && v.children.length > 0 &&
                    <span className="rt-zone rt-zone-caret" onClick={stop(() => setOpen(!open))} title={open ? '收起' : '展开'}>
                        <span className={`rt-caret${open ? ' rt-caret-open' : ''}`}/>
                    </span>}
                <span className="rt-zone rt-zone-more" onClick={stop(() => ctx.onEdit(v.task.ID))} title="编辑">
                    <MoreOutlined/>
                </span>
            </div>
            {v.folder &&
                <Collapse open={open}>
                    <div className="rt-children">
                        <RowList nodes={v.children} ctx={ctx}/>
                        <Adders sgID={v.sgID} parentID={v.task.ID} ctx={ctx} compact/>
                    </div>
                </Collapse>}
        </div>
    </Collapse>
}

/** 一层的节奏：自己设的显示规则和状态；跟随上级的只用淡色小字写出规则。 */
function LayerRhythm(props: { own: boolean, rule: RoutineRule, view: RoundView, onEdit: () => void }) {
    if (props.own) return <RhythmChip rule={props.rule} view={props.view} size="sm" onClick={props.onEdit}/>;
    return <span className="rt-rhythm-inherit" title="跟随上级，点击可单独设置" onClick={(e) => {
        e.stopPropagation();
        props.onEdit();
    }}>
        <RuleIcon rule={props.rule}/>{describeRule(props.rule)}
    </span>
}

/** 一层的完成比例：只算跟随这一层节奏的事项；有各自节奏的子项另外注明。 */
function LayerCount(props: { agg: Agg, waiting: boolean, others: number, small?: boolean }) {
    const {agg} = props;
    const cls = props.small ? 'rt-row-sub' : 'rt-card-count';
    if (agg.total === 0 && agg.waiting === 0) return props.others ? <span className={cls}>{props.others} 项各自节奏</span> : null;
    return <span className={cls}>
        {!props.waiting && `${agg.done}/${agg.total}`}
        {props.others > 0 && <span className="rt-count-others">{props.waiting ? '' : ' · '}另有 {props.others} 项各自节奏</span>}
    </span>
}

/** 备注：默认单行，点击展开。 */
function Note(props: { text: string, className?: string }) {
    const [open, setOpen] = useState(false);
    return <div className={`rt-note${open ? ' rt-note-open' : ''} ${props.className ?? ''}`}
                onClick={(e) => {
                    e.stopPropagation();
                    setOpen(!open);
                }}>
        {props.text}
    </div>
}

function Adders(props: { sgID: number, parentID: number, ctx: RowCtx, compact?: boolean }) {
    const [adding, setAdding] = useState<null | 'item' | 'folder' | 'temp'>(null);
    if (adding) {
        return <InlineAdder
            temp={adding === 'temp'}
            placeholder={adding === 'folder' ? '分组名称，回车创建' : adding === 'temp' ? '这次额外要带/要做的，回车添加' : '事项名称，回车添加'}
            keepOpen={adding !== 'folder'}
            onSubmit={async (t) => {
                await props.ctx.onCreate(props.sgID, props.parentID, t, {temp: adding === 'temp', folder: adding === 'folder'});
                if (adding === 'folder') setAdding(null);
            }}
            onCancel={() => setAdding(null)}
        />;
    }
    return <div className={`rt-adders${props.compact ? ' rt-adders-compact' : ''}`}>
        <button className="rt-adder" onClick={() => setAdding('item')}><PlusOutlined/> 事项</button>
        <button className="rt-adder" onClick={() => setAdding('folder')}><PlusOutlined/> 分组</button>
        <button className="rt-adder rt-adder-temp" onClick={() => setAdding('temp')}><PlusOutlined/> 本次补充</button>
    </div>
}

// ---------------- 重置 ----------------

function ResetDialog(props: {
    target: ResetTarget | null
    model: Model
    rootStyle: React.CSSProperties
    onClose: () => void
    onConfirm: (keep: Set<number>) => void
}) {
    const [keep, setKeep] = useState<Set<number>>(() => new Set());
    useEffect(() => setKeep(new Set()), [props.target]);
    const info = props.target ? resettable(props.model, props.target.leaves) : {checked: 0, temps: []};
    const toggleKeep = (id: number, on: boolean) => setKeep((prev) => {
        const next = new Set(prev);
        if (on) next.add(id);
        else next.delete(id);
        return next;
    });
    const removing = info.temps.length - keep.size;
    const parts = [
        info.checked > 0 ? `清空 ${info.checked} 项勾选` : '',
        removing > 0 ? `移除 ${removing} 个本次补充` : '',
        keep.size > 0 ? `${keep.size} 个本次补充转为常驻` : '',
    ].filter(Boolean);
    const hasPeriodic = !!props.target?.leaves.some((l) => l.rule.kind !== 'manual');
    return <Modal
        open={!!props.target}
        title={`清空重来「${props.target?.title ?? ''}」`}
        okText="重置"
        cancelText="取消"
        onOk={() => props.onConfirm(keep)}
        onCancel={props.onClose}
        styles={{content: props.rootStyle}}
        className="rt-reset"
        destroyOnClose
    >
        <div className="rt-reset-sum">
            {parts.length ? parts.join('，') + '。' : '没有需要处理的内容。'}
            {hasPeriodic && <span>按日期刷新的事项不受影响。</span>}
        </div>
        {info.temps.length > 0 && <div className="rt-reset-list">
            <div className="rt-reset-head">本次补充 · 想以后每次都有，就打开「留下」</div>
            {info.temps.map((t) => <label key={t.task.ID} className={`rt-reset-item${keep.has(t.task.ID) ? ' rt-reset-item-keep' : ''}`}>
                <span className="rt-reset-title">{t.task.Title}{t.children.length ? ` 等 ${t.leaves.length} 项` : ''}</span>
                <span className="rt-reset-opt">
                    {keep.has(t.task.ID) ? '留下' : '移除'}
                    <Switch size="small" checked={keep.has(t.task.ID)} onChange={(on) => toggleKeep(t.task.ID, on)}/>
                </span>
            </label>)}
        </div>}
    </Modal>
}

// ---------------- 复核 ----------------

function ReviewSheet(props: {
    open: boolean
    onClose: () => void
    model: Model
    agg: Agg
    onToggle: (leaves: VNode[]) => void
    isMobile: boolean
    rootStyle: React.CSSProperties
}) {
    const {model, agg} = props;
    const active = model.leaves.filter((l) => l.active);
    const unchecked = active.filter((l) => !l.checked);
    const required = unchecked.filter((l) => !l.optional && !l.temp);
    const temps = active.filter((l) => l.temp);
    const optional = unchecked.filter((l) => l.optional && !l.temp);
    const tempLeft = temps.filter((t) => !t.checked).length;
    const ok = active.length > 0 && required.length === 0 && tempLeft === 0;
    const pathOf = (l: VNode) => {
        const sg = model.sgs.find((s) => s.sg.ID === l.sgID)?.sg.Title ?? '';
        const names: string[] = [];
        let p = model.byTask.get(l.task.ParentID);
        while (p) {
            names.unshift(p.task.Title);
            p = model.byTask.get(p.task.ParentID);
        }
        return [sg, ...names].join(' / ');
    };

    const block = (title: string, cls: string, list: VNode[]) => list.length ?
        <div className={`rt-review-block ${cls}`}>
            <div className="rt-review-head">{title}<span>{list.length}</span></div>
            {list.map((l) => <div key={l.task.ID} className={`rt-review-item${l.checked ? ' rt-review-item-on' : ''}`}
                                  onClick={() => props.onToggle([l])}>
                <RoutineCheck value={l.checked ? 'on' : 'off'} size={20} optional={l.optional}/>
                <div className="rt-review-main">
                    <span className="rt-review-title">{l.task.Title}</span>
                    <span className="rt-review-sg">{pathOf(l)}</span>
                </div>
                {!l.checked && (l.owner.view.phase === 'overdue' || l.owner.view.phase === 'today') &&
                    <span className={`rt-stat rt-stat-${l.owner.view.phase}`}>{l.owner.view.label}</span>}
            </div>)}
        </div> : null;

    const parts = [];
    if (required.length) parts.push(`${required.length} 个必选项`);
    if (tempLeft) parts.push(`${tempLeft} 个本次补充`);
    const empty = active.length === 0;

    return <Drawer open={props.open} onClose={props.onClose} placement={props.isMobile ? 'bottom' : 'right'}
                   height={props.isMobile ? '85%' : undefined} width={props.isMobile ? undefined : 420}
                   title="复核" className="rt-drawer" rootStyle={props.rootStyle}>
        <div className="rt-review-hero">
            <ProgressRing done={agg.done} total={agg.total} size={56}>
                {ok ? <CheckCircleFilled className="rt-ring-ok"/> : <span className="rt-ring-num">{agg.done}</span>}
            </ProgressRing>
            <div>
                <b>{empty ? '现在没有要做的' : ok ? '必选项和本次补充都齐了' : `还差 ${parts.join('、') || '一些可选项'}`}</b>
                <span>{empty
                    ? (agg.nextStart ? `${shortDate(agg.nextStart)} 第一次刷新` : '')
                    : ok ? '可以放心出发 / 收工了' : '下面的清单可以直接勾选'}</span>
            </div>
        </div>
        {block('未完成的必选项', 'rt-review-req', required)}
        {block('本次补充', 'rt-review-temp', temps)}
        {block('未完成的可选项', 'rt-review-opt', optional)}
    </Drawer>
}

// ---------------- 编辑 ----------------

function TaskEditor(props: {
    v: VNode
    onSave: (patch: Partial<PTask>) => Promise<void>
    onOptional: (optional: boolean) => void
    onMakePermanent: () => void
    onRule: (rule: RoutineRule | null) => void
    onAdd: (title: string, folder: boolean) => Promise<void>
    onDelete: () => void
}) {
    const {v} = props;
    const [adding, setAdding] = useState<null | 'item' | 'folder'>(null);
    return <>
        <Section title="名称"><TextField value={v.task.Title} onSave={(t) => props.onSave({Title: t})}/></Section>
        <Section title="备注">
            <TextField value={v.task.Note} multiline allowEmpty placeholder="操作说明、注意事项…" onSave={(t) => props.onSave({Note: t})}/>
        </Section>
        <Section title="类型" hint={v.optional && !v.node.Optional ? '上级是可选的，这里也按可选处理' : '可选项不影响“这一期是否做完”'}>
            <Segmented block value={v.node.Optional ? 'opt' : 'req'} onChange={(k) => props.onOptional(k === 'opt')}
                       options={[{label: '必选', value: 'req'}, {label: '可选', value: 'opt'}]}/>
        </Section>
        {v.temp
            ? <Section title="本次补充" hint="跟随上级的节奏；清空重来时可以选择留下或移除">
                {v.node.Temp ? <Button block onClick={props.onMakePermanent}>转为常驻</Button> : <div className="rt-section-hint">随上级一起处理</div>}
            </Section>
            : <Section title="刷新节奏" hint={v.folder ? '里面没有单独设置节奏的事项都跟随这里' : '单独设置后，这一项按自己的节奏刷新，不受上级影响'}>
                <RuleEditor value={v.ownRule} inherited={v.inheritedRule} onApply={props.onRule}/>
            </Section>}
        <Section title={v.folder ? '添加到分组' : '拆分'} hint={v.folder ? undefined : '添加子项后，这一项会变成分组，可以整组勾选'}>
            {adding
                ? <InlineAdder placeholder={adding === 'folder' ? '分组名称，回车创建' : '事项名称，回车添加'}
                               keepOpen={adding === 'item'}
                               onSubmit={async (t) => {
                                   await props.onAdd(t, adding === 'folder');
                                   if (adding === 'folder') setAdding(null);
                               }}
                               onCancel={() => setAdding(null)}/>
                : <div className="rt-editor-adds">
                    <Button icon={<PlusOutlined/>} onClick={() => setAdding('item')}>事项</Button>
                    <Button icon={<PlusOutlined/>} onClick={() => setAdding('folder')}>分组</Button>
                </div>}
        </Section>
        <div className="rt-danger">
            <Popconfirm title={`删除这个${v.folder ? '分组' : '事项'}？`} description={v.children.length ? '里面的内容会一起删除' : undefined}
                        okText="删除" okButtonProps={{danger: true}} cancelText="取消" onConfirm={props.onDelete}>
                <Button danger type="text" icon={<DeleteOutlined/>}>删除</Button>
            </Popconfirm>
        </div>
    </>
}

// ---------------- 小组件 ----------------

function Section(props: { title: string, hint?: string, children: React.ReactNode }) {
    return <div className="rt-section">
        <div className="rt-section-title">{props.title}</div>
        {props.children}
        {props.hint && <div className="rt-section-hint">{props.hint}</div>}
    </div>
}

function TextField(props: {
    value: string
    onSave: (v: string) => Promise<void> | void
    multiline?: boolean
    allowEmpty?: boolean
    placeholder?: string
}) {
    const [v, setV] = useState(props.value);
    useEffect(() => setV(props.value), [props.value]);
    const save = () => {
        const t = props.multiline ? v.replace(/\s+$/, '') : v.trim();
        if ((t || props.allowEmpty) && t !== props.value) props.onSave(t);
        else setV(props.value);
    };
    if (props.multiline) {
        return <Input.TextArea value={v} placeholder={props.placeholder} autoSize={{minRows: 2, maxRows: 8}}
                               onChange={(e) => setV(e.target.value)} onBlur={save}/>
    }
    return <Input value={v} placeholder={props.placeholder} onChange={(e) => setV(e.target.value)} onBlur={save}
                  onPressEnter={(e) => (e.target as HTMLInputElement).blur()}/>
}

function InlineAdder(props: {
    placeholder: string
    temp?: boolean
    keepOpen?: boolean
    onSubmit: (title: string) => Promise<void>
    onCancel: () => void
}) {
    const [v, setV] = useState('');
    const [busy, setBusy] = useState(false);
    const ref = useRef<InputRef>(null);
    useEffect(() => {
        ref.current?.focus();
    }, []);
    const submit = async () => {
        const t = v.trim();
        if (!t || busy) return;
        setBusy(true);
        await props.onSubmit(t);
        setBusy(false);
        setV('');
        if (props.keepOpen) ref.current?.focus();
    };
    return <div className={`rt-inline-adder${props.temp ? ' rt-inline-adder-temp' : ''}`} onClick={(e) => e.stopPropagation()}>
        <Input
            ref={ref}
            value={v}
            placeholder={props.placeholder}
            onChange={(e) => setV(e.target.value)}
            onPressEnter={submit}
            onKeyDown={(e) => e.key === 'Escape' && props.onCancel()}
            onBlur={() => !v.trim() && !busy && props.onCancel()}
            variant="borderless"
        />
        <Button type="text" size="small" onMouseDown={(e) => e.preventDefault()} onClick={submit} loading={busy}>添加</Button>
    </div>
}

/** 高度动画折叠（grid 0fr ↔ 1fr）。 */
function Collapse(props: { open: boolean, children: React.ReactNode }) {
    return <div className={`rt-collapse${props.open ? ' rt-collapse-open' : ''}`} aria-hidden={!props.open}>
        <div className="rt-collapse-inner">{props.children}</div>
    </div>
}
