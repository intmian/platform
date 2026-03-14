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

const {Text, Title} = Typography;
const SUBSCRIPTION_CARD_MIN_WIDTH = 335;
const SUBSCRIPTION_GRID_GAP = 12;
const SUBSCRIPTION_PAGE_PADDING = 20;
const NO_DATA_TEXT = "无数据";

type FormValue = {
    name: string
    upstreamUrl: string
    workerForwardUrl: string
    workerForwardEnabled: boolean
    monitorEnabled: boolean
}

function getSubscriptionColumnCount(viewportWidth: number, isMobile: boolean) {
    if (isMobile) {
        return 1;
    }
    const desktopViewportWidth = viewportWidth - SUBSCRIPTION_PAGE_PADDING * 2;
    if (desktopViewportWidth >= SUBSCRIPTION_CARD_MIN_WIDTH * 4 + SUBSCRIPTION_GRID_GAP * 3) {
        return 4;
    }
    if (desktopViewportWidth >= SUBSCRIPTION_CARD_MIN_WIDTH * 3 + SUBSCRIPTION_GRID_GAP * 2) {
        return 3;
    }
    if (desktopViewportWidth >= SUBSCRIPTION_CARD_MIN_WIDTH * 2 + SUBSCRIPTION_GRID_GAP) {
        return 2;
    }
    return 1;
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
            return <Tag color="success">检查成功</Tag>;
        case "request_failed":
            return <Tag color="error">请求失败</Tag>;
        case "parse_failed":
            return <Tag color="warning">解析失败</Tag>;
        default:
            return <Tag>尚未检查</Tag>;
    }
}

function formatRemainDays(days: number, hasExpire: boolean) {
    if (!hasExpire) {
        return NO_DATA_TEXT;
    }
    if (days > 0) {
        return `剩 ${days} 天`;
    }
    if (days === 0) {
        return "今天到期";
    }
    return `已过期 ${Math.abs(days)} 天`;
}

function shouldShowHeaderStatus(item: SubscriptionItem) {
    return false;
}

function getUsageMetric(item: SubscriptionItem) {
    if (item.trafficSummary) {
        return {
            value: `${item.usagePercent.toFixed(1)}%`,
            subValue: item.trafficSummary,
        };
    }
    return {
        value: NO_DATA_TEXT,
        subValue: item.monitorEnabled ? "等待巡检结果" : NO_DATA_TEXT,
    };
}

function getExpireMetric(item: SubscriptionItem) {
    if (item.expireAt) {
        return {
            value: item.expireAt,
            subValue: formatRemainDays(item.expireRemainDays, true),
        };
    }
    return {
        value: NO_DATA_TEXT,
        subValue: NO_DATA_TEXT,
    };
}

function getLastCheckMetric(item: SubscriptionItem) {
    if (item.lastCheckAt) {
        return {
            value: new Date(item.lastCheckAt).toLocaleString(),
            subValue: item.lastError || "无错误",
        };
    }
    return {
        value: NO_DATA_TEXT,
        subValue: item.lastError || NO_DATA_TEXT,
    };
}

function renderMonitorTag(item: SubscriptionItem) {
    if (!item.monitorEnabled) {
        return null;
    }
    const success = item.lastCheckStatus === "success";
    const monitorTextStyle = {
        fontSize: 12,
        fontWeight: 500,
        lineHeight: 1,
    } as const
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
        <span style={monitorTextStyle}>Auto Check</span>
        {item.workerForwardEnabled ? <span style={{
            color: "#bfbfbf",
            fontSize: 12,
            lineHeight: 1,
        }}>|</span> : null}
        {item.workerForwardEnabled ? <span style={monitorTextStyle}>Proxy On</span> : null}
        <Badge status={success ? "success" : "error"}/>
    </Tag>;
}

