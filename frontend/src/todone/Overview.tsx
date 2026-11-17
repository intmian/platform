import {useCallback, useEffect, useMemo, useRef, useState} from "react";
import {Button, Dropdown, Empty, Input, message, Popover, Spin, theme, Tooltip} from "antd";
import {AimOutlined, DownOutlined, FlagFilled, MoreOutlined, PlusOutlined, ReloadOutlined, RightOutlined} from "@ant-design/icons";
import dayjs, {Dayjs} from "dayjs";
import {GroupType, PRoutineNode, PSubGroup, PTask, TaskType} from "./net/protocal";
import {
    GetOverviewRet,
    OverviewGroup,
    OverviewSubGroup,
    OverviewTask,
    sendGetOverview,
    sendSaveRoutine,
    sendSetGroupFavorite,
    sendSetTaskDone,
} from "./net/send_back";
import {aggregate, buildModel, Model, nodeKey, Owner, toggleLeaves, VNode, withOwnerSync} from "./routineModel";
import {DATE_FMT, roundView, shortDate, todayStr} from "./routineRule";
import {RoutineCheck} from "./RoutineParts";
import {IsDateEmptyFromGoEmpty} from "../common/tool";
import {LocateTarget} from "./locate";
import "./Routine.css";
import "./Overview.css";

/**
 * 关注页：只看收藏的清单（整个分组或其中一栏）。
 * - 上半部分从收藏里挑出带日期的事，分三栏：逾期、进行中、接下来。
 *   没设日期的任务（常开着的、持续进行的）不进上半部分，只在下面的收藏卡片里。
 * - 下半部分是收藏的每一项，列出全部未完成项，可以直接勾。
 * - 每一行右边的定位按钮跳到它在清单里的原位置。
 * 宽屏下像看板：上半部分三栏并排，收藏的每一项是一列、横向排开；窄屏都是单列往下排。
 * 数据一次请求拿全（getOverview），勾选先改界面再发请求，失败退回。
 */

const FLAG_TAG = "[system]flag";
const SOON_DAYS = 7;

type Bucket = 'overdue' | 'doing' | 'soon';
type Tone = 'error' | 'warning' | 'primary' | 'plain';

const BUCKETS: { key: Bucket, title: string }[] = [
    {key: 'overdue', title: '逾期'},
    {key: 'doing', title: '进行中'},
    {key: 'soon', title: `接下来 ${SOON_DAYS} 天`},
];

interface Timing {
    bucket: Bucket
    label: string
    tone: Tone
    sort: number // 同一组里越小越靠前
}

interface TaskItem {
    kind: 'task'
    key: string
    timing: Timing
    ot: OverviewTask
    group: OverviewGroup
}

interface RoutineItem {
    kind: 'routine'
    key: string
    timing: Timing
    title: string
    owner: Owner
    group: OverviewGroup
    subTitle: string // 节奏层所在的子分组（如果不是清单本身）
    target: LocateTarget // 跳到清单里的哪个位置
}

type FocusItem = TaskItem | RoutineItem;

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
function taskTiming(t: PTask, today: Dayjs): Timing | null {
    const begin = dateOf(t.BeginTime);
    const end = dateOf(t.EndTime);
    if (!begin && !end) return null;

    if (begin && begin.isAfter(today)) {
        const n = begin.diff(today, 'day');
        return n <= SOON_DAYS ? {bucket: 'soon', label: `${dayWord(begin, today)}开始`, tone: 'plain', sort: n} : null;
    }
    if (begin && !t.Started && begin.isBefore(today)) {
        const n = today.diff(begin, 'day');
        return {bucket: 'overdue', label: `该开始了 · 晚 ${n} 天`, tone: 'error', sort: -n};
    }
    if (end) {
        const n = end.diff(today, 'day');
        if (n < 0) return {bucket: 'overdue', label: `过期 ${-n} 天`, tone: 'error', sort: n};
        if (n === 0) return {bucket: 'doing', label: '今天截止', tone: 'warning', sort: 0};
        if (n <= SOON_DAYS) return {bucket: 'doing', label: `${dayWord(end, today)}截止`, tone: 'plain', sort: n};
        return {bucket: 'doing', label: `还剩 ${n} 天`, tone: 'plain', sort: n};
    }
    // 只设了开始日期、没有截止：排在有截止日期的后面
    if (begin!.isSame(today)) return {bucket: 'doing', label: '今天开始', tone: 'primary', sort: 1e5};
    return {bucket: 'doing', label: `${shortDate(begin!)} 起`, tone: 'plain', sort: 1e5 + today.diff(begin!, 'day')};
}

