import {useCallback, useEffect, useMemo, useRef, useState} from "react";
import {Button, Dropdown, Empty, Input, message, Popover, Spin, theme, Tooltip} from "antd";
import {AimOutlined, DownOutlined, FlagFilled, MoreOutlined, PlusOutlined, ReloadOutlined, RightOutlined} from "@ant-design/icons";
import dayjs, {Dayjs} from "dayjs";
import {GroupType} from "./net/protocal";
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
import {aggregate, Model, nodeKey, toggleLeaves, VNode, withOwnerSync} from "./routineModel";
import {shortDate, todayStr} from "./routineRule";
import {RoutineCheck} from "./RoutineParts";
import {LocateTarget} from "./locate";
import {
    Bucket,
    buildFocus,
    buildModels,
    favScopeOf,
    FocusItem,
    itemDone,
    NodesByGroup,
    overviewNodes,
    routineDataOf,
    SOON_DAYS,
    TaskItem,
    RoutineItem,
    Timing,
    taskTiming,
} from "./focusModel";
import {useAppActive} from "../shell/runtime";
import "./Routine.css";
import "./Overview.css";

/**
 * 关注页：只看收藏的清单（整个分组或其中一栏）。
 * - 上半部分从收藏里挑出带日期的事。主栏按逾期、今天、进行中分段；旁边按天列出接下来 7 天。
 *   没设日期的任务（常开着的、持续进行的）不进上半部分，只在下面的收藏卡片里。
 * - 下半部分是收藏卡片，只列上面没出现过的未完成项，底部注明有几项在上面。
 * - 行下面的来源文字可以点，跳到它在清单里的原位置。
 * 宽屏主栏和日程左右并排、收藏卡片三列铺开；窄屏都是单列往下排。
 * 数据一次请求拿全（getOverview），勾选先改界面再发请求，失败退回。
 */

const FLAG_TAG = "[system]flag";

// 主栏里的三段，按这个顺序排；“接下来”单独放在旁边的日程里
const BANDS: { key: Bucket, title: string }[] = [
    {key: 'overdue', title: '逾期'},
    {key: 'today', title: '今天'},
    {key: 'doing', title: '进行中'},
];

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

