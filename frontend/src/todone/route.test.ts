import {describe, expect, it} from "vitest";
import {findGroupInTree, parseGroupIdParam, parseLegacyGroupParam, todoneGroupPath} from "./route";
import {PDirTree} from "./net/protocal";

describe("parseGroupIdParam", () => {
    it("只认正整数", () => {
        expect(parseGroupIdParam("12")).toBe(12);
        expect(parseGroupIdParam("0")).toBeNull();
        expect(parseGroupIdParam("-3")).toBeNull();
        expect(parseGroupIdParam("1.5")).toBeNull();
        expect(parseGroupIdParam("abc")).toBeNull();
        expect(parseGroupIdParam("")).toBeNull();
        expect(parseGroupIdParam(undefined)).toBeNull();
    });
});

describe("parseLegacyGroupParam", () => {
    const legacy = "dir-1/dir-5/grp-12|读书 | 清单|2";

    it("已解码的参数", () => {
        expect(parseLegacyGroupParam(legacy)).toBe(12);
    });

    it("没解码的参数", () => {
        expect(parseLegacyGroupParam(encodeURIComponent(legacy))).toBe(12);
    });

    it("取最后一个 grp", () => {
        expect(parseLegacyGroupParam("dir-1/grp-3/grp-9|x|0")).toBe(9);
    });

    it("只有地址没有标题", () => {
        expect(parseLegacyGroupParam("dir-1/grp-7")).toBe(7);
    });

    it("标题里像地址的文字不算", () => {
        expect(parseLegacyGroupParam("dir-1|grp-8|0")).toBeNull();
    });

    it("解码失败时按原样找", () => {
        expect(parseLegacyGroupParam("dir-1/grp-4|100%|0")).toBe(4);
    });

    it("认不出来返回 null", () => {
        expect(parseLegacyGroupParam("")).toBeNull();
        expect(parseLegacyGroupParam(undefined)).toBeNull();
        expect(parseLegacyGroupParam("hello")).toBeNull();
        expect(parseLegacyGroupParam("dir-1/subgrp-3|x|0")).toBeNull();
        expect(parseLegacyGroupParam("dir-1/grp-0|x|0")).toBeNull();
    });

    it("和新地址配合", () => {
        expect(todoneGroupPath(parseLegacyGroupParam(legacy)!)).toBe("/todone/g/12");
    });
});

describe("findGroupInTree", () => {
    const dir = (id: number, title: string, grps: number[], children: PDirTree[] = [], del = false): PDirTree => ({
        RootDir: {ID: id, Title: title, Note: "", Index: 0},
        ChildrenGrp: grps.map((g) => ({ID: g, Title: `g${g}`, Note: "", Index: 0, Type: 0})),
        ChildrenDir: children,
        Delete: del,
    });
    const tree = dir(1, "根", [10], [
        dir(2, "工作", [20, 21], [dir(3, "项目", [30])]),
        dir(4, "删掉的", [40], [], true),
    ]);

    it("根目录下的分组", () => {
        const hit = findGroupInTree(tree, 10)!;
        expect(hit.dirIDs).toEqual([1]);
        expect(hit.dirTitles).toEqual([]);
        expect(hit.group.Title).toBe("g10");
    });

    it("嵌套目录", () => {
        const hit = findGroupInTree(tree, 30)!;
        expect(hit.dirIDs).toEqual([1, 2, 3]);
        expect(hit.dirTitles).toEqual(["工作", "项目"]);
    });

    it("找不到或在删掉的目录里", () => {
        expect(findGroupInTree(tree, 99)).toBeNull();
        expect(findGroupInTree(tree, 40)).toBeNull();
        expect(findGroupInTree(null, 10)).toBeNull();
    });

    it("后端返回 null 的子列表", () => {
        const t = {...dir(1, "根", []), ChildrenGrp: null, ChildrenDir: null} as unknown as PDirTree;
        expect(findGroupInTree(t, 1)).toBeNull();
    });
});
