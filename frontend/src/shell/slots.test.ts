import {nextSlots, Slot} from "./slots";

const keep = (id: string) => id !== "admin";

describe("nextSlots", () => {
    it("当前应用排在最前，离开的保活应用留在后台", () => {
        let s: Slot<string>[] = [];
        s = nextSlots(s, "todone", "/todone", keep);
        s = nextSlots(s, "money", "/money", keep);
        expect(s.map((x) => x.appId)).toEqual(["money", "todone"]);
        expect(s[1].location).toBe("/todone");
    });

    it("回到桌面时没有当前应用，后台应用都还在", () => {
        let s = nextSlots<string>([], "todone", "/todone/g/1", keep);
        s = nextSlots(s, undefined, "/", keep);
        expect(s).toEqual([{appId: "todone", location: "/todone/g/1"}]);
    });

    it("不保活的应用离开后立即卸载", () => {
        let s = nextSlots<string>([], "admin", "/admin", keep);
        s = nextSlots(s, "todone", "/todone", keep);
        expect(s.map((x) => x.appId)).toEqual(["todone"]);
    });

    it("后台超过上限时卸载最早用过的", () => {
        let s: Slot<string>[] = [];
        for (const id of ["a", "b", "c", "d", "e"]) s = nextSlots(s, id, "/" + id, keep, 3);
        expect(s.map((x) => x.appId)).toEqual(["e", "d", "c", "b"]);
    });

    it("同一应用内换页只更新它的地址，不重复", () => {
        let s = nextSlots<string>([], "todone", "/todone", keep);
        s = nextSlots(s, "todone", "/todone/g/2", keep);
        expect(s).toEqual([{appId: "todone", location: "/todone/g/2"}]);
    });
});
