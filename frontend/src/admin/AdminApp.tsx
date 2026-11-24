import {ReactNode} from "react";
import {Navigate, Outlet, Route, Routes} from "react-router-dom";
import {
    BarChartOutlined,
    DashboardOutlined,
    DatabaseOutlined,
    FileTextOutlined,
    LineChartOutlined,
    SettingOutlined,
    TeamOutlined,
} from "@ant-design/icons";
import {MenuPlus, MenuPlusItem, useSectionKey} from "../common/MenuPlus";
import {useAppTitle} from "../shell/runtime";
import {useAuth} from "../common/loginCtx";
import {UserOutlined} from "@ant-design/icons";
import {appById} from "../shell/apps";
import {AppGlyph} from "../shell/AppTile";
import {Monitor} from "./Monitor";
import {Config} from "./Config";
import {Log} from "./Log";
import {AccountAdmin} from "./AccountAdmin";
import Performance from "./Performance";
import Setting from "./Setting";
import BiLog from "./BiLog";

interface Section extends MenuPlusItem {
    label: string;
    element: ReactNode;
    // 有子路由（设置页的分类）
    nested?: boolean;
}

const SECTIONS: Section[] = [
    {key: "monitor", label: "监控", icon: <DashboardOutlined/>, element: <Monitor/>, group: "运行"},
    {key: "performance", label: "性能", icon: <LineChartOutlined/>, element: <Performance/>, group: "运行"},
    {key: "log", label: "日志", icon: <FileTextOutlined/>, element: <Log/>, group: "运行"},
    {key: "bi", label: "BI 日志", icon: <BarChartOutlined/>, element: <BiLog/>, group: "运行"},
    {key: "db", label: "后台数据", icon: <DatabaseOutlined/>, element: <Config/>, group: "数据"},
    {key: "account", label: "账号", icon: <TeamOutlined/>, element: <AccountAdmin/>, group: "数据"},
    {key: "setting", label: "设置", icon: <SettingOutlined/>, element: <Setting/>, nested: true, group: "设置"},
];

function AdminLayout() {
    const key = useSectionKey();
    // 每一页自己用 PageHeader 画标题行和操作按钮，内容放进 PageCard
    const section = SECTIONS.find((s) => s.key === key);
    useAppTitle(section?.label);
    const app = appById("admin");
    const user = useAuth().loginInfo.usr;
    return <MenuPlus title="管理后台" logo={app && <AppGlyph app={app} size={28}/>}
                     footer={<span><UserOutlined/> {user}</span>} items={SECTIONS} activeKey={key}>
        <Outlet/>
    </MenuPlus>;
}

export default function AdminApp() {
    return <Routes>
        <Route element={<AdminLayout/>}>
            <Route index element={<Navigate to="monitor" replace/>}/>
            {SECTIONS.map((s) => <Route key={s.key} path={s.nested ? `${s.key}/*` : s.key} element={s.element}/>)}
            <Route path="*" element={<Navigate to="monitor" replace/>}/>
        </Route>
    </Routes>;
}
