import dayjs, {Dayjs} from "dayjs";

/**
 * 例行清单的刷新规则与“这一期”判定。
 *
 * 只有设了规则的那一层（清单 / 分组 / 子分组 / 事项）才有周期，称为“节奏层”。
 * 继承它的子项只是普通勾选框：节奏层到了刷新日，所有继承它的子项一起清空、重新开始。
 *
 * 规则：
 * - manual：只在清空重来时刷新（出门清单）。
 * - day：每 N 天。
 * - week：每 N 周的若干个星期几（周一为一周的开始）。
 * - month：每 N 个月（1/2/3/4/6/12，按自然年对齐），周期内第 offset 个月，几号 / 最后一天 / 第 n 个星期几。
 * - after：完成后 N 天刷新（顺延）。
 * 所有周期规则都有 start（从哪天起算）和可选的 grace（宽限天数，期内不算逾期）。
 *
 * 标记（Mark）：
 * - 继承节奏的叶子：勾选时刻 ISO；勾选日期 >= 本期开始日才算勾上，刷新无需写库。
 * - 节奏层：`完成的那一期开始日|完成日`。用于“完成后 N 天”的下次刷新、单项节奏的勾选和连续未完成的计数。
 */

export type DaySpec =
    | { type: 'date', date: number } // 几号，没有这天的月份按最后一天
    | { type: 'last' }
    | { type: 'nth', nth: number, weekday: number }; // nth=-1 表示最后一个；weekday 0=周日

export interface ManualRule {
    kind: 'manual'
}

interface PeriodicBase {
    start: string // 从哪天起算
    grace?: number // 宽限天数
}

export interface DayRule extends PeriodicBase {
    kind: 'day'
    every: number
}

export interface WeekRule extends PeriodicBase {
    kind: 'week'
    every: number
    weekdays: number[] // 0=周日
}

export interface MonthRule extends PeriodicBase {
    kind: 'month'
    every: number // 1/2/3/4/6/12
    offset: number // 周期内第几个月（0 起）；每年时就是月份
    day: DaySpec
}

export interface AfterRule extends PeriodicBase {
    kind: 'after'
    days: number
}

export type PeriodicRule = DayRule | WeekRule | MonthRule | AfterRule;
export type RoutineRule = ManualRule | PeriodicRule;

export const DATE_FMT = 'YYYY-MM-DD';
export const MANUAL_RULE: RoutineRule = {kind: 'manual'};
export const MONTH_EVERY = [1, 2, 3, 4, 6, 12];
export const WEEKDAY = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
export const NTH_TEXT: Record<number, string> = {1: '第一个', 2: '第二个', 3: '第三个', 4: '第四个', [-1]: '最后一个'};
const SCAN_DAYS = 800; // 最长周期（每年）+ 余量
const COUNT_DAYS = 1100; // 连续未完成最多回看约 3 年

export function todayStr(): string {
    return dayjs().format(DATE_FMT);
}

const int = (v: unknown, min: number, max: number): number | undefined => {
    const n = Number(v);
    if (!Number.isFinite(n)) return undefined;
    const i = Math.floor(n);
    return i < min || i > max ? undefined : i;
};

function parseDay(raw: any): DaySpec | null {
    if (raw?.type === 'last') return {type: 'last'};
    if (raw?.type === 'date') {
        const date = int(raw.date, 1, 31);
        return date === undefined ? null : {type: 'date', date};
    }
    if (raw?.type === 'nth') {
        const nth = int(raw.nth, -1, 4);
        const weekday = int(raw.weekday, 0, 6);
        return nth === undefined || nth === 0 || weekday === undefined ? null : {type: 'nth', nth, weekday};
    }
    return null;
}