/** 例行清单的节奏层进哪一栏。手动节奏没有日期，只在收藏卡片里出现。 */
function ownerTiming(o: Owner, today: Dayjs): Timing | null {
    if (o.round.manual || o.ownLeaves.length === 0) return null;
    if (o.round.waiting) {
        if (!o.round.start) return null;
        const n = dayjs(o.round.start).diff(today, 'day');
        return n > 0 && n <= SOON_DAYS ? {bucket: 'soon', label: `${dayWord(dayjs(o.round.start), today)}开始`, tone: 'plain', sort: n} : null;
    }
    // 这次勾完的层按“没做完”时的状态归栏，免得一勾就跳到别的栏里
    const v = o.complete ? roundView(o.round, false, today.format(DATE_FMT)) : o.view;
    if (v.phase === 'overdue') return {bucket: 'overdue', label: v.label, tone: 'error', sort: -1};
    if (v.phase === 'today') return {bucket: 'doing', label: v.label, tone: 'warning', sort: 0};
    if (v.phase === 'grace') {
        const left = o.round.deadline ? dayjs(o.round.deadline).diff(today, 'day') : 99;
        return {bucket: 'doing', label: v.label, tone: 'plain', sort: left};
    }
    return null;
}

function groupPath(g: OverviewGroup): string {
    return [...(g.Path ?? []), g.Title].join(' / ');
}

/** 一个收藏项（一列）：整个分组，或者分组里的一个子分组。 */
interface FavItem {
    key: string
    group: OverviewGroup
    subGroup: OverviewSubGroup | null
}

/** 收藏入口里的一行。 */
interface FavCandidate {
    key: string
    group: OverviewGroup
    subGroup: OverviewSubGroup | null
    text: string // 用来搜索
}

// ---------------- 页面 ----------------

interface OverviewProps {
    userID: string
    onOpenGroup: (group: OverviewGroup, target?: LocateTarget) => void
}

interface RoutineData {
    group: OverviewGroup
    subGroups: PSubGroup[]
    tasks: Record<number, PTask[]>
}

