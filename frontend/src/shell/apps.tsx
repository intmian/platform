import {ComponentType, ReactNode} from "react";
import {BugOutlined} from "@ant-design/icons";
import {lazyWithReload} from "./lazy";

// 应用清单：桌面图标、⌘K 搜索、路由、网页标题、favicon、权限、保活，全部从这里读。
// 加一个应用 = 在这里加一项，并给它写一个入口组件（入口组件里用相对路径的 <Routes> 管自己的子页面）。

export type IconTone = "teal" | "amber" | "blue" | "coral" | "purple" | "pink" | "gray" | "green";

export interface AppIcon {
    image?: string;      // 插画图标（public/icons/<id>-192.png）
    glyph?: ReactNode;   // 没有插画时用色块 + 图标
    tone: IconTone;      // 站内快捷方式的色块用这个颜色
}

export interface AppDef {
    id: string;
    name: string;
    icon: AppIcon;
    basePath: string;
    component: ComponentType;
    // 满足其中一个就能用；不写表示登录即可用
    permissions?: string[];
    // 不登录也能打开（不显示底部横条）
    public?: boolean;
    // 切走后留在后台，切回来不重新加载
    keepAlive?: boolean;
    // 默认不出现在桌面（仍可在“添加”里找回、用 ⌘K 打开）
    hiddenByDefault?: boolean;
    // 只在本地开发时存在
    devOnly?: boolean;
    // 页面底色是灰色（antd 的 layout 底色）。外壳会把整页底色一起换掉，
    // 否则胶囊下面留的空白、手机上拉过头的地方会露出白色
    grayPage?: boolean;
    favicon?: string;    // 标签页图标
    touchIcon?: string;  // 从这个应用添加到 iPhone 主屏时的图标
}

// 插画图标按 id 放在 public/icons/ 下：<id>-192.png 桌面、<id>-32.png 标签页、<id>-180.png iPhone 主屏
function art(id: string, tone: IconTone) {
    return {
        icon: {image: `/icons/${id}-192.png`, tone},
        favicon: `/icons/${id}-32.png`,
        touchIcon: `/icons/${id}-180.png`,
    };
}

export const APPS: AppDef[] = [
    {
        id: "todone",
        name: "Todone",
        ...art("todone", "teal"),
        basePath: "/todone",
        component: lazyWithReload(() => import("../todone/TodoneApp")),
        permissions: ["admin", "todone"],
        keepAlive: true,
    },
    {
        id: "money",
        name: "记账",
        ...art("money", "amber"),
        basePath: "/money",
        component: lazyWithReload(() => import("../money/MoneyApp")),
        keepAlive: true,
        grayPage: true,
    },
    {
        id: "report",
        name: "日报",
        ...art("report", "blue"),
        basePath: "/day-report",
        component: lazyWithReload(() => import("../report/ReportApp")),
        permissions: ["admin", "auto", "auto.report"],
        keepAlive: true,
    },
    {
        id: "subscription",
        name: "订阅",
        ...art("subscription", "coral"),
        basePath: "/subscription",
        component: lazyWithReload(() => import("../subscription/SubscriptionPage")),
        keepAlive: true,
        hiddenByDefault: true, // 基本不用了，新桌面上默认不放
    },
    {
        id: "cmd",
        name: "脚本",
        ...art("cmd", "gray"),
        basePath: "/cmd",
        component: lazyWithReload(() => import("../tool/CmdApp")),
        permissions: ["admin", "cmd"],
        grayPage: true,
    },
    {
        id: "admin",
        name: "管理",
        ...art("admin", "gray"),
        basePath: "/admin",
        component: lazyWithReload(() => import("../admin/AdminApp")),
        permissions: ["admin"],
        grayPage: true,
    },
    {
        id: "kana",
        name: "假名",
        ...art("kana", "pink"),
        basePath: "/kana",
        component: lazyWithReload(() => import("../misc/KanaPractice")),
        public: true,
        keepAlive: true,
    },
    {
        id: "loss-fat",
        name: "减脂",
        ...art("loss-fat", "green"),
        basePath: "/loss-fat",
        component: lazyWithReload(() => import("../misc/NutritionCalculator")),
        public: true,
    },
    {
        id: "jianxing",
        name: "剑星评分",
        ...art("jianxing", "purple"),
        basePath: "/rate/jianxing",
        component: lazyWithReload(() => import("../library/JianXingTemp").then((m) => ({default: m.JianXing}))),
        public: true,
        hiddenByDefault: true,
    },
    {
        id: "love47",
        name: "纪念日",
        ...art("love47", "pink"),
        basePath: "/love47",
        component: lazyWithReload(() => import("../misc/love")),
        public: true,
        hiddenByDefault: true,
    },
    {
        id: "debug",
        name: "组件试验场",
        icon: {glyph: <BugOutlined/>, tone: "gray"},
        basePath: "/debug",
        component: lazyWithReload(() => import("../debug/debug").then((m) => ({default: m.Debug}))),
        permissions: ["admin"],
        hiddenByDefault: true,
        devOnly: true,
        grayPage: true,
    },
].filter((a) => !a.devOnly || import.meta.env.DEV) as AppDef[];

export function appById(id: string): AppDef | undefined {
    return APPS.find((a) => a.id === id);
}

export function findApp(pathname: string): AppDef | undefined {
    return APPS.find((a) => pathname === a.basePath || pathname.startsWith(a.basePath + "/"));
}

export function canUseApp(app: AppDef, hasPermission: (p: string) => boolean): boolean {
    if (!app.permissions || app.permissions.length === 0) return true;
    return app.permissions.some(hasPermission);
}