/** 解析规则；非法或旧格式返回 null（按继承处理）。 */
export function parseRule(raw: string | undefined | null): RoutineRule | null {
    if (!raw) return null;
    let r: any;
    try {
        r = JSON.parse(raw);
    } catch {
        return null;
    }
    if (r?.kind === 'manual') return MANUAL_RULE;
    if (!dayjs(r?.start).isValid()) return null;
    const base: PeriodicBase = {start: dayjs(r.start).format(DATE_FMT)};
    const grace = int(r.grace, 0, 365);
    if (grace) base.grace = grace;
    switch (r.kind) {
        case 'day': {
            const every = int(r.every, 1, 999);
            return every ? {kind: 'day', every, ...base} : null;
        }
        case 'week': {
            const every = int(r.every, 1, 99);
            const weekdays = Array.isArray(r.weekdays)
                ? Array.from(new Set<number>(r.weekdays.map((w: unknown) => int(w, 0, 6)).filter((w: number | undefined) => w !== undefined))).sort()
                : [];
            return every && weekdays.length ? {kind: 'week', every, weekdays, ...base} : null;
        }
        case 'month': {
            const every = int(r.every, 1, 12);
            const day = parseDay(r.day);
            if (!every || !MONTH_EVERY.includes(every) || !day) return null;
            const offset = int(r.offset, 0, every - 1) ?? 0;
            return {kind: 'month', every, offset, day, ...base};
        }
        case 'after': {
            const days = int(r.days, 1, 3650);
            return days ? {kind: 'after', days, ...base} : null;
        }
    }
    return null;
}

export function stringifyRule(rule: RoutineRule | null): string {
    return rule ? JSON.stringify(rule) : '';
}

export function sameRule(a: RoutineRule | null, b: RoutineRule | null): boolean {
    return stringifyRule(a) === stringifyRule(b);
}

// ---------------- 描述 ----------------

/** 周一在前的星期顺序。 */
export const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];

function weekdayList(wds: number[]): string {
    const sorted = WEEK_ORDER.filter((w) => wds.includes(w));
    if (sorted.length === 7) return '天';
    if (sorted.length === 5 && !sorted.includes(0) && !sorted.includes(6)) return '个工作日';
    return '周' + sorted.map((w) => '一二三四五六日'[(w + 6) % 7]).join('、');
}

export function monthEveryText(every: number): string {
    switch (every) {
        case 1:
            return '每月';
        case 3:
            return '每季度';
        case 6:
            return '每半年';
        case 12:
            return '每年';
        default:
            return `每 ${every} 个月`;
    }
}

export function daySpecText(day: DaySpec): string {
    if (day.type === 'date') return `${day.date} 号`;
    if (day.type === 'last') return '最后一天';
    return `${NTH_TEXT[day.nth]}${WEEKDAY[day.weekday]}`;
}

export function describeRule(rule: RoutineRule): string {
    switch (rule.kind) {
        case 'manual':
            return '手动重置';
        case 'day':
            return rule.every === 1 ? '每天' : `每 ${rule.every} 天`;
        case 'week': {
            const list = weekdayList(rule.weekdays);
            if (rule.every === 1) return list === '天' ? '每天' : `每${list}`;
            return `每 ${rule.every} 周的${list}`;
        }
        case 'month': {
            // 数字两侧留空格，汉字之间不留
            const sep = rule.day.type === 'date' ? ' ' : '';
            if (rule.every === 1) return `每月${sep}${daySpecText(rule.day)}`;
            if (rule.every === 12) return `每年 ${rule.offset + 1} 月${sep}${daySpecText(rule.day)}`;
            // 季度、半年等直接列出月份，比“每季度第 2 个月”更直观也更短
            const months = Array.from({length: 12 / rule.every}, (_, i) => rule.offset + 1 + i * rule.every);
            return `${months.join('/')} 月${sep}${daySpecText(rule.day)}`;
        }
        case 'after':
            return `完成后 ${rule.days} 天`;
    }
}

export function shortDate(d: string | Dayjs): string {
    const x = dayjs(d);
    return x.isSame(dayjs(), 'year') ? x.format('M/D') : x.format('YYYY/M/D');
}

// ---------------- 刷新日 ----------------

const mondayOf = (d: Dayjs) => d.subtract((d.day() + 6) % 7, 'day');

