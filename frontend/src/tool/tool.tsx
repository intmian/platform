import {ToolType} from "./def";
import {ReactElement, ReactNode, useEffect, useState} from "react";
import {DeleteOutlined, EditOutlined, FileOutlined, PlusOutlined, PythonOutlined} from "@ant-design/icons";
import {Avatar, Button, Card, Flex, Form, Input, message, Modal, Popconfirm, Row, Select, Typography} from "antd";
import {useForm} from "antd/es/form/Form";
import {CreateToolReq, sendCreateTool, sendDeleteTool, sendGetTools, sendGetToolScript} from "../common/newSendHttp";
import {ToolData} from "../common/backHttpDefine";
import {useNavigate} from "react-router-dom";

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
            <Typography.Text type="secondary">新增</Typography.Text>
        </div>
    </Card>
}

export function ToolShow({name, typ, createdAt, updatedAt, onDel, loading, onClickUpdate}: {
    name?: string,
    typ?: ToolType,
    createdAt?: string,
    updatedAt?: string,
    onDel?: () => void,
    loading: boolean,
    onClickUpdate?: () => void
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
                <PlusOutlined/>
            </Row>
            <Row
                style={{justifyContent: 'center'}}
            >
                {updatedStr}
                <EditOutlined/>
            </Row>
        </div>

        <Button type="text" shape="round" onClick={() => {
            if (onClickUpdate) {
                onClickUpdate()
            }
        }}>
            {updateIcon}
        </Button>
        <Popconfirm title={"确认删除?"} onConfirm={onDel}>
            <Button type="text" danger shape="round">
                {deleteIcon}
            </Button>
        </Popconfirm>
    </Card>
}

export function ToolPanelShow({loading, tools, onClickAdd, onClickDel, onOpenToolDetail}: {
    loading: boolean,
    tools: Map<string, ToolData>,
    onClickAdd?: () => void
    onClickDel?: (id: string) => void
    onOpenToolDetail?: (id: string) => void
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
        console.debug('key:', key, 'value:', value)
        cards.push(<ToolShow
            key={key}
            name={value.Name}
            typ={value.Typ}
            createdAt={value.Created}
            updatedAt={value.Updated}
            loading={false}
            onDel={() => {
                if (onClickDel) {
                    onClickDel(key)
                }
            }}
            onClickUpdate={() => {
                if (onOpenToolDetail) {
                    onOpenToolDetail(key)
                }
            }}
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

function AddModel({onFinish}: { onFinish: (name: string | undefined, typ: ToolType | undefined) => void }) {
    const [loading, setLoading] = useState(false)
    const [form] = useForm()
    const [open, setOpen] = useState(true)
    return <Modal
        title="新增工具"
        open={open}
        footer={null}
        onCancel={() => {
            setOpen(false)
            onFinish(undefined, undefined)
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
                                onFinish(values.name, values.typ)
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

export function ToolDetail({id, toolData, onClose}: { id: string, toolData: ToolData, onClose: () => void }) {
    let needContent = false
    const [loaddingContent, setLoadingContent] = useState(false)
    const [content, setContent] = useState('')
    if (toolData.Typ === ToolType.Python) {
        needContent = true
    }
    useEffect(() => {
        setLoadingContent(true)
        if (needContent) {
            const req = {
                ToolID: id
            }
            setLoadingContent(true)
            sendGetToolScript(req, (ret) => {
                if (ret.ok) {
                    setContent(ret.data.Script)
                }
                setLoadingContent(false)
            })
        }
    }, [id, needContent, toolData])
    let contentElement: ReactNode
    if (needContent) {
        contentElement = <Form.Item
            label="内容"
        >
            <Input.TextArea value={content} disabled style={{height: '300px'}}/>
        </Form.Item>
    } else {
        contentElement = <Form.Item
            label="内容"
        >
            <Input value={toolData.Addr} disabled/>
        </Form.Item>
    }
    return <Modal
        title="工具详情"
        open={true}
        footer={null}
        onCancel={onClose}
        width={600}
        style={{
            display: 'flex',
            justifyContent: 'center',
        }}
        maskClosable={false}
    >
        <Form
            layout="horizontal"  // 设置为 horizontal 模式
            labelCol={{span: 6}}  // 标签宽度占 6 列
            wrapperCol={{span: 18}}  // 输入框宽度占 18 列
            style={{margin: '2px', marginBottom: '20px'}}
        >
            <Form.Item
                label="工具名"
            >
                <Input value={toolData.Name} disabled/>
            </Form.Item>
            <Form.Item
                label="类型"
            >
                <Input value={toolData.Typ} disabled/>
            </Form.Item>
            <Form.Item
                label="创建时间"
            >
                <Input value={toolData.Created} disabled/>
            </Form.Item>
            <Form.Item
                label="更新时间"
            >
                <Input value={toolData.Updated} disabled/>
            </Form.Item>
            <Form.Item
                label="内容"
            >
                {loaddingContent ? <Input value={'加载中'} disabled/> : contentElement}
            </Form.Item>
        </Form>
    </Modal>
}

export function ToolPanel({wantOpenID}: { wantOpenID?: string }) {
    // 请求数据
    const [toolData, setToolData] = useState<Map<string, ToolData>>(new Map())
    const [Loading, setLoading] = useState(true)
    const [AddOpen, setAddOpen] = useState(false)
    const [messageApi, messageCtx] = message.useMessage()
    const [UpdateOpen, setUpdateOpen] = useState(false)
    const [UpdateID, setUpdateID] = useState(wantOpenID ? wantOpenID : '')
    const navigate = useNavigate();
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
    }, [messageApi])
    const onClickAdd = () => {
        setAddOpen(true)
    }
    const onClickDel = (id: string) => {
        const req = {
            ToolID: id
        }
        sendDeleteTool(req, (ret) => {
            if (ret.ok) {
                const newToolData = new Map(toolData)
                newToolData.delete(id)
                setToolData(newToolData)
            } else {
                messageApi.error('删除工具失败')
            }
        })
    }
    const onOpenToolDetail = (id: string) => {
        setUpdateOpen(true)
        setUpdateID(id)
    }
    return <>
        {messageCtx}
        <ToolPanelShow loading={Loading} tools={toolData} onClickAdd={onClickAdd} onClickDel={onClickDel}
                       onOpenToolDetail={onOpenToolDetail}/>
        {UpdateOpen ? <ToolDetail id={UpdateID} toolData={toolData.get(UpdateID) as ToolData} onClose={() => {
            setUpdateOpen(false)
            setUpdateID('')
            // 把后面的/打开的ID吃掉。
            navigate('..')
        }}/> : null
        }
        {AddOpen ? <AddModel onFinish={(name, typ) => {
            setAddOpen(false)
            if (name && typ) {
                const newToolData = new Map(toolData)
                // 获得当前时间
                const now = new Date()
                newToolData.set('new', {
                    Name: name,
                    Typ: typ,
                    Content: '',
                    Created: now.toISOString(),
                    Updated: now.toISOString(),
                    Addr: ''
                })
                setToolData(newToolData)
            }
        }}/> : null}
    </>
}