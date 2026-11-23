// Todone 给外壳（桌面、⌘K）用的接口。外壳按需动态引入这个文件，不会把整个 Todone 打进首屏。
import {post} from "../common/api";
import {PDirTree} from "./net/protocal";

export interface TodoneGroupEntry {
    title: string;
    path: string;     // 站内地址
    dirPath: string;  // 所在目录，给搜索结果当副标题
    type: number;     // GroupType
}

export function todoneGroupPath(groupId: number) {
    return `/todone/g/${groupId}`;
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
}

// 桌面“今天”卡片的数据：只看关注页收藏范围内的事，规则和关注页上半部分一致
export async function loadTodayDigest(_user: string): Promise<TodayDigest | null> {
    return null;
}
