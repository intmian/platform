import {ComponentType, ReactNode} from "react";
import {
    AccountBookOutlined,
    ApiOutlined,
    BugOutlined,
    CalculatorOutlined,
    CodeOutlined,
    HeartOutlined,
    SettingOutlined,
    StarOutlined,
    TranslationOutlined,
} from "@ant-design/icons";
import {lazyWithReload} from "./lazy";

// 应用清单：桌面图标、⌘K 搜索、路由、网页标题、favicon、权限、保活，全部从这里读。
// 加一个应用 = 在这里加一项，并给它写一个入口组件（入口组件里用相对路径的 <Routes> 管自己的子页面）。

export type IconTone = "teal" | "amber" | "blue" | "coral" | "purple" | "pink" | "gray" | "green";

export interface AppIcon {
    image?: string;      // 有插画 logo 的应用用图片
    glyph?: ReactNode;   // 否则用色块 + 图标
    tone: IconTone;
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
    favicon?: string;
    touchIcon?: string;
}

export const APPS: AppDef[] = [
    {
        id: "todone",
        name: "Todone",
        icon: {image: "/icons/todone-192.png", tone: "teal"},
        basePath: "/todone",
        component: lazyWithReload(() => import("../todone/TodoneApp")),
        permissions: ["admin", "todone"],
        keepAlive: true,
        favicon: "/todone-mini.png",
        touchIcon: "/icons/todone-180.png",
    },
    {
        id: "money",
        name: "记账",
        icon: {glyph: <AccountBookOutlined/>, tone: "amber"},
        basePath: "/money",
        component: lazyWithReload(() => import("../money/MoneyApp")),
        keepAlive: true,
    },
    {
        id: "report",
        name: "日报",
        icon: {image: "/icons/report-192.png", tone: "blue"},
        basePath: "/day-report",
        component: lazyWithReload(() => import("../report/ReportApp")),
        permissions: ["admin", "auto", "auto.report"],
        keepAlive: true,
        favicon: "/news-logo-mini.png",
        touchIcon: "/icons/report-180.png",
    },
    {
        id: "subscription",
        name: "订阅",
        icon: {glyph: <ApiOutlined/>, tone: "coral"},
        basePath: "/subscription",
        component: lazyWithReload(() => import("../subscription/SubscriptionPage")),
        keepAlive: true,
    },
    {
        id: "cmd",
        name: "脚本",
        icon: {glyph: <CodeOutlined/>, tone: "gray"},
        basePath: "/cmd",
        component: lazyWithReload(() => import("../tool/CmdApp")),
        permissions: ["admin", "cmd"],
    },
    {
        id: "admin",
        name: "管理",
        icon: {glyph: <SettingOutlined/>, tone: "gray"},
        basePath: "/admin",
        component: lazyWithReload(() => import("../admin/AdminApp")),
        permissions: ["admin"],
    },
    {
        id: "kana",
        name: "假名",
        icon: {glyph: <TranslationOutlined/>, tone: "pink"},
        basePath: "/kana",
        component: lazyWithReload(() => import("../misc/KanaPractice")),
        public: true,
        keepAlive: true,
    },
    {
        id: "loss-fat",
        name: "减脂",
        icon: {glyph: <CalculatorOutlined/>, tone: "green"},
        basePath: "/loss-fat",
        component: lazyWithReload(() => import("../misc/NutritionCalculator")),
        public: true,
    },
    {
        id: "jianxing",
        name: "剑星评分",
        icon: {glyph: <StarOutlined/>, tone: "purple"},
        basePath: "/rate/jianxing",
        component: lazyWithReload(() => import("../library/JianXingTemp").then((m) => ({default: m.JianXing}))),
        public: true,
        hiddenByDefault: true,
    },
    {
        id: "love47",
        name: "纪念日",
        icon: {glyph: <HeartOutlined/>, tone: "pink"},
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
