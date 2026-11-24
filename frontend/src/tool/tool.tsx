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
import {ToolData} from "../common/backHttpDefine";
import {createTool, deleteTool, getTools, getToolScript, updateTool} from "./cmdApi";

export function ToolAvatar({typ}: { typ?: ToolType }) {
    let typIcon: ReactNode;
    if (typ === ToolType.Python) {
        typIcon = <PythonOutlined/>
    } else if (typ === ToolType.FileExec) {
        typIcon = <FileOutlined/>
    }
    let color: string | undefined;
    let bgColor: string | undefined;
    if (typ === ToolType.Python) {
        color = 'var(--pf-warning)';
        bgColor = 'var(--pf-warning-bg)';
    } else if (typ === ToolType.FileExec) {
        color = 'var(--pf-info)';
        bgColor = 'var(--pf-info-bg)';
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
        <div style={{color: 'var(--pf-text-3)', marginBottom: '5px'}}>
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
        <div style={{color: 'var(--pf-text-3)', marginBottom: '5px'}}>
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
            <Popconfirm title="删除这个工具？" okText="删除" okButtonProps={{danger: true}} cancelText="取消" onConfirm={onDel}>
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

function AddModal({onFinish}: { onFinish: (tool?: { id: string, name: string, typ: ToolType }) => void }) {
    const [loading, setLoading] = useState(false)
    const [form] = Form.useForm<{ name: string, typ: ToolType }>()

    const submit = async (values: { name: string, typ: ToolType }) => {
        setLoading(true)
        try {
            const id = await createTool(values.name, values.typ)
            onFinish({id, name: values.name, typ: values.typ})
        } catch (e) {
            message.error(e instanceof Error ? `新增失败：${e.message}` : '新增失败')
        } finally {
            setLoading(false)
        }
    }

    return <Modal title="新增工具" open footer={null} onCancel={() => onFinish()} width={400} maskClosable={false}>
        <Form form={form} layout="horizontal" labelCol={{span: 6}} wrapperCol={{span: 18}} onFinish={submit}
              style={{marginTop: 16}}>
            <Form.Item label="工具名" name="name" rules={[{required: true, message: '请输入工具名'}]}>
                <Input/>
            </Form.Item>
            <Form.Item label="类型" name="typ" rules={[{required: true, message: '请选择类型'}]}>
                <Select options={TYPE_OPTIONS}/>
            </Form.Item>
            <Form.Item wrapperCol={{offset: 6, span: 18}} style={{marginBottom: 0}}>
                <Button type="primary" htmlType="submit" loading={loading}>提交</Button>
            </Form.Item>
        </Form>
    </Modal>
}

const TYPE_OPTIONS = [
    {value: ToolType.Python, label: 'Python'},
    {value: ToolType.FileExec, label: '可执行文件'},
]

export function ToolDetail({id, toolData, onClose, onChange}: {
    id: string,
    toolData: ToolData,
    onClose: () => void,
    onChange: (name: string) => void
}) {
    const [form] = Form.useForm<{ name: string, content: string }>()
    const [loadingContent, setLoadingContent] = useState(false)
    const [updating, setUpdating] = useState(false)
    const needContent = toolData.Typ === ToolType.Python

    useEffect(() => {
        form.setFieldsValue({name: toolData.Name})
    }, [form, toolData.Name])

    useEffect(() => {
        if (!needContent) return
        let cancelled = false
        setLoadingContent(true)
        getToolScript(id)
            .then((script) => !cancelled && form.setFieldsValue({content: script}))
            .catch((e: Error) => !cancelled && message.error(`读取脚本失败：${e.message}`))
            .finally(() => !cancelled && setLoadingContent(false))
        return () => {
            cancelled = true
        }
    }, [form, id, needContent])

    const submit = async () => {
        const values = form.getFieldsValue()
        setUpdating(true)
        try {
            await updateTool(id, values.name, values.content ?? '')
            message.success('已保存')
            onChange(values.name)
        } catch (e) {
            message.error(e instanceof Error ? `保存失败：${e.message}` : '保存失败')
        } finally {
            setUpdating(false)
        }
    }

    const createdStr = new Date(toolData.Created).toLocaleString('zh-CN', {hour12: false})
    const updatedStr = new Date(toolData.Updated).toLocaleString('zh-CN', {hour12: false})

    return <Modal title="工具详情" open footer={null} onCancel={onClose} maskClosable={false} width={520}>
        <Form layout="horizontal" labelCol={{span: 4}} wrapperCol={{span: 20}} form={form} style={{marginTop: 16}}>
            <Form.Item label="工具名" name="name">
                <Input/>
            </Form.Item>
            <Form.Item label="类型">
                <Select value={toolData.Typ} disabled options={TYPE_OPTIONS}/>
            </Form.Item>
            <Form.Item label="时间">
                <Timeline style={{margin: 0, padding: 0, height: '50px'}}
                          items={[
                              {children: <Typography.Text>{'创建于 ' + createdStr}</Typography.Text>},
                              {children: <Typography.Text>{'修改于 ' + updatedStr}</Typography.Text>},
                          ]}
                />
            </Form.Item>
            {needContent
                ? <Form.Item label="内容" name="content">
                    <Input.TextArea autoSize={{minRows: 4, maxRows: 16}} disabled={loadingContent}
                                    style={{fontFamily: 'monospace'}}/>
                </Form.Item>
                : <Form.Item label="地址">
                    <Input value={toolData.Addr} disabled/>
                </Form.Item>}
            <Form.Item wrapperCol={{offset: 4, span: 20}} style={{marginBottom: 0}}>
                <Button type="primary" onClick={() => void submit()} loading={updating}>保存</Button>
            </Form.Item>
        </Form>
    </Modal>
}

// openID 来自地址 /cmd/tools/:id；打开、关闭详情都是改地址
export function ToolPanel({openID, onOpen, onClose}: {
    openID?: string,
    onOpen: (id: string) => void,
    onClose: () => void,
}) {
    const [tools, setTools] = useState<Map<string, ToolData>>(new Map())
    const [loading, setLoading] = useState(true)
    const [adding, setAdding] = useState(false)

    useEffect(() => {
        let cancelled = false
        getTools()
            .then((data) => !cancelled && setTools(new Map(Object.entries(data))))
            .catch((e: Error) => !cancelled && message.error(`获取工具列表失败：${e.message}`))
            .finally(() => !cancelled && setLoading(false))
        return () => {
            cancelled = true
        }
    }, [])

    const onClickDel = async (id: string) => {
        try {
            await deleteTool(id)
            const next = new Map(tools)
            next.delete(id)
            setTools(next)
        } catch (e) {
            message.error(e instanceof Error ? `删除失败：${e.message}` : '删除失败')
        }
    }

    const openTool = openID ? tools.get(openID) : undefined

    return <>
        <ToolPanelShow loading={loading} tools={tools} onClickAdd={() => setAdding(true)}
                       onClickDel={(id) => void onClickDel(id)} onOpenToolDetail={onOpen}/>
        {openID && openTool && <ToolDetail
            id={openID}
            toolData={openTool}
            onClose={onClose}
            onChange={(name) => {
                const next = new Map(tools)
                next.set(openID, {...openTool, Name: name, Updated: new Date().toISOString()})
                setTools(next)
            }}
        />}
        {adding && <AddModal onFinish={(tool) => {
            setAdding(false)
            if (!tool) return
            const now = new Date().toISOString()
            const next = new Map(tools)
            next.set(tool.id || 'new', {Name: tool.name, Typ: tool.typ, Content: '', Created: now, Updated: now, Addr: ''})
            setTools(next)
        }}/>}
    </>
}
