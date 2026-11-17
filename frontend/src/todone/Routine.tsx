import {useCallback, useEffect, useMemo, useRef, useState} from "react";
import {Button, Drawer, Dropdown, Empty, Input, InputRef, message, Modal, Popconfirm, Segmented, Spin, Switch, theme, Tooltip} from "antd";
import {CheckCircleFilled, DeleteOutlined, EditOutlined, EyeInvisibleOutlined, EyeOutlined, HolderOutlined, MoreOutlined, PauseCircleOutlined, PlayCircleOutlined, PlusOutlined, RedoOutlined, SettingOutlined, UnorderedListOutlined} from "@ant-design/icons";
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
import {describeRule, MANUAL_RULE, parseRule, RoundView, RoutineRule, shortDate, stringifyRule, todayStr} from "./routineRule";
import {CheckValue, ProgressRing, RhythmChip, RoutineCheck, RuleEditor, RuleIcon} from "./RoutineParts";
import {useIsMobile} from "../common/hooksv2";
import {aggregate, Agg, buildModel, defaultNode, leafState, Model, nodeKey, Owner, restDate, resumeNodes, SgModel, toggleLeaves, VNode, withOwnerSync} from "./routineModel";
import "./Routine.css";

// ---------------- 工具 ----------------

type Cb<Ret> = (ret: { data: Ret, ok: boolean }) => void;

function call<Req, Ret>(fn: (req: Req, cb: Cb<Ret>) => void, req: Req): Promise<{ data: Ret, ok: boolean }> {
    return new Promise((resolve) => fn(req, resolve));
}


/**
 * 卡片、分组的展开状态。还没开始的默认收起，这次手动展开的只在本次页面里有效，
 * 不写进本地记忆；开始之后回到平时记住的展开状态。
 */
function useFold(key: string, idle: boolean, ver: number): [boolean, (v: boolean) => void] {
    const [saved, setSaved] = useLocalFlag(key, true);
    // 记下是哪一次整理时展开的；重新整理后（比如跨天回到页面）又回到默认收起
    const [peek, setPeek] = useState({ver: -1, open: false});
    const setPeekOpen = useCallback((open: boolean) => setPeek({ver, open}), [ver]);
    return idle ? [peek.ver === ver && peek.open, setPeekOpen] : [saved, setSaved];
}

/**
 * 一次“整理”的结果：打开页面、或者跨天后回到页面时按当时的状态算一次，之后保持不变。
 * 这样当场勾选、取消不会让事项跳来跳去，分组勾完最后一项也不会突然收起。
 */
interface Arrangement {
    ver: number
    rest: Set<number> // 收进“暂不用做”的叶子
    idle: Set<string> // 没有要做的、也没有今天做完的卡片（s+ID）和分组（t+ID），默认收起
}

const EMPTY_ARRANGEMENT: Arrangement = {ver: 0, rest: new Set(), idle: new Set()};

