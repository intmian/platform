import {useEffect, useState} from "react";
import {
    Badge,
    Button,
    Card,
    Empty,
    Flex,
    Form,
    Input,
    Modal,
    Popover,
    Popconfirm,
    Result,
    Space,
    Spin,
    Switch,
    Tag,
    Typography,
    message
} from "antd";
import {
    CloudSyncOutlined,
    CopyOutlined,
    DeleteOutlined,
    EditOutlined,
    LinkOutlined,
    PlusOutlined,
    RedoOutlined
} from "@ant-design/icons";
import {useLoginGate} from "../common/useLoginGate";
import {useIsMobile} from "../common/hooksv2";
import {
    sendSubscriptionCreate,
    sendSubscriptionCheck,
    sendSubscriptionDelete,
    sendSubscriptionList,
    sendSubscriptionRotate,
    sendSubscriptionUpdate,
    SubscriptionItem,
    SubscriptionListRet,
    SubscriptionMutationRet
} from "../common/newSendHttp";

const {Paragraph, Text, Title} = Typography;

type FormValue = {
    name: string
    upstreamUrl: string
    monitorEnabled: boolean
}

function normalizeShareUrl(shareUrl: string) {
    try {
        return new URL(shareUrl, window.location.origin).toString();
    } catch {
        return shareUrl;
    }
}

function formatCheckStatus(item: SubscriptionItem) {
    switch (item.lastCheckStatus) {
        case "success":
            return <Tag color="success">巡检成功</Tag>;
        case "request_failed":
            return <Tag color="error">请求失败</Tag>;
        case "parse_failed":
            return <Tag color="warning">解析失败</Tag>;
        default:
            return <Tag>尚未巡检</Tag>;
    }
}

function formatRemainDays(days: number, hasExpire: boolean) {
    if (!hasExpire) {
        return "暂无";
    }
    if (days > 0) {
        return `剩 ${days} 天`;
    }
    if (days === 0) {
        return "今天到期";
    }
    return `已过期 ${Math.abs(days)} 天`;
}

function hasCheckResult(item: SubscriptionItem) {
    return Boolean(item.lastCheckAt || item.trafficSummary || item.expireAt || item.lastError);
}

function shouldShowHeaderStatus(item: SubscriptionItem) {
    return !item.monitorEnabled && hasCheckResult(item);
}

function renderMonitorTag(item: SubscriptionItem) {
    if (!item.monitorEnabled) {
        return <Tag>仅代理</Tag>;
    }
    const success = item.lastCheckStatus === "success";
    return <Tag
        bordered
        style={{
            borderRadius: 999,
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            minHeight: 24,
            marginInlineEnd: 0,
            paddingInline: 8,
        }}
    >
        <span style={{fontSize: 12, fontWeight: 500, lineHeight: 1}}>Auto Check</span>
        <Badge status={success ? "success" : "error"}/>
    </Tag>;
}

function LinkLine({label, value}: { label: string, value: string }) {
    return <div style={{minWidth: 0}}>
        <Text type="secondary">{label}</Text>
        <Typography.Text
            ellipsis={{tooltip: value}}
            style={{
                display: "block",
                marginTop: 6,
            }}
        >
            {value}
        </Typography.Text>
    </div>;
}

