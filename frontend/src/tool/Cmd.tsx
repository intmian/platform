import {useParams} from "react-router-dom";
import {MenuPlus} from "../common/MenuPlus";
import {Card, Flex, Space, Typography} from "antd";
import {ReactNode} from "react";
import {ToolType} from "./def";
import {DeleteOutlined, EditOutlined, PythonOutlined} from "@ant-design/icons";

const {Title} = Typography;

export function Cmd() {
    const {open} = useParams();
    const MenuMap = new Map<string, JSX.Element>();
    MenuMap.set("tool", <ToolPanel open={open}/>);
    MenuMap.set("env", <EnvPanel open={open}/>);
    return <MenuPlus baseUrl={"/cmd/"} disable={false} label2node={MenuMap}/>
}

const ToolFirstLineStyle = {
    display: "flex",
    justifyContent: "flex-start",
    alignItems: "center",
    height: "80%"

}

// 全面靠右，依次排列
const ToolSecondLineStyle = {
    display: "flex",
    justifyContent: "flex-end",
    alignItems: "center",
    height: "20%"
}

const ToolStyle = {
    width: "200px",
    height: "100px"
}

export function Tool({name, id, typ}: { name: string, id: string, typ: ToolType }) {
    let typIcon: ReactNode;
    if (typ === ToolType.Python) {
        typIcon = <PythonOutlined/>
    } else if (typ == ToolType.FileExec) {
        typIcon = <span>FileExec</span>
    }
    const updateIcon: ReactNode = <EditOutlined/>
    const deleteIcon: ReactNode = <DeleteOutlined/>


    return <Card style={ToolStyle}>
        <Space style={ToolFirstLineStyle}>
            {name}
            {typIcon}
        </Space>
        <Flex style={ToolSecondLineStyle}>
            {updateIcon}
            {deleteIcon}
        </Flex>
    </Card>
}

function ToolPanel({open}: { open: string | undefined }) {
    return <>
        test ToolPanel
    </>
}

function EnvPanel({open}: { open: string | undefined }) {
    return <>
        test EnvPanel
    </>
}