export default function Overview(props: OverviewProps) {
    const {token} = theme.useToken();
    const {userID} = props;
    const [data, setData] = useState<GetOverviewRet | null>(null);
    const [loading, setLoading] = useState(false);
    const [today, setToday] = useState(todayStr());
    // 这次页面里勾过的项：做完了也先留在原处（划掉），方便手滑撤销，下次加载才消失
    const [touched, setTouched] = useState<Set<string>>(new Set());
    const [nodes, setNodes] = useState<Record<number, Record<string, PRoutineNode>>>({});
    const nodesRef = useRef(nodes);
    nodesRef.current = nodes;

    const load = useCallback(async (quiet = false) => {
        if (!userID) return;
        if (!quiet) setLoading(true);
        const ret = await sendGetOverview({UserID: userID});
        setLoading(false);
        if (!ret.ok) {
            if (!quiet) message.error('加载总视图失败');
            return;
        }
        const nextNodes: Record<number, Record<string, PRoutineNode>> = {};
        (ret.data.RoutineNodes ?? []).forEach((n) => {
            nextNodes[n.GroupID] = nextNodes[n.GroupID] ?? {};
            nextNodes[n.GroupID][nodeKey(n.Node.Kind, n.Node.NodeID)] = n.Node;
        });
        setData(ret.data);
        setNodes(nextNodes);
        setTouched(new Set());
    }, [userID]);

    useEffect(() => {
        load().then();
    }, [load]);

    // 切回页面时静默刷新；跨过零点时更新“今天”
    useEffect(() => {
        const onFocus = () => {
            setToday(todayStr());
            load(true).then();
        };
        const timer = window.setInterval(() => setToday(todayStr()), 60 * 1000);
        window.addEventListener('focus', onFocus);
        return () => {
            window.removeEventListener('focus', onFocus);
            window.clearInterval(timer);
        };
    }, [load]);

    const groups = useMemo(() => data?.Groups ?? [], [data]);
    const groupByID = useMemo(() => new Map(groups.map((g) => [g.GroupID, g])), [groups]);

    // 例行清单的原始数据（按清单分好），模型随 nodes / today 重算
    const routineData = useMemo(() => {
        const out = new Map<number, RoutineData>();
        groups.filter((g) => g.Type === GroupType.Routine).forEach((g) => out.set(g.GroupID, {group: g, subGroups: [], tasks: {}}));
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
    }, [groups, data]);

    const models = useMemo(() => {
        const out = new Map<number, Model>();
        routineData.forEach((rd, id) => out.set(id, buildModel(id, rd.subGroups, rd.tasks, nodes[id] ?? {}, today)));
        return out;
    }, [routineData, nodes, today]);

    // ---------- 上半部分 ----------

    // 收藏范围：整个收藏的分组，和单独收藏的栏（子分组）
    const favScope = useMemo(() => {
        const favs = data?.Favorites ?? [];
        return {
            groups: new Set(favs.filter((f) => f.SubGroupID === 0).map((f) => f.GroupID)),
            subGroups: new Set(favs.filter((f) => f.SubGroupID !== 0).map((f) => f.SubGroupID)),
        };
    }, [data]);

    const focus = useMemo(() => {
        const t0 = dayjs(today).startOf('day');
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
            const g = groupByID.get(gid)!;
            const rd = routineData.get(gid)!;
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
        const by: Record<Bucket, FocusItem[]> = {overdue: [], doing: [], soon: []};
        items.forEach((it) => by[it.timing.bucket].push(it));
        Object.values(by).forEach((list) => list.sort((a, b) => a.timing.sort - b.timing.sort));
        return by;
    }, [data, groupByID, models, routineData, favScope, touched, today]);

    // ---------- 写入 ----------

    const setTaskDone = async (ot: OverviewTask, done: boolean) => {
        const g = groupByID.get(ot.GroupID);
        if (!g) return;
        const key = `t${ot.Task.ID}`;
        const patch = (value: boolean) => setData((prev) => prev && {
            ...prev,
            Tasks: (prev.Tasks ?? []).map((x) => x.Task.ID === ot.Task.ID ? {...x, Task: {...x.Task, Done: value}} : x),
        });
        setTouched((prev) => new Set(prev).add(key));
        patch(done);
        const ret = await sendSetTaskDone({
            UserID: userID, DirID: g.DirID, GroupID: g.GroupID, SubGroupID: ot.SubGroupID, TaskID: ot.Task.ID, Done: done,
        });
        if (!ret.ok) {
            message.error('保存失败，已恢复');
            patch(!done);
        }
    };

    const toggleRoutine = async (gid: number, leaves: VNode[], touchKey?: string) => {
        const rd = routineData.get(gid);
        if (!rd) return;
        const ret = toggleLeaves(leaves, today);
        if (!ret.changed) {
            message.info(ret.waitingStart ? `${shortDate(ret.waitingStart)} 才开始` : '还没开始');
            return;
        }
        const before = nodesRef.current[gid] ?? {};
        const changed = withOwnerSync(gid, rd.subGroups, rd.tasks, before, ret.changed, today);
        if (touchKey) setTouched((prev) => new Set(prev).add(touchKey));
        // 节奏层勾完会从列表里消失：把这次涉及的节奏层都记为“勾过”，留在原处
        leaves.forEach((l) => setTouched((prev) => new Set(prev).add(`r${gid}:${l.owner.key}`)));
        setNodes((prev) => {
            const next = {...(prev[gid] ?? {})};
            changed.forEach((c) => {
                next[nodeKey(c.Kind, c.NodeID)] = c;
            });
            return {...prev, [gid]: next};
        });
        const res = await sendSaveRoutine({UserID: userID, DirID: rd.group.DirID, GroupID: gid, Nodes: changed, DelTasks: []});
        if (!res.ok) {
            message.error('保存失败，已恢复');
            setNodes((prev) => ({...prev, [gid]: before}));
        }
    };

    const setFavorite = async (g: OverviewGroup, subGroupID: number, favorite: boolean) => {
        const same = (f: { GroupID: number, SubGroupID: number }) => f.GroupID === g.GroupID && f.SubGroupID === subGroupID;
        const patch = (value: boolean) => setData((prev) => {
            if (!prev) return prev;
            const rest = (prev.Favorites ?? []).filter((f) => !same(f));
            return {...prev, Favorites: value ? [...rest, {GroupID: g.GroupID, SubGroupID: subGroupID}] : rest};
        });
        patch(favorite);
        const ret = await sendSetGroupFavorite({
            UserID: userID, ParentDirID: g.DirID, GroupID: g.GroupID, SubGroupID: subGroupID, Favorite: favorite,
        });
        if (!ret.ok) {
            message.error('操作失败');
            patch(!favorite);
            return;
        }
        // 后端只返回收藏范围内的任务，新收藏的要重新拉一次
        if (favorite) load(true).then();
    };

    // ---------- 渲染 ----------

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

    if (!data) {
        return <div className="ov-root" style={rootStyle}>
            <div className="ov-loading">{loading ? <Spin/> : <Button onClick={() => load()}>重新加载</Button>}</div>
        </div>;
    }

    const allSubGroups = [...(data.SubGroups ?? [])].sort((a, b) => a.Index - b.Index);
    const subGroupByID = new Map(allSubGroups.map((sg) => [sg.ID, sg]));
    const wholeFav = favScope.groups;
    const favSubIDs = favScope.subGroups;
    // 整个分组收藏了，它下面单独收藏的子分组就不再重复显示
    const favorites: FavItem[] = [];
    (data.Favorites ?? []).forEach((f) => {
        const g = groupByID.get(f.GroupID);
        if (!g) return;
        if (f.SubGroupID === 0) {
            favorites.push({key: `g${g.GroupID}`, group: g, subGroup: null});
            return;
        }
        const sg = subGroupByID.get(f.SubGroupID);
        if (sg && !wholeFav.has(g.GroupID)) favorites.push({key: `g${g.GroupID}:${sg.ID}`, group: g, subGroup: sg});
    });
    // 可收藏的：没收藏的分组，以及它下面没收藏的子分组（只有一个子分组时收子分组和收整个分组一样，不单列）
    const candidates: FavCandidate[] = [];
    groups.forEach((g) => {
        if (wholeFav.has(g.GroupID)) return;
        candidates.push({key: `g${g.GroupID}`, group: g, subGroup: null, text: groupPath(g)});
        const sgs = allSubGroups.filter((sg) => sg.GroupID === g.GroupID);
        if (sgs.length < 2) return;
        sgs.filter((sg) => !favSubIDs.has(sg.ID)).forEach((sg) => candidates.push({
            key: `g${g.GroupID}:${sg.ID}`, group: g, subGroup: sg, text: `${groupPath(g)} / ${sg.Title}`,
        }));
    });
    const counts = {
        overdue: focus.overdue.filter((i) => !itemDone(i)).length,
        doing: focus.doing.filter((i) => !itemDone(i)).length,
    };
    const focusEmpty = BUCKETS.every((b) => focus[b.key].length === 0);
    const t0 = dayjs(today);

    return <div className="ov-root" style={rootStyle}>
        <div className="ov-hero">
            <div className="ov-hero-main">
                <div className="ov-hero-title">关注</div>
                <div className="ov-hero-sub">
                    <span>{t0.format('M月D日')} 周{'日一二三四五六'[t0.day()]}</span>
                    {counts.overdue > 0 && <span className="ov-count ov-count-error">{counts.overdue} 项逾期</span>}
                    {counts.doing > 0 && <span className="ov-count">{counts.doing} 项进行中</span>}
                </div>
            </div>
            <Tooltip title="刷新">
                <Button type="text" icon={<ReloadOutlined spin={loading}/>} onClick={() => load()}/>
            </Tooltip>
        </div>

        {/* 窄屏只显示有内容的栏；宽屏三栏固定并排，空的栏显示占位 */}
        {focusEmpty && <div className="ov-calm">{favorites.length === 0 ? '先在下面收藏要关注的清单' : '收藏的清单里没有带日期的事'}</div>}
        <div className={`ov-focus ${focusEmpty ? 'ov-focus-empty' : ''}`}>
            {BUCKETS.map((b) => <section key={b.key}
                                         className={`ov-section ov-col ov-section-${b.key} ${focus[b.key].length === 0 ? 'ov-section-none' : ''}`}>
                <div className="ov-section-title">
                    {b.title}
                    <span className="ov-section-count">{focus[b.key].length || ''}</span>
                </div>
                {focus[b.key].length === 0 ? <div className="ov-col-empty">没有</div> : <div className="ov-list">
                    {splitBucket(focus[b.key]).map((part) => part.kind === 'task'
                        ? <TaskRow key={part.item.key} item={part.item} onDone={setTaskDone}
                                   onJump={() => props.onOpenGroup(part.item.group, {taskID: part.item.ot.Task.ID, subGroupID: part.item.ot.SubGroupID})}/>
                        : <RoutineBlock key={`rg${part.group.GroupID}`} group={part.group} items={part.items}
                                        onToggle={(leaves, key) => toggleRoutine(part.group.GroupID, leaves, key)}
                                        onJump={(target) => props.onOpenGroup(part.group, target)}/>)}
                </div>}
            </section>)}
        </div>

        <section className="ov-section ov-fav">
            <div className="ov-section-title">
                收藏
                <FavPicker candidates={candidates} onPick={(c) => setFavorite(c.group, c.subGroup?.ID ?? 0, true)}/>
            </div>
            {favorites.length === 0
                ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="收藏要关注的清单或其中一栏，带日期的事会自动排到上面"/>
                : <div className="ov-board">
                    {favorites.map((f) => {
                        const g = f.group;
                        const head = {
                            foldKey: f.key,
                            title: f.subGroup ? (f.subGroup.Title || g.Title) : g.Title,
                            path: f.subGroup ? [...(g.Path ?? []), g.Title] : (g.Path ?? []),
                            onOpen: () => props.onOpenGroup(g, f.subGroup ? {subGroupID: f.subGroup.ID} : undefined),
                            onJump: (target: LocateTarget) => props.onOpenGroup(g, target),
                            onUnfavorite: () => setFavorite(g, f.subGroup?.ID ?? 0, false),
                        };
                        if (g.Type === GroupType.Routine) {
                            return <RoutineCard key={f.key} head={head} model={models.get(g.GroupID)!} onlySubGroup={f.subGroup?.ID ?? 0}
                                                onToggle={(leaves) => toggleRoutine(g.GroupID, leaves)}/>;
                        }
                        return <BoardCard key={f.key} head={head} today={t0}
                                          subGroups={allSubGroups.filter((s) => f.subGroup ? s.ID === f.subGroup.ID : s.GroupID === g.GroupID)}
                                          single={!!f.subGroup}
                                          tasks={(data.Tasks ?? []).filter((t) => t.GroupID === g.GroupID)}
                                          touched={touched} onDone={setTaskDone}/>;
                    })}
                </div>}
        </section>
    </div>;
}

