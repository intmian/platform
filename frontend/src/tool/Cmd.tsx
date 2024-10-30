import {useParams} from "react-router-dom";
import {MenuPlus} from "../common/MenuPlus";
import {ToolPanel} from "./tool";
import {ReactElement} from "react";
import {EnvPanel} from "./env";

export function Cmd() {
    const {id} = useParams();
    const MenuMap = new Map<string, ReactElement>();
    MenuMap.set("工具", <ToolPanel wantOpenID={id}/>);
    MenuMap.set("运行环境", <EnvPanel/>);
    return <MenuPlus baseUrl={"/cmd/"} disable={false} label2node={MenuMap}/>
}