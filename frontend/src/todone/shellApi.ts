// Todone 给外壳（桌面、⌘K）用的接口。外壳按需动态引入这个文件，不会把整个 Todone 打进首屏。
import {post, request} from "../common/api";
import {PDirTree} from "./net/protocal";
import {type GetOverviewRet, todoneLastWriteAt} from "./net/send_back";
import {FocusItem, focusFromOverview, itemDone} from "./focusModel";
import {todoneGroupPath} from "./route";
import {todayStr} from "./routineRule";

export {todoneGroupPath};

export interface TodoneGroupEntry {
    title: string;
    path: string;     // 站内地址
    dirPath: string;  // 所在目录，给搜索结果当副标题
    type: number;     // GroupType
}

export async function listTodoneGroups(user: string): Promise<TodoneGroupEntry[]> {
    const ret = await post<{ DirTree: PDirTree }>("/service/todone/getDirTree", {UserID: user});
    const out: TodoneGroupEntry[] = [];
    const walk = (node: PDirTree, dirs: string[]) => {
        node.ChildrenGrp?.forEach((g) => out.push({
            title: g.Title,
            path: todoneGroupPath(g.ID),
            dirPath: dirs.join(" / ") || "根目录",
            type: g.Type ?? 0,
        }));
        node.ChildrenDir?.forEach((d) => walk(d, [...dirs, d.RootDir.Title]));
    };
    if (ret?.DirTree) walk(ret.DirTree, []);
    return out;
}

export interface TodayDigestItem {
    title: string;
    kind: "overdue" | "today";
    path: string;
}

export interface TodayDigest {
    overdue: number;
    today: number;
    items: TodayDigestItem[]; // 最多几条，逾期在前
    // 按清单地址统计的逾期数，桌面上 Todone 清单快捷方式的角标用
    overdueByPath: Record<string, number>;
}

// 桌面每次切回来、标签页每次回到前台都会刷新卡片，来回切的时候非常频繁（曾经一下午几百次，
// 差点打满 D1 每日额度）。所以 1 分钟内、期间没在 Todone 里改过东西，就直接用上次的结果。
const DIGEST_REUSE_MS = 60 * 1000;
let lastDigest: { user: string; day: string; fetchedAt: number; digest: TodayDigest } | null = null;

// 桌面“今天”卡片的数据：只看关注页收藏范围内的事，规则和关注页上半部分一致
export async function loadTodayDigest(user: string): Promise<TodayDigest | null> {
    const day = todayStr();
    const now = Date.now();
    if (lastDigest && lastDigest.user === user && lastDigest.day === day
        && now - lastDigest.fetchedAt < DIGEST_REUSE_MS && todoneLastWriteAt() < lastDigest.fetchedAt) {
        return lastDigest.digest;
    }
    // 记请求发出的时间而不是返回的时间：请求途中发生的修改，下次就不会被当成已经包含在结果里
    const fetchedAt = now;
    const ret = await request<GetOverviewRet>("/service/todone/getOverview", {UserID: user});
    if (!ret.ok || !ret.data) return null;
    try {
        const focus = focusFromOverview(ret.data, todayStr());
        const overdue = focus.overdue.filter((it) => !itemDone(it));
        const today = focus.today.filter((it) => !itemDone(it));
        const toItem = (it: FocusItem, kind: TodayDigestItem["kind"]): TodayDigestItem => ({
            title: it.kind === "task" ? it.ot.Task.Title : it.title,
            kind,
            path: todoneGroupPath(it.group.GroupID),
        });
        const overdueByPath: Record<string, number> = {};
        overdue.forEach((it) => {
            const path = todoneGroupPath(it.group.GroupID);
            overdueByPath[path] = (overdueByPath[path] ?? 0) + 1;
        });
        const digest: TodayDigest = {
            overdue: overdue.length,
            today: today.length,
            overdueByPath,
            items: [...overdue.map((it) => toItem(it, "overdue")), ...today.map((it) => toItem(it, "today"))].slice(0, DIGEST_MAX),
        };
        lastDigest = {user, day, fetchedAt, digest};
        return digest;
    } catch (e) {
        console.error("[todone] loadTodayDigest", e);
        return null;
    }
}

const DIGEST_MAX = 5;