type BucketPart =
    | { kind: 'task', item: TaskItem }
    | { kind: 'routine', group: OverviewGroup, items: RoutineItem[] };

/** 一组里先列普通任务，再按清单归拢例行事项：同一清单只显示一次来源。 */
function splitBucket(items: FocusItem[]): BucketPart[] {
    const out: BucketPart[] = [];
    const blocks = new Map<number, RoutineItem[]>();
    items.forEach((it) => {
        if (it.kind === 'task') out.push({kind: 'task', item: it});
        else blocks.set(it.group.GroupID, [...(blocks.get(it.group.GroupID) ?? []), it]);
    });
    blocks.forEach((list) => out.push({kind: 'routine', group: list[0].group, items: list}));
    return out;
}

function itemDone(it: FocusItem): boolean {
    return it.kind === 'task' ? it.ot.Task.Done : it.owner.complete;
}

// ---------------- 上半部分的行 ----------------

function TimingTag(props: { timing: Timing }) {
    if (!props.timing.label) return null;
    return <span className={`ov-tag ov-tag-${props.timing.tone}`}>{props.timing.label}</span>;
}

/** 行尾的定位按钮：跳到这一项在清单里的原位置。 */
function JumpBtn(props: { onClick: () => void }) {
    return <span className="ov-jump" title="去清单里的原位置" onClick={(e) => {
        e.stopPropagation();
        props.onClick();
    }}><AimOutlined/></span>;
}

