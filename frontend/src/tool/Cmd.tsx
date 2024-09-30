import {useParams} from "react-router-dom";
import {MenuPlus} from "../common/MenuPlus";
import {Avatar, Button, Card, Row, Typography} from "antd";
import {ReactNode} from "react";
import {ToolType} from "./def";
import {DeleteOutlined, EditOutlined, FileOutlined, PlusOutlined, PythonOutlined} from "@ant-design/icons";
import {sendGetEnvs} from "../common/newSendHttp";

const {Title, Text} = Typography;
const {Meta} = Card;

export function Cmd() {
    const {open} = useParams();
    const MenuMap = new Map<string, JSX.Element>();
    MenuMap.set("tool", <ToolPanel open={open}/>);
    MenuMap.set("env", <EnvPanel open={open}/>);
    return <MenuPlus baseUrl={"/cmd/"} disable={false} label2node={MenuMap}/>
}

export function ToolAvatar({typ}: { typ: ToolType }) {
    let typIcon: ReactNode;
    if (typ === ToolType.Python) {
        typIcon = <PythonOutlined/>
    } else if (typ == ToolType.FileExec) {
        typIcon = <FileOutlined/>
    }
    let color;
    let bgColor;
    if (typ === ToolType.Python) {
        color = '#f56a00';
        bgColor = '#fde3cf';
    } else if (typ === ToolType.FileExec) {
        color = '#1890ff';
        bgColor = '#e6f7ff';
    }
    return <Avatar
        size={45}
        icon={typIcon}
        style={{marginBottom: '10px', backgroundColor: bgColor, color: color}}
    />
}


export function Tool({name, id, typ, createdAt, updatedAt, onDel}: {
    name: string,
    id: string,
    typ: ToolType,
    createdAt: string | undefined,
    updatedAt: string | undefined
    onDel: () => void
}) {
    const updateIcon: ReactNode = <EditOutlined/>
    const deleteIcon: ReactNode = <DeleteOutlined/>
    const createdStr = createdAt ? createdAt.substring(0, 10) : ""
    const updatedStr = updatedAt ? updatedAt.substring(0, 10) : ""
    return <Card
        style={{width: 150, textAlign: 'center', borderRadius: '10px', margin: '10px'}}
        hoverable
    >
        <ToolAvatar typ={typ}/>
        <div style={{fontWeight: 'bold', fontSize: '16px', marginBottom: '5px'}}>
            {name}
        </div>
        <div style={{color: 'grey', marginBottom: '5px'}}>
            <Row
                style={{justifyContent: 'center'}}
            >
                <PlusOutlined/>
                {createdStr}
            </Row>
            <Row
                style={{justifyContent: 'center'}}
            >
                <EditOutlined/>
                {updatedStr}
            </Row>
        </div>

        <Button type="text" shape="round">
            {updateIcon}
        </Button>
        <Button type="text" danger shape="round">
            {deleteIcon}
        </Button>
    </Card>
}

function ToolPanel() {
    // 请求数据
    sendGetEnvs()
    return <>
        test ToolPanel
    </>
}

function EnvPanel() {
    return <>
        test EnvPanel
    </>
}