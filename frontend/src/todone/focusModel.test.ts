import {describe, expect, it} from "vitest";
import {focusFromOverview} from "./focusModel";
import type {GetOverviewRet, OverviewTask} from "./net/send_back";
import {GroupType, PRoutineNode, PTask, RoutineNodeKind} from "./net/protocal";
import {EmptyGoTimeStr} from "../common/tool";

const TODAY = "2026-11-23";
const day = (offset: number) => {
    const d = new Date(2026, 10, 23 + offset, 12);
    return d.toISOString();
};

let nextID = 100;

function task(p: Partial<PTask> = {}): PTask {
    return {
        ID: nextID++, Title: "t", Note: "", Index: 0, Tags: null, Done: false, ParentID: 0,
        TaskType: 0, Started: true, BeginTime: EmptyGoTimeStr, EndTime: EmptyGoTimeStr, Wait4: "",
        ...p,
    };
}

function ot(t: PTask, groupID = 1, subGroupID = 11): OverviewTask {
    return {GroupID: groupID, SubGroupID: subGroupID, ParentTitle: "", Task: t};
}

function overview(p: Partial<GetOverviewRet>): GetOverviewRet {
    return {
        Groups: [
            {DirID: 1, GroupID: 1, Type: GroupType.Normal, Title: "工作", Path: []},
            {DirID: 1, GroupID: 2, Type: GroupType.Routine, Title: "每日", Path: []},
            {DirID: 1, GroupID: 3, Type: GroupType.Library, Title: "书", Path: []},
        ],
        SubGroups: [
            {ID: 11, GroupID: 1, Title: "A", Index: 1},
            {ID: 12, GroupID: 1, Title: "B", Index: 2},
            {ID: 21, GroupID: 2, Title: "早上", Index: 1},
            {ID: 22, GroupID: 2, Title: "晚上", Index: 2},
        ],
        Tasks: [],
        RoutineNodes: [],
        Favorites: [{GroupID: 1, SubGroupID: 0}, {GroupID: 2, SubGroupID: 0}],
        ...p,
    };
}

const bucketOf = (data: GetOverviewRet, id: number) => {
    const f = focusFromOverview(data, TODAY);
    for (const b of ["overdue", "today", "doing", "soon"] as const) {
        const hit = f[b].find((it) => it.kind === "task" && it.ot.Task.ID === id);
        if (hit) return {bucket: b, label: hit.timing.label};
    }
    return null;
};

describe("普通任务", () => {
    it("没有日期的不进上半部分", () => {
        const t = task();
        expect(bucketOf(overview({Tasks: [ot(t)]}), t.ID)).toBeNull();
    });

    it("按截止日期归栏", () => {
        const late = task({EndTime: day(-2)});
        const due = task({EndTime: day(0)});
        const later = task({EndTime: day(3)});
        const data = overview({Tasks: [ot(late), ot(due), ot(later)]});
        expect(bucketOf(data, late.ID)).toEqual({bucket: "overdue", label: "逾期 2 天"});
        expect(bucketOf(data, due.ID)).toEqual({bucket: "today", label: "今天截止"});
        expect(bucketOf(data, later.ID)?.bucket).toBe("doing");
    });

    it("开始日期", () => {
        const startsToday = task({BeginTime: day(0)});
        const soon = task({BeginTime: day(3)});
        const far = task({BeginTime: day(10)});
        const lateStart = task({BeginTime: day(-2), Started: false});
        const started = task({BeginTime: day(-2), Started: true});
        const data = overview({Tasks: [ot(startsToday), ot(soon), ot(far), ot(lateStart), ot(started)]});
        expect(bucketOf(data, startsToday.ID)).toEqual({bucket: "today", label: "今天开始"});
        expect(bucketOf(data, soon.ID)?.bucket).toBe("soon");
        expect(bucketOf(data, far.ID)).toBeNull();
        expect(bucketOf(data, lateStart.ID)).toEqual({bucket: "overdue", label: "晚开始 2 天"});
        expect(bucketOf(data, started.ID)?.bucket).toBe("doing");
    });

    it("完成的不算", () => {
        const t = task({EndTime: day(0), Done: true});
        expect(bucketOf(overview({Tasks: [ot(t)]}), t.ID)).toBeNull();
    });

    it("只看收藏范围", () => {
        const inA = task({EndTime: day(0)});
        const inB = task({EndTime: day(0)});
        const data = overview({
            Tasks: [ot(inA, 1, 11), ot(inB, 1, 12)],
            Favorites: [{GroupID: 1, SubGroupID: 11}],
        });
        expect(bucketOf(data, inA.ID)?.bucket).toBe("today");
        expect(bucketOf(data, inB.ID)).toBeNull();
        expect(bucketOf(overview({Tasks: [ot(inA)], Favorites: []}), inA.ID)).toBeNull();
    });

    it("娱乐库不参与", () => {
        const t = task({EndTime: day(0)});
        expect(bucketOf(overview({Tasks: [ot(t, 3, 31)], Favorites: [{GroupID: 3, SubGroupID: 0}]}), t.ID)).toBeNull();
    });

    it("逾期越久越靠前", () => {
        const a = task({EndTime: day(-1)});
        const b = task({EndTime: day(-5)});
        const f = focusFromOverview(overview({Tasks: [ot(a), ot(b)]}), TODAY);
        expect(f.overdue.map((it) => it.kind === "task" && it.ot.Task.ID)).toEqual([b.ID, a.ID]);
    });
});