export default function Overview(props: OverviewProps) {
    const {token} = theme.useToken();
    const {userID} = props;
    const [data, setData] = useState<GetOverviewRet | null>(null);
    const [loading, setLoading] = useState(false);
    const [today, setToday] = useState(todayStr());
    // 这次页面里勾过的项：做完了也先留在原处（划掉），方便手滑撤销，下次加载才消失
    const [touched, setTouched] = useState<Set<string>>(new Set());
    const [nodes, setNodes] = useState<NodesByGroup>({});
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
        setData(ret.data);
        setNodes(overviewNodes(ret.data));
        setTouched(new Set());
    }, [userID]);

    useEffect(() => {
        load().then();
    }, [load]);

    // 切回页面（或从别的应用切回 Todone）时静默刷新；跨过零点时更新“今天”
    const refreshQuietly = () => {
        setToday(todayStr());
        load(true).then();
    };
    useAppActive(refreshQuietly);
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
    const routineData = useMemo(() => routineDataOf(data), [data]);
    const models = useMemo(() => buildModels(routineData, nodes, today), [routineData, nodes, today]);

    // ---------- 上半部分 ----------

    // 收藏范围：整个收藏的分组，和单独收藏的栏（子分组）
    const favScope = useMemo(() => favScopeOf(data), [data]);

    const focus = useMemo(() => buildFocus({data, routineData, models, favScope, touched, today}),
        [data, routineData, models, favScope, touched, today]);

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
    const live = (b: Bucket) => focus[b].filter((i) => !itemDone(i)).length;
    const counts = {overdue: live('overdue'), today: live('today'), doing: live('doing')};
    const mainEmpty = BANDS.every((b) => focus[b.key].length === 0);
    const t0 = dayjs(today);

    // 上面已经列出的事，收藏卡片里不再重复
    const shownTasks = new Set<number>();
    const shownLeaves = new Set<number>();
    (Object.values(focus) as FocusItem[][]).forEach((list) => list.forEach((it) => {
        if (it.kind === 'task') shownTasks.add(it.ot.Task.ID);
        else it.owner.ownLeaves.forEach((l) => shownLeaves.add(l.task.ID));
    }));

    const jump = (it: FocusItem) => it.kind === 'task'
        ? props.onOpenGroup(it.group, {taskID: it.ot.Task.ID, subGroupID: it.ot.SubGroupID})
        : props.onOpenGroup(it.group, it.target);

    return <div className="ov-root" style={rootStyle}>
        <div className="ov-hero">
            <div className="ov-hero-main">
                <div className="ov-hero-date">{t0.format('M月D日')} 周{'日一二三四五六'[t0.day()]}</div>
                <div className="ov-hero-title">关注</div>
            </div>
            <div className="ov-stats">
                {counts.overdue > 0 && <span className="ov-stat ov-stat-error"><b>{counts.overdue}</b>逾期</span>}
                {counts.today > 0 && <span className="ov-stat ov-stat-warning"><b>{counts.today}</b>今天</span>}
                {counts.doing > 0 && <span className="ov-stat"><b>{counts.doing}</b>进行中</span>}
            </div>
            <Tooltip title="刷新">
                <Button type="text" icon={<ReloadOutlined spin={loading}/>} onClick={() => load()}/>
            </Tooltip>
        </div>

        <div className="ov-top">
            <section className="ov-panel ov-now">
                {mainEmpty && <div className="ov-calm">
                    {favorites.length === 0 ? '先在下面收藏要关注的清单' : '没有逾期和进行中的事'}
                </div>}
                {BANDS.filter((b) => focus[b.key].length > 0).map((b) => <div key={b.key} className={`ov-band ov-band-${b.key}`}>
                    <div className="ov-band-title">
                        {b.title}
                        {live(b.key) > 0 && <span className="ov-band-count">{live(b.key)}</span>}
                    </div>
                    {focus[b.key].map((it) => it.kind === 'task'
                        ? <TaskRow key={it.key} item={it} onDone={setTaskDone} onJump={() => jump(it)}/>
                        : <RoutineRow key={it.key} item={it} onJump={() => jump(it)}
                                      onToggle={(leaves) => toggleRoutine(it.group.GroupID, leaves, it.key)}/>)}
                </div>)}
            </section>
            <section className="ov-panel ov-agenda">
                <div className="ov-panel-title">接下来 {SOON_DAYS} 天</div>
                <Agenda items={focus.soon} today={t0} onJump={jump}/>
            </section>
        </div>

        <section className="ov-fav">
            <div className="ov-fav-title">
                收藏
                <FavPicker candidates={candidates} onPick={(c) => setFavorite(c.group, c.subGroup?.ID ?? 0, true)}/>
            </div>
            {favorites.length === 0
                ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="收藏清单或其中一栏，带日期的事会排到上面"/>
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
                                                hidden={shownLeaves} onToggle={(leaves) => toggleRoutine(g.GroupID, leaves)}/>;
                        }
                        return <BoardCard key={f.key} head={head} today={t0}
                                          subGroups={allSubGroups.filter((s) => f.subGroup ? s.ID === f.subGroup.ID : s.GroupID === g.GroupID)}
                                          single={!!f.subGroup}
                                          tasks={(data.Tasks ?? []).filter((t) => t.GroupID === g.GroupID)}
                                          hidden={shownTasks} touched={touched} onDone={setTaskDone}/>;
                    })}
                </div>}
        </section>
    </div>;
}

// ---------------- 上半部分 ----------------

function TimingTag(props: { timing: Timing }) {
    if (!props.timing.label) return null;
    return <span className={`ov-tag ov-tag-${props.timing.tone}`}>{props.timing.label}</span>;
}

/** 收藏卡片行尾的定位按钮：鼠标移上去才出现，触屏不显示（卡片头有打开清单的按钮）。 */
function JumpBtn(props: { onClick: () => void }) {
    return <span className="ov-jump" title="去清单里的原位置" onClick={(e) => {
        e.stopPropagation();
        props.onClick();
    }}><AimOutlined/></span>;
}

// 关注页上半部分的行：只有上面“圆圈 + 标题 + 右侧标签”这一条（ov-row-head）能点来勾选；
// 下面的来源文字只跳转，胶囊各勾各的，其余空白不响应（和例行清单页同一个规矩）。
function TaskRow(props: { item: TaskItem, onDone: (ot: OverviewTask, done: boolean) => void, onJump: () => void }) {
    const {ot, group, timing} = props.item;
    const t = ot.Task;
    const flagged = !!t.Tags?.includes(FLAG_TAG);
    return <div className={`ov-row ${t.Done ? 'ov-row-done' : ''}`}>
        <div className="ov-row-head" onClick={() => props.onDone(ot, !t.Done)}>
            <span className="ov-row-check">
                <RoutineCheck value={t.Done ? 'on' : 'off'} size={20}/>
            </span>
            <div className="ov-row-title">
                {flagged && <FlagFilled className="ov-flag"/>}
                {ot.ParentTitle && <span className="ov-row-parent">{ot.ParentTitle} ›</span>}
                {t.Title}
            </div>
            <TimingTag timing={timing}/>
        </div>
        <div className="ov-row-below">
            <a className="ov-row-src" onClick={props.onJump}>{groupPath(group)}</a>
        </div>
    </div>;
}