function TaskRow(props: { item: TaskItem, onDone: (ot: OverviewTask, done: boolean) => void, onJump: () => void }) {
    const {ot, group, timing} = props.item;
    const t = ot.Task;
    const flagged = !!t.Tags?.includes(FLAG_TAG);
    return <div className={`ov-row ${t.Done ? 'ov-row-done' : ''}`}>
        <span className="ov-row-check">
            <RoutineCheck value={t.Done ? 'on' : 'off'} size={20} onClick={() => props.onDone(ot, !t.Done)}/>
        </span>
        <div className="ov-row-main">
            <div className="ov-row-title">
                {flagged && <FlagFilled className="ov-flag"/>}
                {ot.ParentTitle && <span className="ov-row-parent">{ot.ParentTitle} ›</span>}
                {t.Title}
            </div>
            <a className="ov-row-src" onClick={props.onJump}>{groupPath(group)}</a>
        </div>
        <TimingTag timing={timing}/>
        <JumpBtn onClick={props.onJump}/>
    </div>;
}

function RoutineBlock(props: {
    group: OverviewGroup
    items: RoutineItem[]
    onToggle: (leaves: VNode[], key: string) => void
    onJump: (target?: LocateTarget) => void
}) {
    return <div className="ov-row-wrap ov-rblock">
        <a className="ov-rblock-head" onClick={() => props.onJump()}>
            {groupPath(props.group)}<span className="ov-rblock-kind">例行</span>
        </a>
        {props.items.map((it) => <RoutineOwnerRow key={it.key} item={it} onToggle={(leaves) => props.onToggle(leaves, it.key)}
                                                         onJump={props.onJump}/>)}
    </div>;
}

