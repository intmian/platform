import {PDirTree, PGroup} from "./net/protocal";

// Todone 的站内地址。分组只认 ID，目录链、标题、类型都从目录树里查，地址里不带。
//   /todone          关注
//   /todone/g/<id>   分组

export const TODONE_BASE = "/todone";

export function todoneGroupPath(groupId: number) {
    return `${TODONE_BASE}/g/${groupId}`;
}

// g/:groupId 里的 ID，不是正整数就返回 null
export function parseGroupIdParam(raw: string | undefined): number | null {
    if (!raw || !/^\d+$/.test(raw)) return null;
    const id = Number(raw);
    return Number.isSafeInteger(id) && id > 0 ? id : null;
}

// 旧地址：/todone/<encodeURIComponent("dir-1/dir-5/grp-12|标题|2")>，iOS 主屏幕图标还在用。
// 取地址部分最后一个 grp-N。react-router 给的参数已经解码过一次，这里兼容没解码的情况。
export function parseLegacyGroupParam(raw: string | undefined): number | null {
    if (!raw) return null;
    let text = raw;
    if (/%[0-9a-fA-F]{2}/.test(text)) {
        try {
            text = decodeURIComponent(text);
        } catch {
            // 解不开就按原样找
        }
    }
    const addr = text.split("|")[0];
    let id: number | null = null;
    for (const unit of addr.split("/")) {
        const m = /^grp-(\d+)$/.exec(unit.trim());
        if (m) id = parseGroupIdParam(m[1]);
    }
    return id;
}

export interface GroupLocation {
    group: PGroup;
    dirIDs: number[];     // 从根目录到所在目录
    dirTitles: string[];  // 不含根目录
}

// 在目录树里找分组。删掉的目录（前端标记的 Delete）不算。
export function findGroupInTree(tree: PDirTree | null, groupId: number): GroupLocation | null {
    if (!tree) return null;
    const walk = (node: PDirTree, dirIDs: number[], dirTitles: string[]): GroupLocation | null => {
        if (node.Delete) return null;
        const ids = [...dirIDs, node.RootDir.ID];
        const group = (node.ChildrenGrp ?? []).find((g) => g.ID === groupId);
        if (group) return {group, dirIDs: ids, dirTitles};
        for (const child of node.ChildrenDir ?? []) {
            const hit = walk(child, ids, [...dirTitles, child.RootDir.Title]);
            if (hit) return hit;
        }
        return null;
    };
    return walk(tree, [], []);
}