/**
 * 例行清单的一个节奏层：一行标题带进度，下面把这一层的事项排成小胶囊，点一下勾一项。
 * 只有一个事项的层就是普通的一行。点标题这一条勾整层。
 */
function RoutineRow(props: { item: RoutineItem, onToggle: (leaves: VNode[]) => void, onJump: () => void }) {
    const {owner, timing, title, subTitle, group} = props.item;
    const leaves = owner.ownLeaves;
    const act = leaves.filter((l) => l.active);
    const done = act.filter((l) => l.checked).length;
    const multi = leaves.length > 1;
    const value = owner.complete ? 'on' : done > 0 ? 'mixed' : 'off';
    return <div className={`ov-row ${owner.complete ? 'ov-row-done' : ''}`}>
        <div className="ov-row-head" onClick={() => act.length > 0 && props.onToggle(leaves)}>
            <span className="ov-row-check">
                <RoutineCheck value={value} size={20} disabled={act.length === 0}/>
            </span>
            <div className="ov-row-title">
                {subTitle && <span className="ov-row-parent">{subTitle} ›</span>}
                {title}
                {multi && act.length > 0 && <span className="ov-progress">
                    <i style={{width: `${done / act.length * 100}%`}}/>
                </span>}
                {multi && <span className="ov-row-progress">{done}/{act.length}</span>}
            </div>
            <TimingTag timing={timing}/>
        </div>
        <div className="ov-row-below">
            <a className="ov-row-src" onClick={props.onJump}>{groupPath(group)}</a>
            {multi && <div className="ov-chips">
                {act.map((l) => <span key={l.task.ID} title={l.task.Title}
                                      className={`ov-chip ${l.checked ? 'ov-chip-on' : ''}`}
                                      onClick={() => props.onToggle([l])}>
                    <RoutineCheck value={l.checked ? 'on' : 'off'} size={15} optional={l.optional}/>
                    <span className="ov-chip-text">{l.task.Title}</span>
                </span>)}
            </div>}
        </div>
    </div>;
}