function RoutineOwnerRow(props: { item: RoutineItem, onToggle: (leaves: VNode[]) => void, onJump: (target: LocateTarget) => void }) {
    const {owner, timing, title, subTitle, target} = props.item;
    const [open, setOpen] = useState(true); // 里面的事项默认摊开，能直接勾
    const leaves = owner.ownLeaves;
    const act = leaves.filter((l) => l.active);
    const done = act.filter((l) => l.checked).length;
    const multi = leaves.length > 1;
    const waiting = act.length === 0; // 还没开始（“接下来”里的）：不能勾，只列出有哪些
    const value = owner.complete ? 'on' : done > 0 ? 'mixed' : 'off';
    return <>
        <div className={`ov-subrow ov-rrow ${owner.complete ? 'ov-row-done' : ''}`}>
            <RoutineCheck value={value} size={18} disabled={act.length === 0} onClick={() => props.onToggle(leaves)}/>
            <span className="ov-subrow-title" onClick={() => multi && setOpen(!open)} style={{cursor: multi ? 'pointer' : undefined}}>
                {subTitle && <span className="ov-row-parent">{subTitle} ›</span>}
                {title}
                {multi && <span className="ov-row-progress">{waiting ? `共 ${leaves.length} 项` : `${done}/${act.length}`}</span>}
                {multi && (open ? <DownOutlined className="ov-row-arrow"/> : <RightOutlined className="ov-row-arrow"/>)}
            </span>
            <TimingTag timing={timing}/>
            <JumpBtn onClick={() => props.onJump(target)}/>
        </div>
        {open && multi && <div className="ov-sublist">
            {(waiting ? leaves : act).map((l) => <div key={l.task.ID} className={`ov-subrow ${l.checked ? 'ov-row-done' : ''}`}>
                <RoutineCheck value={l.checked ? 'on' : 'off'} size={18} optional={l.optional} disabled={waiting}
                              onClick={() => !waiting && props.onToggle([l])}/>
                <span className="ov-subrow-title">{l.task.Title}</span>
                <JumpBtn onClick={() => props.onJump({taskID: l.task.ID, subGroupID: l.sgID})}/>
            </div>)}
        </div>}
    </>;
}

// ---------------- 收藏卡片 ----------------

