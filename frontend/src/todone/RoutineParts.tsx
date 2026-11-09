import {useEffect, useMemo, useRef, useState} from "react";
import {Button, DatePicker, InputNumber, Segmented, Select} from "antd";
import {RedoOutlined, ScheduleOutlined} from "@ant-design/icons";
import dayjs from "dayjs";
import {
    DATE_FMT,
    DaySpec,
    describeRule,
    evalRound,
    MONTH_EVERY,
    monthEveryText,
    NTH_TEXT,
    PeriodicRule,
    RoundView,
    RoutineRule,
    sameRule,
    shortDate,
    todayStr,
    upcomingRefresh,
    WEEK_ORDER,
    WEEKDAY,
} from "./routineRule";

export type CheckValue = 'on' | 'off' | 'mixed';

/** 圆形勾选框：从未勾选变为勾选时弹跳并描绘对勾，半选显示短横。 */
export function RoutineCheck(props: {
    value: CheckValue
    size?: number
    optional?: boolean
    disabled?: boolean
    onClick?: (e: React.MouseEvent) => void
}) {
    const size = props.size ?? 22;
    const prev = useRef(props.value);
    const [pop, setPop] = useState(false);
    useEffect(() => {
        if (prev.current !== 'on' && props.value === 'on') {
            setPop(true);
            const t = window.setTimeout(() => setPop(false), 450);
            prev.current = props.value;
            return () => window.clearTimeout(t);
        }
        prev.current = props.value;
    }, [props.value]);
    const cls = [
        'rt-check', `rt-check-${props.value}`,
        props.optional ? 'rt-check-optional' : '',
        props.disabled ? 'rt-check-disabled' : '',
        pop ? 'rt-check-pop' : '',
    ].filter(Boolean).join(' ');
    return <span
        role="checkbox"
        aria-checked={props.value === 'on' ? true : props.value === 'mixed' ? 'mixed' : false}
        aria-disabled={props.disabled}
        className={cls}
        style={{width: size, height: size}}
        onClick={props.onClick}
    >
        {/* 圆与对勾在同一坐标系内绘制，保证居中 */}
        <svg viewBox="0 0 24 24" width={size} height={size}>
            <circle cx="12" cy="12" r="10.5" className="rt-check-ring"/>
            {props.value === 'mixed'
                ? <line x1="7.5" y1="12" x2="16.5" y2="12" className="rt-check-mark"/>
                : <polyline points="7.4 12.3 10.6 15.4 16.6 9" className="rt-check-mark"/>}
        </svg>
    </span>
}

/** 环形进度。 */
export function ProgressRing(props: { done: number, total: number, size?: number, stroke?: number, children?: React.ReactNode }) {
    const size = props.size ?? 64;
    const stroke = props.stroke ?? 6;
    const r = (size - stroke) / 2;
    const c = 2 * Math.PI * r;
    const ratio = props.total > 0 ? Math.min(1, props.done / props.total) : 0;
    return <div className="rt-ring" style={{width: size, height: size}}>
        <svg width={size} height={size}>
            <circle cx={size / 2} cy={size / 2} r={r} strokeWidth={stroke} className="rt-ring-track"/>
            <circle cx={size / 2} cy={size / 2} r={r} strokeWidth={stroke} className="rt-ring-bar"
                    strokeDasharray={c} strokeDashoffset={c * (1 - ratio)}
                    transform={`rotate(-90 ${size / 2} ${size / 2})`}/>
        </svg>
        <div className="rt-ring-inner">{props.children}</div>
    </div>
}

/** 规则前的图标：手动重置用重置图标，按日期刷新用日历图标。 */
export function RuleIcon(props: { rule: RoutineRule }) {
    return props.rule.kind === 'manual' ? <RedoOutlined/> : <ScheduleOutlined/>;
}

/** 节奏标签：左边是规则，右边是这一期的状态；漏掉的期数单独提示。 */
export function RhythmChip(props: { rule: RoutineRule, view: RoundView, size?: 'sm', onClick?: () => void }) {
    const {view} = props;
    return <span className="rt-rhythm-wrap">
        <span className={`rt-rhythm rt-rhythm-${view.phase}${props.size ? ' rt-rhythm-sm' : ''}`}
              onClick={(e) => {
                  if (!props.onClick) return;
                  e.stopPropagation();
                  props.onClick();
              }}>
            <span className="rt-rhythm-rule" title={describeRule(props.rule)}>
                <RuleIcon rule={props.rule}/><span className="rt-rhythm-text">{describeRule(props.rule)}</span>
            </span>
            {view.label && <span className="rt-rhythm-state">{view.label}</span>}
        </span>
        {view.missed > 0 && <span className="rt-missed">前 {view.missed} 期没做</span>}
    </span>
}

// ---------------- 规则编辑器 ----------------

type Mode = 'inherit' | RoutineRule['kind'];
type DayType = DaySpec['type'];

function SegLabel(props: { children: React.ReactNode }) {
    return <span className="rt-rule-label">{props.children}</span>
}