describe("例行清单", () => {
    const node = (kind: RoutineNodeKind, id: number, p: Partial<PRoutineNode> = {}) => ({
        GroupID: 2,
        Node: {Kind: kind, NodeID: id, SubGroupID: 0, Folder: false, Optional: false, Temp: false, Rule: "", Mark: "", PrevMark: "", ...p},
    });
    const daily = JSON.stringify({kind: "day", every: 1, start: "2026-01-01"});

    it("每天的清单今天到期进“今天”", () => {
        const a = task({Title: "刷牙"});
        const data = overview({
            Tasks: [ot(a, 2, 21)],
            RoutineNodes: [node(RoutineNodeKind.Group, 2, {Rule: daily})],
        });
        const f = focusFromOverview(data, TODAY);
        expect(f.today).toHaveLength(1);
        expect(f.today[0].kind).toBe("routine");
        expect(f.today[0].kind === "routine" && f.today[0].title).toBe("每日");
    });

    it("手动节奏不进上半部分", () => {
        const a = task();
        const f = focusFromOverview(overview({Tasks: [ot(a, 2, 21)]}), TODAY);
        expect(Object.values(f).flat()).toHaveLength(0);
    });

    it("只收藏一栏时按那一栏显示，只算那一栏的事项", () => {
        const a = task();
        const b = task();
        const data = overview({
            Tasks: [ot(a, 2, 21), ot(b, 2, 22)],
            RoutineNodes: [node(RoutineNodeKind.Group, 2, {Rule: daily})],
            Favorites: [{GroupID: 2, SubGroupID: 22}],
        });
        const f = focusFromOverview(data, TODAY);
        expect(f.today).toHaveLength(1);
        const it0 = f.today[0];
        expect(it0.kind === "routine" && it0.title).toBe("晚上");
        expect(it0.kind === "routine" && it0.owner.ownLeaves.map((l) => l.task.ID)).toEqual([b.ID]);
    });

    it("这一期做完了不显示", () => {
        const a = task();
        const data = overview({
            Tasks: [ot(a, 2, 21)],
            RoutineNodes: [
                node(RoutineNodeKind.Group, 2, {Rule: daily}),
                node(RoutineNodeKind.Task, a.ID, {SubGroupID: 21, Mark: `${TODAY}T08:00:00+08:00`}),
            ],
        });
        expect(Object.values(focusFromOverview(data, TODAY)).flat()).toHaveLength(0);
    });

    it("事项自己的节奏，昨天没做算逾期", () => {
        const a = task({Title: "浇花"});
        const data = overview({
            Tasks: [ot(a, 2, 21)],
            RoutineNodes: [node(RoutineNodeKind.Task, a.ID, {
                SubGroupID: 21,
                Rule: JSON.stringify({kind: "day", every: 7, start: "2026-11-22"}),
                Mark: "2026-11-15|2026-11-15",
            })],
        });
        const f = focusFromOverview(data, TODAY);
        expect(f.overdue).toHaveLength(1);
        const it0 = f.overdue[0];
        expect(it0.kind === "routine" && it0.title).toBe("浇花");
        expect(it0.kind === "routine" && it0.target).toEqual({taskID: a.ID, subGroupID: 21});
    });
});