/** 收藏入口：弹出一个可搜索的清单列表，点一下就收藏。 */
function FavPicker(props: { candidates: FavCandidate[], onPick: (c: FavCandidate) => void }) {
    const [open, setOpen] = useState(false);
    const [q, setQ] = useState('');
    const list = props.candidates.filter((c) => c.text.toLowerCase().includes(q.trim().toLowerCase()));
    const content = <div className="ov-picker">
        <Input autoFocus allowClear size="small" variant="filled" placeholder="搜索清单或其中一栏"
               value={q} onChange={(e) => setQ(e.target.value)}/>
        <div className="ov-picker-list">
            {list.length === 0 && <div className="ov-picker-empty">没有可收藏的清单</div>}
            {list.map((c) => <div key={c.key} className={`ov-picker-item ${c.subGroup ? 'ov-picker-sub' : ''}`} onClick={() => {
                props.onPick(c);
                setOpen(false);
                setQ('');
            }}>
                {c.subGroup ? <>
                    <span className="ov-picker-title">{c.subGroup.Title || '（未命名）'}</span>
                    {/* 搜索时子分组可能脱离它的分组单独出现，带上分组名 */}
                    {q.trim() && <span className="ov-picker-path">{c.group.Title}</span>}
                </> : <>
                    <span className="ov-picker-title">{c.group.Title}</span>
                    {(c.group.Path ?? []).length > 0 && <span className="ov-picker-path">{(c.group.Path ?? []).join(' / ')}</span>}
                    {c.group.Type === GroupType.Routine && <span className="ov-rblock-kind">例行</span>}
                </>}
            </div>)}
        </div>
    </div>;
    return <Popover open={open} onOpenChange={setOpen} trigger="click" placement="bottomRight" content={content} arrow={false}>
        <Button size="small" type="text" icon={<PlusOutlined/>} className="ov-fav-add">收藏</Button>
    </Popover>;
}

function useFold(foldKey: string): [boolean, (v: boolean) => void] {
    const key = `todone:overview:fold:${foldKey}`;
    const [folded, setFolded] = useState<boolean>(() => {
        try {
            return localStorage.getItem(key) === '1';
        } catch {
            return false;
        }
    });
    const set = (v: boolean) => {
        setFolded(v);
        try {
            localStorage.setItem(key, v ? '1' : '0');
        } catch {
            // 忽略存储失败
        }
    };
    return [folded, set];
}

/** 卡片头需要的信息：整个分组或某个子分组都用这一份。 */
interface CardHeadInfo {
    foldKey: string
    title: string
    path: string[]
    onOpen: () => void
    onJump: (target: LocateTarget) => void
    onUnfavorite: () => void
}

function CardHead(props: { head: CardHeadInfo, folded: boolean, onFold: () => void, meta: React.ReactNode }) {
    const {head} = props;
    return <div className="ov-card-head">
        <span className="ov-card-fold" onClick={props.onFold}>{props.folded ? <RightOutlined/> : <DownOutlined/>}</span>
        <div className="ov-card-name" onClick={props.onFold}>
            <span className="ov-card-title">{head.title}</span>
            {head.path.length > 0 && <span className="ov-card-path">{head.path.join(' / ')}</span>}
        </div>
        <span className="ov-card-meta">{props.meta}</span>
        <Tooltip title="打开清单">
            <Button size="small" type="text" icon={<AimOutlined/>} onClick={head.onOpen}/>
        </Tooltip>
        <Dropdown trigger={['click']} menu={{
            items: [
                {key: 'unfav', label: '取消收藏', onClick: head.onUnfavorite},
            ],
        }}>
            <Button size="small" type="text" icon={<MoreOutlined/>}/>
        </Dropdown>
    </div>;
}