function renderProxyOnlyTag(item: SubscriptionItem) {
    if (!item.workerForwardEnabled || item.monitorEnabled) {
        return null;
    }
    return <Tag
        bordered
        style={{
            borderRadius: 999,
            display: "inline-flex",
            alignItems: "center",
            minHeight: 24,
            marginInlineEnd: 0,
            paddingInline: 8,
            fontSize: 12,
            fontWeight: 500,
            lineHeight: 1,
        }}
    >
        Proxy On
    </Tag>;
}

function MetricCard(props: {
    label: string
    value: string
    subValue: string
    fullRow?: boolean
}) {
    return <div style={{
        padding: "10px 12px",
        borderRadius: 12,
        background: "#fafafa",
        border: "1px solid #f0f0f0",
        minWidth: 0,
        gridColumn: props.fullRow ? "1 / -1" : undefined,
    }}>
        <Text type="secondary" style={{fontSize: 12}}>{props.label}</Text>
        <div style={{
            marginTop: 4,
            fontSize: 16,
            fontWeight: 600,
            lineHeight: 1.2,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
        }}>{props.value}</div>
        <Text type="secondary" style={{
            display: "block",
            marginTop: 4,
            fontSize: 12,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
        }}>{props.subValue}</Text>
    </div>;
}

export default function SubscriptionPage() {
    const {loginReady, isLoggedIn, openLogin, loginPanel} = useLoginGate();
    const isMobile = useIsMobile();
    const [viewportWidth, setViewportWidth] = useState(window.innerWidth);
    const [items, setItems] = useState<SubscriptionItem[]>([]);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [modalOpen, setModalOpen] = useState(false);
    const [editingItem, setEditingItem] = useState<SubscriptionItem | null>(null);
    const [actingKey, setActingKey] = useState("");
    const [form] = Form.useForm<FormValue>();
    const workerForwardEnabled = Form.useWatch("workerForwardEnabled", form);

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

    useEffect(() => {
        const handleResize = () => {
            setViewportWidth(window.innerWidth);
        };
        window.addEventListener("resize", handleResize);
        return () => window.removeEventListener("resize", handleResize);
    }, []);

    const openCreateModal = () => {
        setEditingItem(null);
        form.setFieldsValue({
            name: "",
            upstreamUrl: "",
            workerForwardUrl: "",
            workerForwardEnabled: false,
            monitorEnabled: false,
        });
        setModalOpen(true);
    };

    const openEditModal = (item: SubscriptionItem) => {
        setEditingItem(item);
        form.setFieldsValue({
            name: item.name,
            upstreamUrl: item.upstreamUrl,
            workerForwardUrl: item.workerForwardUrl,
            workerForwardEnabled: item.workerForwardEnabled,
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
                workerForwardUrl: values.workerForwardUrl,
                workerForwardEnabled: values.workerForwardEnabled,
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

    const columnCount = getSubscriptionColumnCount(viewportWidth, isMobile);

    return <div style={{padding: isMobile ? 14 : 20, maxWidth: 1680, margin: "0 auto"}}>
        {loginPanel}
        <Flex justify="space-between" align="center" wrap="wrap" gap="middle" style={{marginBottom: 16}}>
            <div>
                <Flex align="center" gap={8}>
                    <Title level={2} style={{marginBottom: 0}}>订阅管理</Title>
                    <Popover
                        trigger="click"
                        placement="bottomLeft"
                        content={<div style={{maxWidth: 320}}>
                            <div style={{fontWeight: 600, marginBottom: 8}}>检查说明</div>
                            <div style={{marginBottom: 8}}>每条订阅对应一个上游链接和一个可公开访问的分享链接。</div>
                            <div>只有开启自动检查的链接才会每小时自动检查上游链接，并展示本期用量、过期时间和上次检查结果。</div>
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
                gridTemplateColumns: `repeat(${columnCount}, minmax(0, 1fr))`,
                gap: SUBSCRIPTION_GRID_GAP,
                width: "100%",
            }}>
                {items.map((item) => {
                    const usageMetric = getUsageMetric(item);
                    const expireMetric = getExpireMetric(item);
                    const lastCheckMetric = getLastCheckMetric(item);
                    return <Card
                        size="small"
                        key={item.id}
                        style={{height: "100%", minWidth: 0}}
                        styles={{body: {padding: isMobile ? 14 : 16}}}
                        title={<Flex align="center" gap={8} wrap="wrap" style={{minWidth: 0}}>
                            <LinkOutlined/>
                            <span style={{fontWeight: 600, minWidth: 0}}>{item.name}</span>
                            {renderMonitorTag(item)}
                            {renderProxyOnlyTag(item)}
                        </Flex>}
                        extra={<Space size="small">
                            {shouldShowHeaderStatus(item) ? formatCheckStatus(item) : null}
                            <Button
                                size="small"
                                type="text"
                                aria-label="编辑"
                                icon={<EditOutlined/>}
                                onClick={() => openEditModal(item)}
                            />
                            <Popconfirm
                                title="确定删除这个订阅吗？"
                                okText="确定"
                                cancelText="取消"
                                onConfirm={() => onDelete(item.id)}
                            >
                                <Button
                                    size="small"
                                    type="text"
                                    danger
                                    aria-label="删除"
                                    icon={<DeleteOutlined/>}
                                />
                            </Popconfirm>
                        </Space>}
                    >
                        <Flex vertical gap={12}>
                            <div style={{
                                display: "grid",
                                gridTemplateColumns: isMobile ? "1fr" : "repeat(2, minmax(0, 1fr))",
                                gap: 10,
                                maxWidth: isMobile ? "100%" : 760,
                            }}>
                                <MetricCard
                                    label="本期用量"
                                    value={usageMetric.value}
                                    subValue={usageMetric.subValue}
                                />
                                <MetricCard
                                    label="过期时间"
                                    value={expireMetric.value}
                                    subValue={expireMetric.subValue}
                                />
                                <MetricCard
                                    label="上次检查"
                                    value={lastCheckMetric.value}
                                    subValue={lastCheckMetric.subValue}
                                    fullRow={!isMobile}
                                />
                            </div>
                            <Flex wrap gap={8}>
                                <Button size="small" icon={<CopyOutlined/>} onClick={() => onCopy(item.shareUrl)}>复制链接</Button>
                                <Button
                                    size="small"
                                    icon={<CloudSyncOutlined/>}
                                    onClick={() => onManualCheck(item.id)}
                                    loading={actingKey === `check-${item.id}`}
                                >
                                    手动检查
                                </Button>
                                <Button
                                    size="small"
                                    icon={<RedoOutlined/>}
                                    onClick={() => onRotate(item.id)}
                                    loading={actingKey === `rotate-${item.id}`}
                                >
                                    轮换链接
                                </Button>
                            </Flex>
                        </Flex>
                    </Card>;
                })}
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
            <Form form={form} layout="vertical" initialValues={{monitorEnabled: false, workerForwardEnabled: false, workerForwardUrl: ""}}>
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
                <Form.Item name="workerForwardEnabled" label="使用 Worker 转发" valuePropName="checked">
                    <Switch/>
                </Form.Item>
                <Form.Item
                    name="workerForwardUrl"
                    label="Worker 转发地址"
                    rules={workerForwardEnabled ? [{required: true, message: "请输入 Worker 转发地址"}] : []}
                    extra="例如：https://xxx.workers.dev/?url= ，后端会在后面自动拼接原始上游链接"
                >
                    <Input
                        disabled={!workerForwardEnabled}
                        placeholder="https://xxx.workers.dev/?url="
                    />
                </Form.Item>
                <Form.Item name="monitorEnabled" label="开启自动检查" valuePropName="checked">
                    <Switch/>
                </Form.Item>
            </Form>
        </Modal>
    </div>;
}