export default function SubscriptionPage() {
    const {loginReady, isLoggedIn, openLogin, loginPanel} = useLoginGate();
    const isMobile = useIsMobile();
    const [items, setItems] = useState<SubscriptionItem[]>([]);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [modalOpen, setModalOpen] = useState(false);
    const [editingItem, setEditingItem] = useState<SubscriptionItem | null>(null);
    const [actingKey, setActingKey] = useState("");
    const [form] = Form.useForm<FormValue>();

    const loadItems = async () => {
        setLoading(true);
        const ret = await sendSubscriptionList();
        setLoading(false);
        if (!ret.ok) {
            message.error("加载订阅失败");
            return;
        }
        setItems(((ret.data as SubscriptionListRet).items ?? []) as SubscriptionItem[]);
    };

    useEffect(() => {
        if (loginReady && isLoggedIn) {
            loadItems().then();
        }
    }, [loginReady, isLoggedIn]);

    const openCreateModal = () => {
        setEditingItem(null);
        form.setFieldsValue({
            name: "",
            upstreamUrl: "",
            monitorEnabled: false,
        });
        setModalOpen(true);
    };

    const openEditModal = (item: SubscriptionItem) => {
        setEditingItem(item);
        form.setFieldsValue({
            name: item.name,
            upstreamUrl: item.upstreamUrl,
            monitorEnabled: item.monitorEnabled,
        });
        setModalOpen(true);
    };

    const submitForm = async () => {
        const values = await form.validateFields();
        setSaving(true);
        const ret = editingItem
            ? await sendSubscriptionUpdate({
                id: editingItem.id,
                name: values.name,
                upstreamUrl: values.upstreamUrl,
                monitorEnabled: values.monitorEnabled,
            })
            : await sendSubscriptionCreate(values);
        setSaving(false);
        if (!ret.ok) {
            message.error(editingItem ? "更新失败" : "创建失败");
            return;
        }
        const item = (ret.data as SubscriptionMutationRet).item;
        setItems((prev) => {
            if (!editingItem) {
                return [...prev, item].sort((a, b) => a.name.localeCompare(b.name));
            }
            return prev
                .map((current) => current.id === item.id ? item : current)
                .sort((a, b) => a.name.localeCompare(b.name));
        });
        setModalOpen(false);
        message.success(editingItem ? "更新成功" : "创建成功");
    };

    const onDelete = async (id: string) => {
        const ret = await sendSubscriptionDelete({id});
        if (!ret.ok) {
            message.error("删除失败");
            return;
        }
        setItems((prev) => prev.filter((item) => item.id !== id));
        message.success("删除成功");
    };

    const onRotate = async (id: string) => {
        setActingKey(`rotate-${id}`);
        const ret = await sendSubscriptionRotate({id});
        setActingKey("");
        if (!ret.ok) {
            message.error("轮换失败");
            return;
        }
        const item = (ret.data as SubscriptionMutationRet).item;
        setItems((prev) => prev.map((current) => current.id === item.id ? item : current));
        message.success("轮换成功");
    };

    const onManualCheck = async (id: string) => {
        setActingKey(`check-${id}`);
        const ret = await sendSubscriptionCheck({id});
        setActingKey("");
        if (!ret.ok) {
            message.error("巡检失败");
            return;
        }
        const item = (ret.data as SubscriptionMutationRet).item;
        setItems((prev) => prev.map((current) => current.id === item.id ? item : current));
        message.success("巡检完成");
    };

    const onCopy = async (shareUrl: string) => {
        try {
            await navigator.clipboard.writeText(normalizeShareUrl(shareUrl));
            message.success("复制成功");
        } catch {
            message.error("复制失败");
        }
    };

    if (!loginReady) {
        return <Flex align="center" justify="center" style={{minHeight: "100vh"}}>
            <Spin size="large"/>
        </Flex>;
    }

    if (!isLoggedIn) {
        return <div style={{padding: 24}}>
            {loginPanel}
            <Result
                status="403"
                title="需要登录"
                subTitle="订阅管理是用户自管页面，登录后才能查看和维护分享链接。"
                extra={<Button type="primary" onClick={openLogin}>登录</Button>}
            />
        </div>;
    }

    return <div style={{padding: isMobile ? 16 : 24, maxWidth: 1320, margin: "0 auto"}}>
        {loginPanel}
        <Flex justify="space-between" align="center" wrap="wrap" gap="middle" style={{marginBottom: 20}}>
            <div>
                <Flex align="center" gap={8}>
                    <Title level={2} style={{marginBottom: 0}}>订阅管理</Title>
                    <Popover
                        trigger="click"
                        placement="bottomLeft"
                        content={<div style={{maxWidth: 320}}>
                            <div style={{fontWeight: 600, marginBottom: 8}}>巡检说明</div>
                            <div style={{marginBottom: 8}}>每条订阅对应一个上游链接和一个可公开访问的分享链接。</div>
                            <div>只有开启巡检的链接才会每小时自动检查上游链接，并展示上次请求得到的用量百分比和过期剩余时间。</div>
                        </div>}
                    >
                        <Button
                            shape="circle"
                            size="small"
                            style={{fontWeight: 600}}
                        >
                            ?
                        </Button>
                    </Popover>
                </Flex>
            </div>
            <Space>
                <Button onClick={() => loadItems()} loading={loading}>刷新</Button>
                <Button type="primary" icon={<PlusOutlined/>} onClick={openCreateModal}>新增订阅</Button>
            </Space>
        </Flex>
        <Spin spinning={loading}>
            {items.length === 0 ? <Card><Empty description="还没有订阅链接"/></Card> : <div style={{
                display: "grid",
                gridTemplateColumns: isMobile ? "1fr" : "repeat(2, minmax(0, 1fr))",
                gap: 16,
                width: "100%",
            }}>
                {items.map((item) => (
                    <Card
                        key={item.id}
                        style={{height: "100%"}}
                        styles={{body: {height: "100%"}}}
                        title={<Space>
                            <LinkOutlined/>
                            <span>{item.name}</span>
                            {renderMonitorTag(item)}
                        </Space>}
                        extra={<Space size="small">
                            {shouldShowHeaderStatus(item) ? formatCheckStatus(item) : null}
                            <Button type="text" icon={<EditOutlined/>} onClick={() => openEditModal(item)}>
                                编辑
                            </Button>
                        </Space>}
                    >
                        <Flex vertical justify="space-between" style={{height: "100%"}} gap="middle">
                            <Space direction="vertical" style={{width: "100%"}} size="middle">
                                <LinkLine label="上游链接" value={item.upstreamUrl}/>
                                <LinkLine label="分享链接" value={normalizeShareUrl(item.shareUrl)}/>
                            {(item.monitorEnabled || hasCheckResult(item)) ? <Flex wrap="wrap" gap="large">
                                <div>
                                    <Text type="secondary">上次用量</Text>
                                    <div>{item.trafficSummary ? `${item.usagePercent.toFixed(1)}%` : "暂无"}</div>
                                    <Text type="secondary">{item.trafficSummary || "等待巡检结果"}</Text>
                                </div>
                                <div>
                                    <Text type="secondary">过期时间</Text>
                                    <div>{item.expireAt || "暂无"}</div>
                                    <Text type="secondary">{formatRemainDays(item.expireRemainDays, Boolean(item.expireAt))}</Text>
                                </div>
                                <div>
                                    <Text type="secondary">上次巡检</Text>
                                    <div>{item.lastCheckAt ? new Date(item.lastCheckAt).toLocaleString() : "暂无"}</div>
                                    <Text type="secondary">{item.lastError || "无错误"}</Text>
                                </div>
                            </Flex> : null}
                            <Space wrap>
                                <Button icon={<CopyOutlined/>} onClick={() => onCopy(item.shareUrl)}>复制链接</Button>
                                <Button
                                    icon={<CloudSyncOutlined/>}
                                    onClick={() => onManualCheck(item.id)}
                                    loading={actingKey === `check-${item.id}`}
                                >
                                    手动巡检
                                </Button>
                                <Button
                                    icon={<RedoOutlined/>}
                                    onClick={() => onRotate(item.id)}
                                    loading={actingKey === `rotate-${item.id}`}
                                >
                                    轮换链接
                                </Button>
                                <Popconfirm
                                    title="确定删除这个订阅吗？"
                                    okText="确定"
                                    cancelText="取消"
                                    onConfirm={() => onDelete(item.id)}
                                >
                                    <Button danger icon={<DeleteOutlined/>}>删除</Button>
                                </Popconfirm>
                            </Space>
                            </Space>
                        </Flex>
                    </Card>
                ))}
            </div>}
        </Spin>
        <Modal
            title={editingItem ? "编辑订阅" : "新增订阅"}
            open={modalOpen}
            onCancel={() => setModalOpen(false)}
            onOk={submitForm}
            okText={editingItem ? "保存" : "创建"}
            confirmLoading={saving}
        >
            <Form form={form} layout="vertical" initialValues={{monitorEnabled: false}}>
                <Form.Item
                    name="name"
                    label="名称"
                    rules={[{required: true, message: "请输入名称"}]}
                >
                    <Input placeholder="例如：机场主订阅"/>
                </Form.Item>
                <Form.Item
                    name="upstreamUrl"
                    label="上游链接"
                    rules={[{required: true, message: "请输入上游链接"}]}
                >
                    <Input.TextArea rows={4} placeholder="https://example.com/subscription"/>
                </Form.Item>
                <Form.Item name="monitorEnabled" label="开启巡检" valuePropName="checked">
                    <Switch/>
                </Form.Item>
            </Form>
        </Modal>
    </div>;
}