function BoardCard(props: {
    head: CardHeadInfo
    today: Dayjs
    subGroups: { ID: number, Title: string }[]
    single: boolean // 只收藏了一个子分组：卡片标题就是它，不再显示小标题
    tasks: OverviewTask[]
    touched: Set<string>
    onDone: (ot: OverviewTask, done: boolean) => void
}) {
    const [folded, setFolded] = useFold(props.head.foldKey);
    const sgIDs = new Set(props.subGroups.map((sg) => sg.ID));
    const visible = props.tasks.filter((t) => sgIDs.has(t.SubGroupID) && (!t.Task.Done || props.touched.has(`t${t.Task.ID}`)));
    const left = visible.filter((t) => !t.Task.Done).length;
    const blocks = props.subGroups.map((sg) => {
        const list = visible.filter((t) => t.SubGroupID === sg.ID);
        const kids = new Map<number, OverviewTask[]>();
        list.forEach((t) => kids.set(t.Task.ParentID, [...(kids.get(t.Task.ParentID) ?? []), t]));
        kids.forEach((arr) => arr.sort((a, b) => a.Task.Index - b.Task.Index));
        const rows: { ot: OverviewTask, depth: number }[] = [];
        const walk = (parent: number, depth: number) => (kids.get(parent) ?? []).forEach((ot) => {
            rows.push({ot, depth});
            walk(ot.Task.ID, depth + 1);
        });
        walk(0, 0);
        return {sg, rows};
    }).filter((b) => b.rows.length > 0);

    return <div className="ov-card">
        <CardHead head={props.head} folded={folded} onFold={() => setFolded(!folded)} meta={left || '都做完了'}/>
        {!folded && <div className="ov-card-body">
            {blocks.length === 0 && <div className="ov-card-empty">没有未完成的任务</div>}
            {blocks.map(({sg, rows}) => <div key={sg.ID} className="ov-block">
                {!props.single && (blocks.length > 1 || sg.Title) ? <div className="ov-block-title">{sg.Title}</div> : null}
                {rows.map(({ot, depth}) => {
                    const t = ot.Task;
                    const timing = taskTiming(t, props.today);
                    const flagged = !!t.Tags?.includes(FLAG_TAG);
                    return <div key={t.ID} className={`ov-subrow ${t.Done ? 'ov-row-done' : ''}`} style={{paddingLeft: 4 + depth * 22}}>
                        <RoutineCheck value={t.Done ? 'on' : 'off'} size={18} onClick={() => props.onDone(ot, !t.Done)}/>
                        <span className="ov-subrow-title">
                            {flagged && <FlagFilled className="ov-flag"/>}
                            {t.Title}
                        </span>
                        {timing && <TimingTag timing={timing}/>}
                        <JumpBtn onClick={() => props.head.onJump({taskID: t.ID, subGroupID: ot.SubGroupID})}/>
                    </div>;
                })}
            </div>)}
        </div>}
    </div>;
}

function RoutineCard(props: {
    head: CardHeadInfo
    model: Model
    onlySubGroup: number // 只收藏了这一栏；0 表示整个清单
    onToggle: (leaves: VNode[]) => void
}) {
    const [folded, setFolded] = useFold(props.head.foldKey);
    const {model} = props;
    const sgs = props.onlySubGroup ? model.sgs.filter((s) => s.sg.ID === props.onlySubGroup) : model.sgs;
    const agg = aggregate(props.onlySubGroup ? sgs.flatMap((s) => s.leaves) : model.leaves);
    const meta = agg.total ? `${agg.done}/${agg.total}` : agg.waiting ? '都还没开始' : '空清单';

    const renderNode = (v: VNode, depth: number): React.ReactNode => {
        if (v.folder) {
            const act = v.leaves.filter((l) => l.active);
            if (act.length === 0) return null;
            return <div key={v.task.ID}>
                <div className="ov-folder" style={{paddingLeft: 4 + depth * 22}}>{v.task.Title}</div>
                {v.children.map((c) => renderNode(c, depth + 1))}
            </div>;
        }
        if (!v.active) return null;
        const rhythm = v.ownsRhythm && v.owner.view.label;
        return <div key={v.task.ID} className={`ov-subrow ${v.checked ? 'ov-row-done' : ''}`} style={{paddingLeft: 4 + depth * 22}}>
            <RoutineCheck value={v.checked ? 'on' : 'off'} size={18} optional={v.optional} onClick={() => props.onToggle([v])}/>
            <span className="ov-subrow-title">{v.task.Title}</span>
            {rhythm && !v.checked && <span className={`ov-tag ov-tag-${v.owner.view.phase === 'overdue' ? 'error' : 'plain'}`}>{rhythm}</span>}
            <JumpBtn onClick={() => props.head.onJump({taskID: v.task.ID, subGroupID: v.sgID})}/>
        </div>;
    };

    return <div className="ov-card">
        <CardHead head={props.head} folded={folded} onFold={() => setFolded(!folded)} meta={meta}/>
        {!folded && <div className="ov-card-body">
            {sgs.map((s) => {
                const rows = s.roots.map((r) => renderNode(r, 0)).filter(Boolean);
                if (rows.length === 0) return null;
                const label = s.ownRule ? s.owner.view.label : '';
                return <div key={s.sg.ID} className="ov-block">
                    {(!props.onlySubGroup || label) && <div className="ov-block-title">
                        {!props.onlySubGroup && s.sg.Title}
                        {label && <span className="ov-block-rhythm">{label}</span>}
                    </div>}
                    {rows}
                </div>;
            })}
            {agg.total === 0 && <div className="ov-card-empty">
                {agg.nextStart ? `${shortDate(agg.nextStart)} 开始` : '没有进行中的事项'}
            </div>}
        </div>}
    </div>;
}