function arrange(model: Model, today: string, ver: number): Arrangement {
    const rest = new Set<number>();
    const idle = new Set<string>();
    model.leaves.forEach((l) => {
        if (leafState(l, today) === 'rest') rest.add(l.task.ID);
    });
    const isIdle = (leaves: VNode[]) => leaves.length > 0 && leaves.every((l) => rest.has(l.task.ID));
    model.sgs.forEach((sg) => {
        if (isIdle(sg.leaves)) idle.add(`s${sg.sg.ID}`);
    });
    model.byTask.forEach((v) => {
        if (v.folder && isIdle(v.leaves)) idle.add(`t${v.task.ID}`);
    });
    return {ver, rest, idle};
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
    if (String(args.active.id).startsWith('sgdrag-')) {
        const card = hits.find((h) => String(h.id).startsWith('card-'));
        return card ? [card] : [];
    }
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
    // 每次需要重新整理时加一，和新数据在同一次渲染里生效
    const [arrangeVer, setArrangeVer] = useState(0);
    const arrangedDay = useRef('');
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

    const loadAll = useCallback(async (rearrange = true) => {
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
        const day = todayStr();
        setToday(day);
        setSubGroups(sgs);
        setTasks(nextTasks);
        setNodes(nextNodes);
        setLoading(false);
        if (rearrange) {
            arrangedDay.current = day;
            setArrangeVer((v) => v + 1);
        }
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
    // 只在 arrangeVer 变化时重新整理，数据变化（勾选、增删）不触发
    const arrangement = useMemo(() => arrangeVer ? arrange(model, today, arrangeVer) : EMPTY_ARRANGEMENT,
        [arrangeVer]); // eslint-disable-line react-hooks/exhaustive-deps

    // ---------- 写入 ----------

    // 界面先变、请求后台发。track 记下还在路上的请求：超过 400ms 没回来才显示“保存中…”，
    // 还有没存完的就关页面时让浏览器拦一下。
    const pendingRef = useRef(0);
    const [pending, setPending] = useState(0);
    const [slowSaving, setSlowSaving] = useState(false);
    const track = useCallback(<T, >(p: Promise<T>): Promise<T> => {
        pendingRef.current++;
        setPending(pendingRef.current);
        return p.finally(() => {
            pendingRef.current--;
            setPending(pendingRef.current);
        });
    }, []);
    useEffect(() => {
        if (!pending) {
            setSlowSaving(false);
            return;
        }
        const t = window.setTimeout(() => setSlowSaving(true), 400);
        const guard = (e: BeforeUnloadEvent) => e.preventDefault();
        window.addEventListener('beforeunload', guard);
        return () => {
            window.clearTimeout(t);
            window.removeEventListener('beforeunload', guard);
        };
    }, [pending > 0]); // eslint-disable-line react-hooks/exhaustive-deps

    // 回到前台（切回标签、解锁手机）时重新拉数据，别的设备上的改动也能同步过来；
    // 跨了一天就按刚打开页面那样重新整理。还有没存完的改动时先不拉，免得被旧数据盖掉。
    useEffect(() => {
        const onVisible = () => {
            if (document.visibilityState !== 'visible') return;
            setToday(todayStr());
            if (pendingRef.current > 0) return;
            loadAll(todayStr() !== arrangedDay.current).then();
        };
        document.addEventListener('visibilitychange', onVisible);
        return () => document.removeEventListener('visibilitychange', onVisible);
    }, [loadAll]);

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
        const ret = await track(sendSaveRoutine({UserID: userID, DirID: dirID, GroupID: groupID, Nodes: changed, DelTasks: delTasks}));
        if (!ret.ok) {
            message.error('保存失败，已恢复');
            setNodes(before);
            if (delTasks.length) loadAll().then();
        }
        return ret.ok;
    }, [userID, dirID, groupID, loadAll, track]);

    const syncOwners = (changed: PRoutineNode[], drop: Set<number> = new Set()): PRoutineNode[] =>
        withOwnerSync(groupID, subGroups, tasks, nodesRef.current, changed, today, drop);

    /** 勾选/取消一组叶子。未开始的节奏不能勾。 */
    const toggle = (leaves: VNode[]) => {
        const ret = toggleLeaves(leaves, today);
        if (!ret.changed) {
            message.info(ret.waitingStart ? `${shortDate(ret.waitingStart)} 才开始` : '还没开始');
            return;
        }
        commit(syncOwners(ret.changed)).then();
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
        commit(syncOwners(list, drop), delTasks).then((ok) => ok && message.success('已重置'));
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
        commit(syncOwners([next])).then((ok) => ok && message.success('节奏已更新'));
    };

    /** 停用或恢复一张卡片、一个事项（连同下面的子项）。 */
    const setPaused = (node: PRoutineNode, paused: boolean) => {
        const changed = paused ? [{...node, Paused: true}] : resumeNodes(groupID, subGroups, tasks, nodesRef.current, node, today);
        commit(syncOwners(changed)).then((ok) => ok && message.success(paused ? '已停用' : '已恢复'));
    };

    // ---------- 拖动：同层排序、跨层级、拖进分组、跨卡片 ----------

    const [dragID, setDragID] = useState<number | null>(null);
    const [drop, setDrop] = useState<DropTarget | null>(null);
    const [moving, setMoving] = useState(false);
    // 拖顶层卡片：被拖的子分组 ID，和插到哪张卡片的前/后
    const [dragCard, setDragCard] = useState<number | null>(null);
    const [cardDrop, setCardDrop] = useState<CardDrop | null>(null);
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

    const computeCardDrop = (e: DragMoveEvent | DragEndEvent): CardDrop | null => {
        const d = e.over?.data.current as { kind: string, id: number } | undefined;
        if (!e.over || d?.kind !== 'card') return null;
        const rel = (pointerY(e) - e.over.rect.top) / Math.max(1, e.over.rect.height);
        return {id: d.id, after: rel >= 0.5};
    };

    const onCardDragEnd = (e: DragEndEvent) => {
        const target = computeCardDrop(e);
        const src = dragCard;
        setDragCard(null);
        setCardDrop(null);
        if (!src || !target || target.id === src) return;
        const ids = subGroups.map((sg) => sg.ID).filter((id) => id !== src);
        const at = ids.indexOf(target.id) + (target.after ? 1 : 0);
        ids.splice(at, 0, src);
        if (ids.every((id, i) => subGroups[i].ID === id)) return;
        // 整体重新编号 1..n，只发生变化的卡片
        const byID = new Map(subGroups.map((sg) => [sg.ID, sg]));
        const next = ids.map((id, i) => ({...byID.get(id)!, Index: i + 1}));
        const changed = next.filter((sg) => byID.get(sg.ID)!.Index !== sg.Index);
        setSubGroups(next);
        track(Promise.all(changed.map((sg) => call(sendChangeSubGroup, {UserID: userID, ParentDirID: dirID, GroupID: groupID, Data: sg}))))
            .then((rets) => {
                if (rets.every((r) => r.ok)) return;
                message.error('排序保存失败，已恢复');
                loadAll().then();
            });
    };

    const onDragMove = (e: DragMoveEvent) => {
        if (dragCard) {
            const next = computeCardDrop(e);
            setCardDrop((prev) => prev?.id === next?.id && prev?.after === next?.after ? prev : next);
            return;
        }
        const next = computeDrop(e);
        setDrop((prev) => sameDrop(prev, next) ? prev : next);
    };

    const onDragEnd = (e: DragEndEvent) => {
        if (dragCard) {
            setPointerTracking(false);
            onCardDragEnd(e);
            return;
        }
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
        dragCard,
        cardDrop,
        arrangement,
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
    // 清单没设过节奏时默认是手动，这时不显示“手动重置”，免得像是设过什么
    const groupHasRhythm = model.groupRule.kind !== 'manual' || !!parseRule(model.groupNode.Rule);

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
                    {groupHasRhythm &&
                        <RhythmChip rule={model.groupRule} view={model.groupOwner.view} onClick={() => setEditor({type: 'group'})}/>}
                    {total.overdue > 0 && <span className="rt-stat rt-stat-overdue">{total.overdue} 项逾期</span>}
                    {total.today > 0 && <span className="rt-stat rt-stat-today">{total.today} 项今天</span>}
                    {total.total > 0 && total.reqTotal < total.total &&
                        <span className="rt-hero-meta">必选 {total.reqDone}/{total.reqTotal}</span>}
                </div>
                {resting && <div className="rt-hero-rest">还没开始 · {total.nextStart ? shortDate(total.nextStart) : '—'} 第一次刷新</div>}
            </div>
            <div className="rt-hero-actions">
                {(loading || moving) && <Spin size="small"/>}
                {slowSaving && !loading && !moving && <span className="rt-saving"><Spin size="small"/> 保存中…</span>}
                <Tooltip title={hideDone ? '显示已完成' : '隐藏已完成'}>
                    <Button type="text" icon={hideDone ? <EyeInvisibleOutlined/> : <EyeOutlined/>}
                            onClick={() => setHideDone(!hideDone)}/>
                </Tooltip>
                <Tooltip title="复核">
                    <Button type="text" icon={<UnorderedListOutlined/>} onClick={() => setReviewOpen(true)}/>
                </Tooltip>
                {groupReset.any &&
                    <Tooltip title="清空重来">
                        <Button type="text" icon={<RedoOutlined/>}
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
                const data = e.active.data.current as { id?: number, cardID?: number };
                if (data.cardID) setDragCard(data.cardID);
                else setDragID(data.id ?? null);
            }}
            onDragMove={onDragMove}
            onDragEnd={onDragEnd}
            onDragCancel={() => {
                setPointerTracking(false);
                setDragID(null);
                setDrop(null);
                setDragCard(null);
                setCardDrop(null);
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
                onPause={(paused) => setPaused(sgm.node, paused)}
                onDelete={async () => {
                    const ret = await call(sendDelSubGroup, {UserID: userID, ParentDirID: dirID, GroupID: groupID, SubGroupID: sgm.sg.ID});
                    if (ret.ok) setSubGroups((prev) => prev.filter((s) => s.ID !== sgm.sg.ID));
                    else message.error('删除失败');
                }}
            />)}
            {/* 拖动浮层：不受任何折叠容器裁剪 */}
            <DragOverlay dropAnimation={null}>
                {dragCard && <div className="rt-overlay rt-overlay-card">
                    <HolderOutlined className="rt-overlay-handle"/>
                    <span className="rt-overlay-title">{subGroups.find((sg) => sg.ID === dragCard)?.Title}</span>
                </div>}
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
                <Section title="刷新节奏">
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
                    onOptional={(optional) => commit(syncOwners([{...editorNode.node, Optional: optional}]))}
                    onMakePermanent={() => commit([{...editorNode.node, Temp: false}]).then()}
                    onRule={(r) => applyRule(editor, r)}
                    onPause={(paused) => setPaused(editorNode.node, paused)}
                    onAdd={(title, folder) => createItem(editorNode.sgID, editorNode.task.ID, title, {folder, temp: false})}
                    onDelete={() => {
                        const ids = collectSubtree(editorNode);
                        commit(syncOwners([], new Set(ids)), [{SubGroupID: editorNode.sgID, TaskIDs: ids}]).then();
                        setEditor(null);
                    }}
                />}
        </Drawer>
    </div>
}

