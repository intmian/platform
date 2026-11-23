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
    // 表格类页面本身没有底色，放进白色面板；其余页面自带卡片
    panel?: boolean;
    // 有子路由（设置页的分类）
    nested?: boolean;
}

const SECTIONS: Section[] = [
    {key: "monitor", label: "监控", icon: <DashboardOutlined/>, element: <Monitor/>},
    {key: "db", label: "后台数据", icon: <DatabaseOutlined/>, element: <Config/>, panel: true},
    {key: "log", label: "日志", icon: <FileTextOutlined/>, element: <Log/>, panel: true},
    {key: "account", label: "账号", icon: <TeamOutlined/>, element: <AccountAdmin/>},
    {key: "performance", label: "性能", icon: <LineChartOutlined/>, element: <Performance/>},
    {key: "setting", label: "设置", icon: <SettingOutlined/>, element: <Setting/>, nested: true},
    {key: "bi", label: "BI 日志", icon: <BarChartOutlined/>, element: <BiLog/>},
];

function AdminLayout() {
    const key = useSectionKey();
    const section = SECTIONS.find((s) => s.key === key);
    useAppTitle(section?.label);
    return <MenuPlus items={SECTIONS} activeKey={key}>
        {section?.panel ? <div className="pf-section-panel"><Outlet/></div> : <Outlet/>}
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