function matchDay(day: DaySpec, d: Dayjs): boolean {
    const dim = d.daysInMonth();
    switch (day.type) {
        case 'date':
            return d.date() === Math.min(day.date, dim);
        case 'last':
            return d.date() === dim;
        case 'nth':
            if (d.day() !== day.weekday) return false;
            if (day.nth === -1) return d.date() + 7 > dim;
            return Math.ceil(d.date() / 7) === day.nth;
    }
}

/** d 是否为刷新日（只用于日历类规则）。 */
export function isRefreshDay(rule: PeriodicRule, d: Dayjs): boolean {
    const start = dayjs(rule.start).startOf('day');
    if (d.isBefore(start, 'day')) return false;
    switch (rule.kind) {
        case 'day':
            return d.diff(start, 'day') % rule.every === 0;
        case 'week': {
            if (!rule.weekdays.includes(d.day())) return false;
            const weeks = Math.round(mondayOf(d).diff(mondayOf(start), 'day') / 7);
            return weeks % rule.every === 0;
        }
        case 'month': {
            const m = d.year() * 12 + d.month();
            if ((((m - rule.offset) % rule.every) + rule.every) % rule.every !== 0) return false;
            return matchDay(rule.day, d);
        }
        case 'after':
            return false;
    }
}

/** <= t 的最近一个刷新日。 */
function prevRefresh(rule: PeriodicRule, t: Dayjs): Dayjs | null {
    const start = dayjs(rule.start).startOf('day');
    let d = t;
    for (let i = 0; i < SCAN_DAYS && !d.isBefore(start, 'day'); i++, d = d.subtract(1, 'day')) {
        if (isRefreshDay(rule, d)) return d;
    }
    return null;
}

/** > t 的下一个刷新日。 */
function nextRefresh(rule: PeriodicRule, t: Dayjs): Dayjs | null {
    const start = dayjs(rule.start).startOf('day');
    let d = t.add(1, 'day');
    if (d.isBefore(start, 'day')) d = start;
    for (let i = 0; i < SCAN_DAYS; i++, d = d.add(1, 'day')) {
        if (isRefreshDay(rule, d)) return d;
    }
    return null;
}

/** (a, b) 之间的刷新日个数。 */
function countRefresh(rule: PeriodicRule, a: Dayjs, b: Dayjs): number {
    let n = 0;
    let d = a.add(1, 'day');
    for (let i = 0; i < COUNT_DAYS && d.isBefore(b, 'day'); i++, d = d.add(1, 'day')) {
        if (isRefreshDay(rule, d)) n++;
    }
    return n;
}

/** 从 from（含）起接下来 n 个刷新日，用于编辑器预览。 */
export function upcomingRefresh(rule: PeriodicRule, n: number, from: string = todayStr()): string[] {
    if (rule.kind === 'after') return [];
    const out: string[] = [];
    let d: Dayjs | null = dayjs(from).startOf('day').subtract(1, 'day');
    while (out.length < n && d) {
        d = nextRefresh(rule, d);
        if (d) out.push(d.format(DATE_FMT));
    }
    return out;
}

// ---------------- 这一期 ----------------

export function splitMark(mark: string): { round: string, done: string } {
    const [round, done] = (mark || '').split('|');
    return {round: round ?? '', done: done ?? ''};
}

export type RoundPhase = 'manual' | 'waiting' | 'today' | 'grace' | 'overdue' | 'done';

export interface Round {
    manual: boolean
    waiting: boolean // 第一期还没到
    start?: string // 这一期开始（刷新）日；waiting 时为第一期的日期
    deadline?: string // 这一天之后算逾期
    next?: string // 下一个刷新日（after 规则只在完成后已知）
    markDone: boolean // 节奏层标记显示这一期已完成
    missed: number // 这一期之前连续未完成的期数
}

