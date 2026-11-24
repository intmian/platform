import {Navigate, Outlet, Route, Routes, useNavigate, useParams, useResolvedPath} from "react-router-dom";
import {AppstoreOutlined, CloudServerOutlined} from "@ant-design/icons";
import {MenuPlus, MenuPlusItem, useSectionKey} from "../common/MenuPlus";
import {useAppTitle} from "../shell/runtime";
import {appById} from "../shell/apps";
import {AppGlyph} from "../shell/AppTile";
import {ToolPanel} from "./tool";
import {EnvPanel} from "./env";

const SECTIONS: (MenuPlusItem & { label: string })[] = [
    {key: "tools", label: "工具", icon: <AppstoreOutlined/>},
    {key: "env", label: "运行环境", icon: <CloudServerOutlined/>},
];

function CmdLayout() {
    const key = useSectionKey();
    useAppTitle(SECTIONS.find((s) => s.key === key)?.label);
    const app = appById("cmd");
    return <MenuPlus title="脚本" logo={app && <AppGlyph app={app} size={28}/>} items={SECTIONS} activeKey={key}><Outlet/></MenuPlus>;
}

function Tools() {
    const {id} = useParams();
    const navigate = useNavigate();
    // ".." 是布局路由（/cmd），两种地址下都一样
    const base = useResolvedPath("..").pathname.replace(/\/$/, "") + "/tools";
    return <ToolPanel
        openID={id}
        onOpen={(toolID) => navigate(`${base}/${encodeURIComponent(toolID)}`)}
        onClose={() => navigate(base, {replace: true})}
    />;
}

export function Cmd() {
    return <Routes>
        <Route element={<CmdLayout/>}>
            <Route index element={<Navigate to="tools" replace/>}/>
            <Route path="tools" element={<Tools/>}/>
            <Route path="tools/:id" element={<Tools/>}/>
            <Route path="env" element={<EnvPanel/>}/>
            {/* 旧地址 */}
            <Route path="工具/:id?" element={<LegacyTool/>}/>
            <Route path="运行环境" element={<Navigate to="../env" replace/>}/>
            <Route path="*" element={<Navigate to="tools" replace/>}/>
        </Route>
    </Routes>;
}

function LegacyTool() {
    const {id} = useParams();
    return <Navigate to={id ? `../tools/${encodeURIComponent(id)}` : "../tools"} replace/>;
}
