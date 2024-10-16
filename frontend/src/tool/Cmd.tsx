import {useParams} from "react-router-dom";
import {MenuPlus} from "../common/MenuPlus";
import {ToolPanel} from "./tool";
import {ReactElement} from "react";

export function Cmd() {
    const {id} = useParams();
    const MenuMap = new Map<string, ReactElement>();
    MenuMap.set("tool", <ToolPanel wantOpenID={id}/>);
    MenuMap.set("env", <EnvPanel/>);
    return <MenuPlus baseUrl={"/cmd/"} disable={false} label2node={MenuMap}/>
}

function EnvPanel() {
    return <>
        test EnvPanel
    </>
}