/**
 * 刷新规则编辑器：先选多久一次，再选哪天刷新；底部实时预览接下来几次刷新。
 * inherited 不为空时提供“跟随上级”。
 */
export function RuleEditor(props: {
    value: RoutineRule | null
    inherited: RoutineRule | null
    onApply: (rule: RoutineRule | null) => void
}) {
    const v = props.value;
    const today = todayStr();
    const [mode, setMode] = useState<Mode>('manual');
    const [dayEvery, setDayEvery] = useState(1);
    const [weekEvery, setWeekEvery] = useState(1);
    const [weekdays, setWeekdays] = useState<number[]>([0]);
    const [monthEvery, setMonthEvery] = useState(1);
    const [offset, setOffset] = useState(0);
    const [dayType, setDayType] = useState<DayType>('date');
    const [date, setDate] = useState(1);
    const [nth, setNth] = useState(1);
    const [nthWd, setNthWd] = useState(6);
    const [afterDays, setAfterDays] = useState(30);
    const [start, setStart] = useState(today);
    const [grace, setGrace] = useState<number | null>(null);

    useEffect(() => {
        setMode(v ? v.kind : (props.inherited ? 'inherit' : 'manual'));
        if (!v || v.kind === 'manual') return;
        setStart(v.start);
        setGrace(v.grace ?? null);
        if (v.kind === 'day') setDayEvery(v.every);
        if (v.kind === 'week') {
            setWeekEvery(v.every);
            setWeekdays(v.weekdays);
        }
        if (v.kind === 'month') {
            setMonthEvery(v.every);
            setOffset(v.offset);
            setDayType(v.day.type);
            if (v.day.type === 'date') setDate(v.day.date);
            if (v.day.type === 'nth') {
                setNth(v.day.nth);
                setNthWd(v.day.weekday);
            }
        }
        if (v.kind === 'after') setAfterDays(v.days);
    }, [v, props.inherited]);

    const build = (): RoutineRule | null => {
        if (mode === 'inherit') return null;
        if (mode === 'manual') return {kind: 'manual'};
        const base: { start: string, grace?: number } = {start};
        if (grace) base.grace = grace;
        switch (mode) {
            case 'day':
                return {kind: 'day', every: Math.max(1, dayEvery || 1), ...base};
            case 'week':
                return {kind: 'week', every: Math.max(1, weekEvery || 1), weekdays: weekdays.slice().sort(), ...base};
            case 'month': {
                const day: DaySpec = dayType === 'date' ? {type: 'date', date: date || 1}
                    : dayType === 'last' ? {type: 'last'} : {type: 'nth', nth, weekday: nthWd};
                return {kind: 'month', every: monthEvery, offset: Math.min(offset, monthEvery - 1), day, ...base};
            }
            case 'after':
                return {kind: 'after', days: Math.max(1, afterDays || 1), ...base};
        }
    };
    const next = build();
    const invalid = mode === 'week' && weekdays.length === 0;
    const changed = !sameRule(next, v);
    const preview = useMemo(() => next && next.kind !== 'manual' && next.kind !== 'after' && !invalid
        ? upcomingRefresh(next as PeriodicRule, 4, today) : [], [JSON.stringify(next), invalid, today]);
    // 这一期（已经开始、还没到下次刷新）
    const current = useMemo(() => {
        if (!next || next.kind === 'manual' || next.kind === 'after' || invalid) return undefined;
        const r = evalRound(next, '', today);
        return r.waiting ? undefined : r.start;
    }, [JSON.stringify(next), invalid, today]);

    const options: { label: string, value: Mode }[] = [
        ...(props.inherited ? [{label: '跟随', value: 'inherit' as Mode}] : []),
        {label: '手动', value: 'manual'},
        {label: '按天', value: 'day'},
        {label: '按周', value: 'week'},
        {label: '按月', value: 'month'},
        {label: '顺延', value: 'after'},
    ];

    const toggleWd = (w: number) => setWeekdays((prev) => prev.includes(w) ? prev.filter((x) => x !== w) : [...prev, w]);
    const periodic = mode !== 'inherit' && mode !== 'manual';

    return <div className="rt-rule-editor">
        <Segmented block size="small" options={options} value={mode} onChange={(m) => setMode(m as Mode)}/>
        <div className="rt-rule-body" key={mode}>
            {mode === 'inherit' && props.inherited &&
                <div className="rt-rule-hint">跟随上级的节奏：{describeRule(props.inherited)}。上级刷新时这里一起清空。</div>}
            {mode === 'manual' &&
                <div className="rt-rule-hint">不会自动刷新，勾选一直保留，直到清空重来。适合出门清单这类随用随查的事项。</div>}

            {mode === 'day' && <div className="rt-rule-row">
                <SegLabel>每</SegLabel>
                <InputNumber min={1} max={999} value={dayEvery} onChange={(n) => setDayEvery(n ?? 1)} style={{width: 76}}/>
                <SegLabel>天刷新一次</SegLabel>
            </div>}

            {mode === 'week' && <>
                <div className="rt-rule-row">
                    <SegLabel>每</SegLabel>
                    <InputNumber min={1} max={99} value={weekEvery} onChange={(n) => setWeekEvery(n ?? 1)} style={{width: 76}}/>
                    <SegLabel>周，在</SegLabel>
                </div>
                <div className="rt-wd-picker">
                    {WEEK_ORDER.map((w) => <button key={w} type="button"
                                                   className={`rt-wd${weekdays.includes(w) ? ' rt-wd-on' : ''}`}
                                                   onClick={() => toggleWd(w)}>
                        {'日一二三四五六'[w]}
                    </button>)}
                </div>
                {invalid && <div className="rt-rule-warn">至少选一天</div>}
            </>}

            {mode === 'month' && <>
                <div className="rt-rule-row">
                    <Select value={monthEvery} style={{width: 112}} onChange={(n) => {
                        setMonthEvery(n);
                        setOffset(0);
                    }} options={MONTH_EVERY.map((n) => ({label: monthEveryText(n), value: n}))}/>
                    {monthEvery > 1 && monthEvery < 12 &&
                        <Select value={offset} style={{width: 112}} onChange={setOffset}
                                options={Array.from({length: monthEvery}, (_, i) => ({label: `第 ${i + 1} 个月`, value: i}))}/>}
                    {monthEvery === 12 &&
                        <Select value={offset} style={{width: 88}} onChange={setOffset}
                                options={Array.from({length: 12}, (_, i) => ({label: `${i + 1} 月`, value: i}))}/>}
                </div>
                <Segmented size="small" value={dayType} onChange={(t) => setDayType(t as DayType)} options={[
                    {label: '几号', value: 'date'},
                    {label: '第几个周几', value: 'nth'},
                    {label: '最后一天', value: 'last'},
                ]}/>
                {dayType === 'date' && <div className="rt-rule-row">
                    <InputNumber min={1} max={31} value={date} onChange={(n) => setDate(n ?? 1)} style={{width: 76}}/>
                    <SegLabel>号{date > 28 ? '（没有这天的月份按最后一天）' : ''}</SegLabel>
                </div>}
                {dayType === 'nth' && <div className="rt-rule-row">
                    <Select value={nth} style={{width: 104}} onChange={setNth}
                            options={[1, 2, 3, 4, -1].map((n) => ({label: NTH_TEXT[n], value: n}))}/>
                    <Select value={nthWd} style={{width: 88}} onChange={setNthWd}
                            options={WEEK_ORDER.map((w) => ({label: WEEKDAY[w], value: w}))}/>
                </div>}
            </>}

            {mode === 'after' && <div className="rt-rule-row">
                <SegLabel>每次做完后</SegLabel>
                <InputNumber min={1} max={3650} value={afterDays} onChange={(n) => setAfterDays(n ?? 1)} style={{width: 84}}/>
                <SegLabel>天再刷新</SegLabel>
            </div>}

            {periodic && <div className="rt-rule-more">
                <div className="rt-rule-row">
                    <SegLabel>{mode === 'after' ? '第一次' : '从'}</SegLabel>
                    <DatePicker allowClear={false} value={dayjs(start)} style={{width: 140}}
                                onChange={(d) => d && setStart(d.format(DATE_FMT))}/>
                    <SegLabel>{mode === 'after' ? '开始' : '起算'}</SegLabel>
                </div>
                <div className="rt-rule-row">
                    <SegLabel>宽限</SegLabel>
                    <InputNumber min={0} max={365} value={grace} placeholder="0" onChange={(n) => setGrace(n)} style={{width: 76}}/>
                    <SegLabel>天</SegLabel>
                </div>
                <div className="rt-rule-hint">
                    {grace ? `刷新后 ${grace} 天内做完都不算逾期。` : '刷新当天没做完，第二天起算逾期。'}
                </div>
            </div>}

            {periodic && !invalid && <div className="rt-rule-preview">
                {mode === 'after'
                    ? <>第一次 <b>{shortDate(start)}</b>，之后每次做完再过 {afterDays || 1} 天刷新</>
                    : preview.length
                        ? <>
                            {current && current !== preview[0] && <>这一期 <b className="rt-rule-cur">{shortDate(current)} {WEEKDAY[dayjs(current).day()]}</b> 起，</>}
                            接下来刷新：{preview.filter((d) => d !== current).slice(0, 3).map((d) => <b key={d}>{shortDate(d)} {WEEKDAY[dayjs(d).day()]}</b>)}
                        </>
                        : '没有符合的日期'}
            </div>}
        </div>
        <Button type="primary" block disabled={!changed || invalid} onClick={() => props.onApply(next)}>
            {next ? `应用：${describeRule(next)}${next.kind !== 'manual' && next.grace ? ` · 宽限 ${next.grace} 天` : ''}` : '应用：跟随上级'}
        </Button>
    </div>
}
