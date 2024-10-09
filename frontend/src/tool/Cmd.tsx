import {useParams} from "react-router-dom";
import {MenuPlus} from "../common/MenuPlus";
import {Avatar, Button, Card, Flex, Form, Input, message, Modal, Row, Select, Typography} from "antd";
import {ReactElement, ReactNode, useEffect, useState} from "react";
import {ToolType} from "./def";
import {DeleteOutlined, EditOutlined, FileOutlined, PlusOutlined, PythonOutlined} from "@ant-design/icons";
import {CreateToolReq, sendCreateTool, sendGetTools} from "../common/newSendHttp";
import {ToolData} from "../common/backHttpDefine";
import {useForm} from "antd/es/form/Form";

const {Title, Text} = Typography;
const {Meta} = Card;

export function Cmd() {
    const {open} = useParams();
    const MenuMap = new Map<string, JSX.Element>();
    MenuMap.set("tool", <ToolPanel open={open}/>);
    MenuMap.set("env", <EnvPanel open={open}/>);
    return <MenuPlus baseUrl={"/cmd/"} disable={false} label2node={MenuMap}/>
}

export function ToolAvatar({typ}: { typ?: ToolType }) {
    let typIcon: ReactNode;
    if (typ === ToolType.Python) {
        typIcon = <PythonOutlined/>
    } else if (typ === ToolType.FileExec) {
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

export function ToolAdd({onClick}: { onClick?: () => void }) {
    // 基本和ToolShow一致
    // 但是居中显示一个虚线圆框和一个+号移上去会变亮.
    // 点击后触发onClick
    return <Card
        style={{width: 150, height: 215, textAlign: 'center', borderRadius: '10px', margin: '10px'}}
        hoverable
        onClick={onClick}
    >
        <div style={{marginTop: '50px', marginBottom: '50px'}}>
            <PlusOutlined style={{fontSize: '40px'}}/>
        </div>
        <div style={{color: 'grey', marginBottom: '5px'}}>
            <Text type="secondary">新增</Text>
        </div>
    </Card>
}

export function ToolShow({name, id, typ, createdAt, updatedAt, onDel, loading}: {
    name?: string,
    id?: string,
    typ?: ToolType,
    createdAt?: string,
    updatedAt?: string,
    onDel?: () => void,
    loading: boolean
}) {
    const updateIcon: ReactNode = <EditOutlined/>
    const deleteIcon: ReactNode = <DeleteOutlined/>
    const createdStr = createdAt ? createdAt.substring(0, 10) : "创建时间未知"
    const updatedStr = updatedAt ? updatedAt.substring(0, 10) : "更新时间未知"
    return <Card
        loading={loading}
        style={{width: 150, height: 215, textAlign: 'center', borderRadius: '10px', margin: '10px'}}
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
                {createdStr}
            </Row>
            <Row
                style={{justifyContent: 'center'}}
            >
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

export function ToolPanelShow({loading, tools, onClickAdd}: {
    loading: boolean,
    tools: Map<string, ToolData>,
    onClickAdd?: () => void
}) {
    const cards: ReactElement[] = []
    if (loading) {
        for (let i = 0; i < 8; i++) {
            cards.push(<ToolShow
                key={i}
                loading={true}
            />)
        }
    }

    // 生成卡片
    tools.forEach((value, key) => {
        cards.push(<ToolShow
            key={key}
            name={value.Name}
            typ={value.Typ}
            createdAt={value.CreatedAt}
            updatedAt={value.UpdatedAt}
            loading={false}
        />)
    })

    // 添加一个Add按钮
    if (!loading) {
        cards.push(<ToolAdd key={'os_add'} onClick={onClickAdd}/>)
    }

    return <Flex wrap={"wrap"} gap="small">
        {cards}
    </Flex>
}

function AddModel({onFinish}: { onFinish: () => void }) {
    const [loading, setLoading] = useState(false)
    const [form] = useForm()
    const [open, setOpen] = useState(true)
    return <Modal
        title="新增工具"
        open={open}
        footer={null}
        onCancel={() => {
            setOpen(false)
            onFinish()
        }}
        width={400}
        style={{
            display: 'flex',
            justifyContent: 'center',
        }}
        maskClosable={false}
    >
        <Form
            form={form}
            layout="horizontal"  // 设置为 horizontal 模式
            onFinish={onFinish}
            labelCol={{span: 6}}  // 标签宽度占 6 列
            wrapperCol={{span: 18}}  // 输入框宽度占 18 列
            style={{margin: '2px', marginBottom: '20px'}}
        >
            <Form.Item
                label="工具名"
                name="name"
                rules={[{required: true, message: '请输入工具名'}]}
            >
                <Input/>
            </Form.Item>
            <Form.Item
                label="类型"
                name="typ"
                rules={[{required: true, message: '请输入类型'}]}
            >
                <Select>
                    <Select.Option value={ToolType.Python}>Python</Select.Option>
                    <Select.Option value={ToolType.FileExec}>可执行文件</Select.Option>
                </Select>
            </Form.Item>
            <Form.Item style={
                // 居中
                {
                    display: 'flex',
                    justifyContent: 'center',
                    marginBottom: 0,
                }
            }>
                <Button type="primary" loading={loading} onClick={
                    () => {
                        const values = form.getFieldsValue()
                        const req: CreateToolReq = {
                            Name: values.name,
                            Typ: values.typ
                        }
                        setLoading(true)
                        sendCreateTool(req, (data) => {
                            if (data.ok) {
                                onFinish()
                                setOpen(false)
                            }
                            setLoading(false)
                        })
                    }
                }>提交</Button>
            </Form.Item>
        </Form>
    </Modal>
}

export function ToolPanel() {
    // 请求数据
    const [toolData, setToolData] = useState<Map<string, ToolData>>(new Map())
    const [Loading, setLoading] = useState(true)
    const [AddOpen, setAddOpen] = useState(false)
    const [messageApi, messageCtx] = message.useMessage()
    useEffect(() => {
        const req = {}
        sendGetTools(req, (ret) => {
            if (ret.ok) {
                setToolData(ret.data.ID2ToolData)
                setLoading(false)
            } else {
                messageApi.error('获取工具列表失败')
            }
        })
    }, [])
    const onClickAdd = () => {
        setAddOpen(true)
    }
    return <>
        {messageCtx}
        <ToolPanelShow loading={Loading} tools={toolData} onClickAdd={onClickAdd}/>
        {AddOpen ? <AddModel onFinish={() => {
            setAddOpen(false)
        }}/> : null}
    </>
}

function EnvPanel() {
    return <>
        test EnvPanel
    </>
}