/** 根据节奏层的规则和标记，算出它当前所处的这一期。 */
export function evalRound(rule: RoutineRule, mark: string, today: string = todayStr()): Round {
    if (rule.kind === 'manual') return {manual: true, waiting: false, markDone: false, missed: 0};
    const t = dayjs(today).startOf('day');
    const m = splitMark(mark);
    const grace = rule.grace ?? 0;

    if (rule.kind === 'after') {
        let start: Dayjs;
        let markDone = false;
        let next: string | undefined;
        if (m.done) {
            const due = dayjs(m.done).add(rule.days, 'day');
            if (due.isAfter(t, 'day')) {
                start = dayjs(m.round || m.done);
                markDone = true;
                next = due.format(DATE_FMT);
            } else {
                start = due;
            }
        } else {
            // `开始日|`：这一期从开始日起、还没做（取消勾选时写入）
            start = dayjs(m.round && dayjs(m.round).isValid() ? m.round : rule.start);
        }
        if (start.isAfter(t, 'day')) return {manual: false, waiting: true, start: start.format(DATE_FMT), markDone: false, missed: 0};
        return {
            manual: false, waiting: false, markDone, missed: 0, next,
            start: start.format(DATE_FMT),
            deadline: start.add(grace, 'day').format(DATE_FMT),
        };
    }

    const cur = prevRefresh(rule, t);
    if (!cur) {
        const first = nextRefresh(rule, t);
        return {manual: false, waiting: true, start: first?.format(DATE_FMT), markDone: false, missed: 0};
    }
    const next = nextRefresh(rule, cur);
    const gap = next ? next.diff(cur, 'day') : Infinity;
    const start = cur.format(DATE_FMT);
    const base = m.round && dayjs(m.round).isValid() ? dayjs(m.round) : dayjs(rule.start).subtract(1, 'day');
    return {
        manual: false, waiting: false,
        start,
        deadline: cur.add(Math.min(grace, gap - 1), 'day').format(DATE_FMT),
        next: next?.format(DATE_FMT),
        markDone: m.round === start,
        missed: base.isBefore(cur, 'day') ? countRefresh(rule, base, cur) : 0,
    };
}

/** 继承节奏的叶子是否勾上：勾选发生在这一期开始之后才算。 */
export function leafChecked(round: Round, leafMark: string): boolean {
    if (!leafMark) return false;
    if (round.manual) return true;
    if (round.waiting || !round.start) return false;
    return dayjs(leafMark).format(DATE_FMT) >= round.start;
}

export interface RoundView {
    phase: RoundPhase
    label: string
    missed: number
}

/** 节奏层的状态文案。done 为这一期是否已完成。 */
export function roundView(round: Round, done: boolean, today: string = todayStr()): RoundView {
    if (round.manual) return {phase: 'manual', label: '', missed: 0};
    if (round.waiting) return {phase: 'waiting', label: round.start ? `${shortDate(round.start)} 开始` : '未开始', missed: 0};
    const missed = round.missed;
    if (done) return {phase: 'done', label: round.next ? `下次 ${shortDate(round.next)}` : '已完成', missed: 0};
    const t = dayjs(today).startOf('day');
    const dl = dayjs(round.deadline);
    const left = dl.diff(t, 'day');
    if (left < 0) return {phase: 'overdue', label: `逾期 ${-left} 天`, missed};
    if (left === 0) return {phase: 'today', label: round.start === today ? '今天' : '今天截止', missed};
    return {phase: 'grace', label: `还剩 ${left} 天`, missed};
}

/**
 * 取消“这一期已完成”时写入的标记：只把这一期改回没做，不丢之前的记录。
 * 日历规则记为上一期已完成（不凭空产生“前 N 期没做”）；完成后 N 天的规则保留这一期的开始日。
 */
export function undoneMark(rule: RoutineRule, round: Round): string {
    if (rule.kind === 'manual' || !round.start) return '';
    if (rule.kind === 'after') return `${round.start}|`;
    const prev = prevRefresh(rule, dayjs(round.start).subtract(1, 'day'));
    return prev ? `${prev.format(DATE_FMT)}|${prev.format(DATE_FMT)}` : '';
}

/** 节奏层这一期完成时写入的标记。 */
export function doneMark(round: Round, today: string = todayStr()): string {
    return `${round.start ?? today}|${today}`;
}
