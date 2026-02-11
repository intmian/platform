import {ToolType} from "./def";
import {ReactElement, ReactNode, useEffect, useState} from "react";
import {DeleteOutlined, EditOutlined, FileOutlined, PlusOutlined, PythonOutlined} from "@ant-design/icons";
import {
    Avatar,
    Button,
    Card,
    Flex,
    Form,
    Input,
    message,
    Modal,
    Popconfirm,
    Row,
    Select,
    Timeline,
    Tooltip,
    Typography
} from "antd";
import {useForm} from "antd/es/form/Form";
import {
    CreateToolReq,
    sendCreateTool,
    sendDeleteTool,
    sendGetTools,
    sendGetToolScript,
    sendUpdateTool
} from "../common/newSendHttp";
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
        style={{width: 150, height: 200, textAlign: 'center', borderRadius: '10px', margin: '10px'}}
        hoverable
        onClick={onClick}
    >
        <div style={{marginTop: '40px', marginBottom: '50px'}}>
            <PlusOutlined style={{fontSize: '40px'}}/>
        </div>
        <div style={{color: 'grey', marginBottom: '5px'}}>
            <Typography.Text type="secondary">新增</Typography.Text>
        </div>
    </Card>
}

export function ToolShow({name, ID, typ, createdAt, updatedAt, onDel, loading, onClickUpdate}: {
    ID?: string,
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
        style={{width: 150, height: 200, textAlign: 'center', borderRadius: '10px', margin: '10px'}}
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
        <Tooltip title="修改具体数据">
            <Button type="text" size={"small"} onClick={() => {
                if (onClickUpdate) {
                    onClickUpdate()
                }
            }}>
                {updateIcon}
            </Button>
        </Tooltip>
        <Tooltip title="复制ID">
            <Button type="text" size={"small"} onClick={() => {
                navigator.clipboard.writeText(ID as string)
            }}>
                <FileOutlined/>
            </Button>
        </Tooltip>
        <Tooltip title="删除">
            <Popconfirm title={"确认删除?"} onConfirm={onDel}>
                <Button type="text" danger size={"small"}>
                    {deleteIcon}
                </Button>
            </Popconfirm>
        </Tooltip>
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
        cards.push(<ToolShow
            key={key}
            ID={key}
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

export function ToolDetail({id, toolData, onClose, onChange}: {
    id: string,
    toolData: ToolData,
    onClose: () => void,
    onChange: (name: string) => void
}) {
    let needContent = false
    const [loaddingContent, setLoadingContent] = useState(false)
    const navigate = useNavigate();
    const [form] = useForm();
    const [updating, setUpdating] = useState(false)
    form.setFieldsValue({
        name: toolData.Name,
        typ: toolData.Typ
    })
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
                    form.setFieldsValue({
                        content: ret.data.Script
                    })
                }
                setLoadingContent(false)
            })
        }
    }, [id, needContent, toolData])
    let contentElement: ReactNode
    if (needContent) {
        contentElement = <Input.TextArea style={{height: '100px'}}/>
    } else {
        contentElement =
            <Input value={toolData.Addr} disabled/>
    }

    // 将golang生成的json时间转换为能看懂的时间 2024-10-15T16:01:46.5010056+08:00 - 》 2024年10月15日 16:01:46
    const createdStr = new Date(toolData.Created).toLocaleString('zh-CN', {hour12: false});
    const updatedStr = new Date(toolData.Updated).toLocaleString('zh-CN', {hour12: false});

    return <Modal
        title="工具详情"
        open={true}
        footer={null}
        onCancel={() => {
            // 把后面的/打开的ID吃掉。
            navigate('/cmd/工具', {replace: true})
            onClose()
        }}
        style={{
            display: 'flex',
            justifyContent: 'center',
        }}
        maskClosable={false}
    >
        <Form
            layout="horizontal"  // 设置为 horizontal 模式
            labelCol={{span: 3}}  // 标签宽度占 6 列
            wrapperCol={{span: 21}}  // 输入框宽度占 18 列
            style={{margin: '2px', width: '400px'}}
            form={form}
        >
            <Form.Item
                label="工具名"
                name="name"
            >
                <Input value={toolData.Name}/>
            </Form.Item>
            <Form.Item
                label="类型"
            >
                <Select value={toolData.Typ} disabled={true}>
                    <Select.Option value={ToolType.Python}>Python</Select.Option>
                    <Select.Option value={ToolType.FileExec}>可执行文件</Select.Option>
                </Select>
            </Form.Item>
            <Form.Item
                label="时间"
            >
                <Timeline style={{margin: 0, padding: 0, height: '50px'}}
                          items={[
                              {
                                  children: <Typography.Text>{'创建于  ' + createdStr}</Typography.Text>
                              },
                              {
                                  children: <Typography.Text>{'修改于  ' + updatedStr}</Typography.Text>
                              }
                          ]}
                />
            </Form.Item>
            <Form.Item
                label="内容"
                name="content"
            >
                {loaddingContent ? <Input.TextArea style={{height: '100px'}} disabled/> : contentElement}
            </Form.Item>
            <Form.Item style={
                // 居中
                {
                    display: 'flex',
                    justifyContent: 'center',
                    marginBottom: 0,
                }
            }>
                <Button type="primary" onClick={() => {
                    // 提交
                    const values = form.getFieldsValue()
                    setUpdating(true)
                    sendUpdateTool({
                        ToolID: id,
                        Name: values.name,
                        Content: values.content
                    }, (ret) => {
                        setUpdating(false)
                        if (ret.ok) {
                            message.success('更新成功')
                            onChange(values.name)
                        } else {
                            message.error('更新失败')
                        }
                    })
                }}
                        loading={updating}
                >提交</Button>
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
    const [UpdateID, setUpdateID] = useState('')
    const navigate = useNavigate();
    const onOpenToolDetail = (id: string) => {
        setUpdateOpen(true)
        setUpdateID(id)
        navigate('/cmd/工具/' + id, {replace: true})
    }
    useEffect(() => {
        if (wantOpenID) {
            navigate('/cmd/工具/' + wantOpenID, {replace: true})
        }
    }, [navigate, wantOpenID]);
    useEffect(() => {
        const req = {}
        sendGetTools(req, (ret) => {
            if (ret.ok) {
                setToolData(ret.data.ID2ToolData)
                setLoading(false)
                if (wantOpenID) {
                    setUpdateOpen(true)
                    setUpdateID(wantOpenID)
                }
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
    return <>
        {messageCtx}
        <ToolPanelShow loading={Loading} tools={toolData} onClickAdd={onClickAdd} onClickDel={onClickDel}
                       onOpenToolDetail={onOpenToolDetail}/>
        {UpdateOpen ? <ToolDetail id={UpdateID} toolData={toolData.get(UpdateID) as ToolData} onClose={() => {
            setUpdateOpen(false)
            setUpdateID('')
        }} onChange={
            (name) => {
                const newToolData = new Map(toolData)
                const tool = newToolData.get(UpdateID) as ToolData
                tool.Name = name
                tool.Updated = new Date().toISOString()
                newToolData.set(UpdateID, tool)
                setToolData(newToolData)
            }
        }/> : null
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