// ---------------- 顶层分组卡片 ----------------

interface CardDrop {
    id: number // 目标子分组
    after: boolean
}

interface RowCtx {
    arrangement: Arrangement
    hideDone: boolean
    dragID: number | null
    drop: DropTarget | null
    dragCard: number | null
    cardDrop: CardDrop | null
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
    onPause: (paused: boolean) => void
    onDelete: () => void
}) {
    const {sgm} = props;
    const arr = props.ctx.arrangement;
    // 停用的卡片和“没有要做的”一样默认收起
    const [open, setOpen] = useFold(`todone:routine:sgOpen:${sgm.sg.ID}`, sgm.paused || arr.idle.has(`s${sgm.sg.ID}`), arr.ver);
    const scope = ownScope(sgm.leaves, sgm.owner);
    const others = sgm.leaves.filter((l) => l.owner !== sgm.owner);
    const agg = aggregate(scope);
    const overdue = aggregate(sgm.leaves).overdue; // 红点统计整块，方便扫出哪块有问题
    const cv = checkValue(scope);
    const container = scope.length === 0 && others.length > 0;
    const waiting = agg.total === 0 && agg.waiting > 0;
    const allDone = checkValue(sgm.leaves) === 'on';
    const reset = resettable(props.model, sgm.leaves);
    const {setNodeRef} = useDroppable({id: `card-${sgm.sg.ID}`, data: {kind: 'card', id: sgm.sg.ID}});
    const cardDrag = useDraggable({id: `sgdrag-${sgm.sg.ID}`, data: {cardID: sgm.sg.ID}});
    const cardDropPos = props.ctx.cardDrop?.id === sgm.sg.ID && props.ctx.dragCard !== sgm.sg.ID
        ? (props.ctx.cardDrop.after ? ' rt-card-drop-after' : ' rt-card-drop-before') : '';
    // 拖卡片排序时所有卡片收成一行，好对准
    const shown = open && !props.ctx.dragCard;
    const dropHere = props.ctx.drop?.kind === 'card' && props.ctx.drop.id === sgm.sg.ID;
    // 拖到收起的卡片上停一会儿自动展开
    useEffect(() => {
        if (!dropHere || open) return;
        const t = window.setTimeout(() => setOpen(true), 500);
        return () => window.clearTimeout(t);
    }, [dropHere, open, setOpen]);

    return <div ref={setNodeRef} data-todone-subgroup={sgm.sg.ID}
                className={`rt-card${allDone ? ' rt-card-done' : ''}${waiting ? ' rt-card-waiting' : ''}${sgm.paused ? ' rt-card-paused' : ''}${dropHere ? ' rt-drop-card' : ''}${cardDropPos}${props.ctx.dragCard === sgm.sg.ID ? ' rt-card-drag-src' : ''}`}>
        {/* 浮层尺寸取自 setNodeRef 的元素，所以挂在整个头部上，拖动手势只在把手上 */}
        <div className="rt-card-head" ref={cardDrag.setNodeRef}>
            <span className="rt-card-handle" {...cardDrag.attributes} {...cardDrag.listeners} title="拖动调整顺序">
                <HolderOutlined/>
            </span>
            {container
                ? <span className="rt-check-spacer" style={{width: 24}}/>
                : <RoutineCheck value={cv} size={24} disabled={waiting || sgm.paused} onClick={() => !sgm.paused && props.ctx.onToggle(scope)}/>}
            <div className="rt-card-title" onClick={() => setOpen(!open)}>
                <span className="rt-card-name">{sgm.sg.Title}</span>
                {sgm.paused
                    ? <span className="rt-tag">已停用</span>
                    : <LayerRhythm own={!!sgm.ownRule} rule={sgm.rule} view={sgm.owner.view} onEdit={props.onEdit}/>}
            </div>
            <div className="rt-card-meta" onClick={() => setOpen(!open)}>
                {overdue > 0 && <span className="rt-dot rt-dot-overdue">{overdue}</span>}
                <LayerCount agg={agg} waiting={waiting} others={others}/>
                <span className={`rt-caret${shown ? ' rt-caret-open' : ''}`}/>
            </div>
            <Dropdown
                trigger={['click']}
                menu={{
                    items: [
                        {key: 'edit', icon: <EditOutlined/>, label: '名称、备注与节奏'},
                        ...(reset.any ? [{key: 'reset', icon: <RedoOutlined/>, label: '清空重来'}] : []),
                        sgm.paused
                            ? {key: 'resume', icon: <PlayCircleOutlined/>, label: '恢复'}
                            : {key: 'pause', icon: <PauseCircleOutlined/>, label: '停用'},
                        {type: 'divider' as const},
                        {key: 'del', icon: <DeleteOutlined/>, label: '删除分组', danger: true},
                    ],
                    onClick: ({key}) => {
                        if (key === 'edit') props.onEdit();
                        if (key === 'reset') props.onReset();
                        if (key === 'pause') props.onPause(true);
                        if (key === 'resume') props.onPause(false);
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
        <Collapse open={shown}>
            <div className="rt-card-body">
                <RowList nodes={sgm.roots} ctx={props.ctx}/>
                {sgm.roots.length === 0 && <div className="rt-card-empty">还没有内容</div>}
                <Adders sgID={sgm.sg.ID} parentID={0} ctx={props.ctx}/>
            </div>
        </Collapse>
    </div>
}

// ---------------- 行 ----------------

/**
 * 一层的列表：暂不用做的事项收到最底下的一行里，点开才显示。
 * 停用的事项（自己被停用的那一层，叶子或分组都算）也收在同一行里，而且是当场收进去。
 */
function RowList(props: { nodes: VNode[], ctx: RowCtx }) {
    const rest = props.ctx.arrangement.rest;
    const inRest = (n: VNode) => !!n.node.Paused || rest.has(n.task.ID);
    const main = props.nodes.filter((n) => !inRest(n));
    const resting = props.nodes.filter(inRest);
    if (props.nodes.length === 0) return null;
    return <div className="rt-rows">
        {main.map((n) => <Row key={n.task.ID} v={n} ctx={props.ctx}/>)}
        {resting.length > 0 && <RestFold key={props.ctx.arrangement.ver} nodes={resting} ctx={props.ctx}/>}
    </div>
}

function RestFold(props: { nodes: VNode[], ctx: RowCtx }) {
    const [open, setOpen] = useState(false);
    const dates = props.nodes.filter((n) => !n.paused).map(restDate).filter(Boolean).sort();
    const paused = props.nodes.filter((n) => n.paused).length;
    return <>
        <div className="rt-rest" onClick={() => setOpen(!open)}>
            <span className={`rt-caret${open ? ' rt-caret-open' : ''}`}/>
            <span className="rt-rest-text">{paused === props.nodes.length
                ? `已停用 ${paused} 项`
                : <>暂不用做 {props.nodes.length} 项{dates.length > 0 && ` · 最早 ${shortDate(dates[0])}`}{paused > 0 && ` · 含停用 ${paused} 项`}</>}</span>
        </div>
        <Collapse open={open}>
            <div className="rt-rest-list">
                {props.nodes.map((n) => <Row key={n.task.ID} v={n} ctx={props.ctx}/>)}
            </div>
        </Collapse>
    </>
}

function Row(props: { v: VNode, ctx: RowCtx }) {
    const {v, ctx} = props;
    const scope = v.folder ? ownScope(v.leaves, v.owner) : [v];
    const others = v.leaves.filter((l) => l.owner !== v.owner);
    const container = v.folder && scope.length === 0 && others.length > 0;
    const cv = checkValue(scope);
    const arr = ctx.arrangement;
    const resting = arr.rest.has(v.task.ID);
    const [open, setOpen] = useFold(`todone:routine:taskOpen:${v.task.ID}`, v.paused || arr.idle.has(`t${v.task.ID}`), arr.ver);
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
    // “隐藏已完成”只管今天做完的和手动清单里勾过的；暂不用做的已经收在底下了
    const hidden = ctx.hideDone && !resting && checkValue(v.leaves) === 'on';
    const agg = v.folder ? aggregate(scope) : null;
    // 未勾的叶子所在节奏逾期时，勾选框描红
    const overdue = !v.folder && !v.paused && !v.checked && v.owner.view.phase === 'overdue';
    const cls = [
        'rt-row', `rt-row-${cv}`,
        v.folder ? 'rt-row-folder' : '',
        v.optional ? 'rt-row-optional' : '',
        v.temp ? 'rt-row-temp' : '',
        waiting ? 'rt-row-waiting' : '',
        v.paused ? 'rt-row-paused' : '',
        overdue ? 'rt-row-overdue' : '',
        dropPos ? `rt-drop-${dropPos}` : '',
    ].filter(Boolean).join(' ');
    const stop = (fn: () => void) => (e: React.MouseEvent) => {
        e.stopPropagation();
        fn();
    };

    return <Collapse open={!hidden || isSource}>
        <div className={`rt-node${isSource ? ' rt-drag-src' : ''}`}>
            <div ref={rowRef} className={cls} data-todone-task={v.task.ID}
                 onClick={() => v.paused ? (v.folder && v.children.length ? setOpen(!open) : ctx.onEdit(v.task.ID))
                     : container ? setOpen(!open) : scope.length ? ctx.onToggle(scope) : ctx.onEdit(v.task.ID)}>
                {/* 把手和右侧按钮都占满整行高度，点偏也不会误勾 */}
                <span className="rt-zone rt-handle" {...drag.attributes} {...drag.listeners} onClick={(e) => e.stopPropagation()}
                      title="拖动排序，拖到分组中间可放进分组">
                    <HolderOutlined/>
                </span>
                {container
                    ? <span className="rt-check-spacer" style={{width: 22}}/>
                    : <RoutineCheck value={cv} optional={v.optional} disabled={waiting || v.paused}/>}
                <div className="rt-row-main">
                    <div className="rt-row-line">
                        <span className="rt-row-title">{v.task.Title}</span>
                        <span className="rt-row-tags">
                            {v.node.Temp && <span className="rt-tag rt-tag-temp">本次</span>}
                            {v.node.Optional && <span className="rt-tag">可选</span>}
                            {v.node.Paused && <span className="rt-tag">已停用</span>}
                            {(v.ownsRhythm || v.folder) && !v.paused &&
                                <LayerRhythm own={v.ownsRhythm} rule={v.rule} view={v.owner.view} onEdit={() => ctx.onEdit(v.task.ID)}/>}
                            {agg && v.leaves.length > 0 && <LayerCount agg={agg} waiting={waiting} others={others} small/>}
                            {v.folder && v.leaves.length === 0 && !v.paused && <span className="rt-row-sub">空分组</span>}
                            {resting && !v.paused && !v.ownsRhythm && restDate(v) &&
                                <span className="rt-row-sub">{v.active ? `下次 ${shortDate(restDate(v))}` : `${shortDate(restDate(v))} 开始`}</span>}
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
    // 跟随来的“手动”没有任何信息量（清单默认就是手动），不显示
    if (props.rule.kind === 'manual') return null;
    return <span className="rt-rhythm-inherit" title="跟随上级，点击可单独设置" onClick={(e) => {
        e.stopPropagation();
        props.onEdit();
    }}>
        <RuleIcon rule={props.rule}/>{describeRule(props.rule)}
    </span>
}

/**
 * 一层的完成比例：只算跟随这一层节奏的事项。
 * 有自己节奏的子项（others）不进比例，只补一句它们现在的情况：几项待做，或者最近哪天刷新。
 */
function LayerCount(props: { agg: Agg, waiting: boolean, others: VNode[], small?: boolean }) {
    const {agg} = props;
    const cls = props.small ? 'rt-row-sub' : 'rt-card-count';
    const otherText = othersText(props.others, agg.total > 0 || agg.waiting > 0);
    if (agg.total === 0 && agg.waiting === 0) return otherText ? <span className={cls}>{otherText}</span> : null;
    return <span className={cls}>
        {!props.waiting && `${agg.done}/${agg.total}`}
        {otherText && <span className="rt-count-others">{props.waiting ? '' : ' · '}{otherText}</span>}
    </span>
}

/** extra：前面已经有本层的比例，这里是“另外”的部分，措辞要接得上。 */
function othersText(others: VNode[], extra: boolean): string {
    if (!others.length) return '';
    const pending = others.filter((l) => l.active && !l.checked).length;
    if (pending > 0) return extra ? `另有 ${pending} 项待做` : `${pending} 项待做`;
    // 都做完了或都没开始：给出最近一次刷新的日期
    let next = '';
    others.forEach((l) => {
        const d = l.active ? l.owner.round.next : l.owner.round.start;
        if (d && (!next || d < next)) next = d;
    });
    if (!next) return extra ? '' : `${others.length} 项`;
    return extra ? `其余 ${shortDate(next)} 刷新` : `最近 ${shortDate(next)} 刷新`;
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
    onPause: (paused: boolean) => void
    onDelete: () => void
}) {
    const {v} = props;
    const [adding, setAdding] = useState(false);
    return <>
        <Section title="名称"><TextField value={v.task.Title} onSave={(t) => props.onSave({Title: t})}/></Section>
        <Section title="备注">
            <TextField value={v.task.Note} multiline allowEmpty placeholder="操作说明、注意事项…" onSave={(t) => props.onSave({Note: t})}/>
        </Section>
        <Section title="类型" hint={v.optional && !v.node.Optional ? '上级是可选的，这里也按可选处理' : undefined}>
            <Segmented block value={v.node.Optional ? 'opt' : 'req'} onChange={(k) => props.onOptional(k === 'opt')}
                       options={[{label: '必选', value: 'req'}, {label: '可选', value: 'opt'}]}/>
        </Section>
        {v.temp
            ? <Section title="本次补充">
                {v.node.Temp ? <Button block onClick={props.onMakePermanent}>转为常驻</Button> : <div className="rt-section-hint">随上级一起处理</div>}
            </Section>
            : <Section title="刷新节奏">
                <RuleEditor value={v.ownRule} inherited={v.inheritedRule} onApply={props.onRule}/>
            </Section>}
        {/* 分组就是带子项的事项：给事项加子项，它就变成分组 */}
        <Section title="子项">
            {adding
                ? <InlineAdder placeholder="子项名称，回车添加" keepOpen
                               onSubmit={(t) => props.onAdd(t, false)}
                               onCancel={() => setAdding(false)}/>
                : <div className="rt-editor-adds">
                    <Button icon={<PlusOutlined/>} onClick={() => setAdding(true)}>添加子项</Button>
                </div>}
        </Section>
        <div className="rt-danger">
            {/* 停用：留着不删，但不用做、不算进度和逾期，收进“暂不用做”里。上级停用时这里跟着停，不能单独恢复 */}
            {v.node.Paused
                ? <Button type="text" icon={<PlayCircleOutlined/>} onClick={() => props.onPause(false)}>恢复</Button>
                : v.paused
                    ? <span className="rt-section-hint">上级已停用</span>
                    : <Button type="text" icon={<PauseCircleOutlined/>} onClick={() => props.onPause(true)}>停用</Button>}
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
