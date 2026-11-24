import {appItem, DEFAULT_WIDGETS, defaultLayout, reconcile} from "./store";
import {normalizeUrl} from "./Sheets";
import {APPS} from "../apps";

describe("reconcile", () => {
    it("清单里新加的应用自动补到桌面末尾", () => {
        const layout = {v: 1 as const, grid: [appItem("todone")], dock: [], hiddenApps: [], widgets: []};
        const out = reconcile(layout);
        const ids = out.grid.flatMap((i) => i.kind === "app" ? [i.appId] : []);
        const expected = APPS.filter((a) => !a.hiddenByDefault).map((a) => a.id);
        expect(new Set(ids)).toEqual(new Set(expected));
        expect(ids[0]).toBe("todone");
    });

    it("用户移除的应用不会被补回来", () => {
        const layout = {v: 1 as const, grid: [], dock: [], hiddenApps: ["money"], widgets: []};
        const out = reconcile(layout);
        expect(out.grid.some((i) => i.kind === "app" && i.appId === "money")).toBe(false);
    });

    it("已经不存在的应用被去掉，链接保留", () => {
        const layout = {
            v: 1 as const,
            grid: [appItem("gone"), {id: "link:x", kind: "link" as const, title: "x", url: "/todone/g/1"}],
            dock: [appItem("gone2")],
            hiddenApps: [],
            widgets: [],
        };
        const out = reconcile(layout);
        expect(out.grid.find((i) => i.id === "app:gone")).toBeUndefined();
        expect(out.grid.find((i) => i.id === "link:x")).toBeDefined();
        expect(out.dock).toEqual([]);
    });

    it("旧数据没有小组件列表时补上默认的", () => {
        const old = {v: 1, grid: [], dock: [], hiddenApps: []} as unknown as Parameters<typeof reconcile>[0];
        expect(reconcile(old).widgets).toEqual(DEFAULT_WIDGETS);
    });

    it("默认布局里每个应用只出现一次", () => {
        const l = defaultLayout();
        const ids = [...l.grid, ...l.dock].map((i) => i.id);
        expect(new Set(ids).size).toBe(ids.length);
    });
});

describe("normalizeUrl", () => {
    it("站内路径原样保留", () => {
        expect(normalizeUrl("/todone/g/12")).toBe("/todone/g/12");
    });
    it("本站完整网址转成路径", () => {
        expect(normalizeUrl(window.location.origin + "/money/abc/dashboard?x=1")).toBe("/money/abc/dashboard?x=1");
    });
    it("没写协议的站外网址补 https", () => {
        expect(normalizeUrl("example.com/a")).toBe("https://example.com/a");
    });
    it("空串和乱写的返回 null", () => {
        expect(normalizeUrl("  ")).toBeNull();
        expect(normalizeUrl("http://")).toBeNull();
    });
});