/** 接下来 7 天：按天排，只是看，不能勾（都还没开始）。点一项跳到清单里。 */
function Agenda(props: { items: FocusItem[], today: Dayjs, onJump: (it: FocusItem) => void }) {
    if (props.items.length === 0) return <div className="ov-agenda-empty">没有</div>;
    const days = new Map<number, FocusItem[]>();
    props.items.forEach((it) => days.set(it.timing.sort, [...(days.get(it.timing.sort) ?? []), it]));
    return <div className="ov-days">
        {Array.from(days.keys()).sort((a, b) => a - b).map((n) => {
            const list = days.get(n)!;
            const d = props.today.add(n, 'day');
            return <div key={n} className="ov-day">
                <div className="ov-day-name">
                    <b>{n === 1 ? '明天' : n === 2 ? '后天' : '周' + '日一二三四五六'[d.day()]}</b>
                    <span>{d.format('M/D')}</span>
                </div>
                <div className="ov-day-items">
                    {list.map((it) => <a key={it.key} className="ov-ag" onClick={() => props.onJump(it)}>
                        <span className="ov-ag-title">
                            {it.kind === 'task'
                                ? <>{it.ot.ParentTitle && <span className="ov-row-parent">{it.ot.ParentTitle} ›</span>}{it.ot.Task.Title}</>
                                : <>{it.subTitle && <span className="ov-row-parent">{it.subTitle} ›</span>}{it.title}
                                    {it.owner.ownLeaves.length > 1 && <span className="ov-ag-n">{it.owner.ownLeaves.length} 项</span>}</>}
                        </span>
                        <span className="ov-ag-src">{it.group.Title}</span>
                    </a>)}
                </div>
            </div>;
        })}
    </div>;
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
    hidden: Set<number> // 上面已经列出的任务
    touched: Set<string>
    onDone: (ot: OverviewTask, done: boolean) => void
}) {
    const [folded, setFolded] = useFold(props.head.foldKey);
    const sgIDs = new Set(props.subGroups.map((sg) => sg.ID));
    const visible = props.tasks.filter((t) => sgIDs.has(t.SubGroupID) && (!t.Task.Done || props.touched.has(`t${t.Task.ID}`)));
    const left = visible.filter((t) => !t.Task.Done).length;
    const above = visible.filter((t) => props.hidden.has(t.Task.ID)).length;
    const blocks = props.subGroups.map((sg) => {
        const list = visible.filter((t) => t.SubGroupID === sg.ID);
        const kids = new Map<number, OverviewTask[]>();
        list.forEach((t) => kids.set(t.Task.ParentID, [...(kids.get(t.Task.ParentID) ?? []), t]));
        kids.forEach((arr) => arr.sort((a, b) => a.Task.Index - b.Task.Index));
        const rows: { ot: OverviewTask, depth: number }[] = [];
        // 上面列过的任务不显示，它的子任务提到它的位置
        const walk = (parent: number, depth: number) => (kids.get(parent) ?? []).forEach((ot) => {
            if (props.hidden.has(ot.Task.ID)) {
                walk(ot.Task.ID, depth);
                return;
            }
            rows.push({ot, depth});
            walk(ot.Task.ID, depth + 1);
        });
        walk(0, 0);
        return {sg, rows};
    }).filter((b) => b.rows.length > 0);

    return <div className="ov-card">
        <CardHead head={props.head} folded={folded} onFold={() => setFolded(!folded)} meta={left || '都做完了'}/>
        {!folded && <div className="ov-card-body">
            {blocks.length === 0 && above === 0 && <div className="ov-card-empty">没有未完成的任务</div>}
            {blocks.map(({sg, rows}) => <div key={sg.ID} className="ov-block">
                {!props.single && (blocks.length > 1 || sg.Title) ? <div className="ov-block-title">{sg.Title}</div> : null}
                {rows.map(({ot, depth}) => {
                    const t = ot.Task;
                    const timing = taskTiming(t, props.today);
                    const flagged = !!t.Tags?.includes(FLAG_TAG);
                    return <div key={t.ID} className={`ov-subrow ${t.Done ? 'ov-row-done' : ''}`} style={{paddingLeft: 4 + depth * 22}}
                                onClick={() => props.onDone(ot, !t.Done)}>
                        <RoutineCheck value={t.Done ? 'on' : 'off'} size={18}/>
                        <span className="ov-subrow-title">
                            {flagged && <FlagFilled className="ov-flag"/>}
                            {t.Title}
                        </span>
                        {timing && <TimingTag timing={timing}/>}
                        <JumpBtn onClick={() => props.head.onJump({taskID: t.ID, subGroupID: ot.SubGroupID})}/>
                    </div>;
                })}
            </div>)}
            {above > 0 && <div className="ov-card-above">{above} 项在上面</div>}
        </div>}
    </div>;
}

function RoutineCard(props: {
    head: CardHeadInfo
    model: Model
    onlySubGroup: number // 只收藏了这一栏；0 表示整个清单
    hidden: Set<number> // 上面已经列出的事项
    onToggle: (leaves: VNode[]) => void
}) {
    const [folded, setFolded] = useFold(props.head.foldKey);
    const {model} = props;
    const sgs = props.onlySubGroup ? model.sgs.filter((s) => s.sg.ID === props.onlySubGroup) : model.sgs;
    const agg = aggregate(props.onlySubGroup ? sgs.flatMap((s) => s.leaves) : model.leaves);
    const meta = agg.total ? `${agg.done}/${agg.total}` : agg.waiting ? '都还没开始' : '空清单';
    const above = (props.onlySubGroup ? sgs.flatMap((s) => s.leaves) : model.leaves)
        .filter((l) => l.active && props.hidden.has(l.task.ID)).length;

    const renderNode = (v: VNode, depth: number): React.ReactNode => {
        if (v.folder) {
            const kids = v.children.map((c) => renderNode(c, depth + 1)).filter(Boolean);
            if (kids.length === 0) return null;
            return <div key={v.task.ID}>
                <div className="ov-folder" style={{paddingLeft: 4 + depth * 22}}>{v.task.Title}</div>
                {kids}
            </div>;
        }
        if (!v.active || props.hidden.has(v.task.ID)) return null;
        const rhythm = v.ownsRhythm && v.owner.view.label;
        return <div key={v.task.ID} className={`ov-subrow ${v.checked ? 'ov-row-done' : ''}`} style={{paddingLeft: 4 + depth * 22}}
                    onClick={() => props.onToggle([v])}>
            <RoutineCheck value={v.checked ? 'on' : 'off'} size={18} optional={v.optional}/>
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
            {above > 0 && <div className="ov-card-above">{above} 项在上面</div>}
        </div>}
    </div>;
}
