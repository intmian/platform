import {useCallback, useContext, useEffect, useMemo, useRef, useState} from "react";
import {
    Alert,
    Button,
    Empty,
    Form,
    Input,
    Modal,
    Popconfirm,
    Result,
    Select,
    Space,
    Spin,
    Switch,
    Tabs,
    Tag,
    Tooltip,
    Typography,
    message
} from "antd";
import {
    CopyOutlined,
    DeleteOutlined,
    EditOutlined,
    EyeInvisibleOutlined,
    EyeOutlined,
    KeyOutlined,
    PlusOutlined,
    ReloadOutlined,
    SaveOutlined,
    SendOutlined
} from "@ant-design/icons";
import {
    CartesianGrid,
    Legend,
    Line,
    LineChart,
    Tooltip as ChartTooltip,
    XAxis,
    YAxis
} from "recharts";
import {LoginCtx} from "../common/loginCtx";
import {useLoginGate} from "../common/useLoginGate";
import {useIsMobile} from "../common/hooksv2";
import {
    Command,
    Credential,
    Dashboard,
    DashboardWidget,
    DashboardWidgetResult,
    Device,
    Sample,
    createCommand,
    createCredential,
    deleteCredential,
    deleteDevice,
    getDashboard,
    listCommands,
    listCredentials,
    listDevices,
    queryDashboard,
    rotateCredential,
    saveDashboard,
    updateCredential,
    updateDevice
} from "./hardwareApi";
import "./hardware.css";

const {Text} = Typography;

const metricOptions = [
    {value: "temp_c10", label: "温度"},
    {value: "humi_rh", label: "湿度"},
    {value: "scd41_co2_ppm", label: "CO2"},
    {value: "batt_pct", label: "电量"},
    {value: "tvoc_ppb", label: "TVOC"},
    {value: "voc_aqi", label: "VOC AQI"},
    {value: "eco2_ppm", label: "eCO2"},
];

const rangeOptions = [
    {value: "1h", label: "过去 1 小时"},
    {value: "6h", label: "过去 6 小时"},
    {value: "24h", label: "过去 24 小时"},
    {value: "7d", label: "过去 7 天"},
    {value: "custom", label: "自定义"},
];

const bucketOptions = [
    {value: "raw", label: "原始点"},
    {value: "1m", label: "1 分钟"},
    {value: "5m", label: "5 分钟"},
    {value: "15m", label: "15 分钟"},
    {value: "1h", label: "1 小时"},
];

function formatDate(value?: string) {
    if (!value) {
        return "从未";
    }
    return new Date(value).toLocaleString();
}

function statusTag(status: string, hidden?: boolean, deleted?: boolean) {
    if (deleted || status === "deleted") {
        return <Tag color="default">已删除</Tag>;
    }
    if (hidden) {
        return <Tag color="default">已隐藏</Tag>;
    }
    if (status === "online") {
        return <Tag color="success">在线</Tag>;
    }
    if (status === "stale") {
        return <Tag color="warning">延迟</Tag>;
    }
    return <Tag>离线</Tag>;
}

function metricLabel(metric: string) {
    return metricOptions.find((item) => item.value === metric)?.label || metric;
}

function sampleValue(sample: Sample | undefined, metric: string) {
    if (!sample) {
        return null;
    }
    switch (metric) {
        case "temp_c10":
            return sample.tempC10;
        case "humi_rh":
            return sample.humiRh;
        case "scd41_co2_ppm":
            return sample.scd41Co2Ppm;
        case "batt_pct":
            return sample.battPct;
        case "tvoc_ppb":
            return sample.tvocPpb;
        case "voc_aqi":
            return sample.vocAqi;
        case "eco2_ppm":
            return sample.eco2Ppm;
        default:
            return null;
    }
}

function formatMetricValue(metric: string, value: number | null | undefined) {
    if (value === null || value === undefined) {
        return "无数据";
    }
    if (metric === "temp_c10") {
        return `${(value / 10).toFixed(1)} °C`;
    }
    if (metric === "humi_rh" || metric === "batt_pct") {
        return `${value}%`;
    }
    if (metric === "scd41_co2_ppm" || metric === "eco2_ppm") {
        return `${value} ppm`;
    }
    if (metric === "tvoc_ppb") {
        return `${value} ppb`;
    }
    return String(value);
}

function commandStatusLabel(status: string) {
    switch (status) {
        case "pending":
            return "待下发";
        case "delivered":
            return "已下发";
        case "acked":
            return "已确认";
        case "failed":
            return "失败";
        case "cancelled":
            return "已取消";
        default:
            return status;
    }
}

function parseWidgetOptions(widget: DashboardWidget) {
    try {
        return JSON.parse(widget.optionsJson || "{}") as { fromEpochSec?: number, toEpochSec?: number };
    } catch {
        return {};
    }
}

function isObservableDevice(device: Device) {
    return !device.hidden && !device.deleted && device.type !== "gateway" && device.type !== deviceTypeDeleted;
}

function toLocalDateTime(epoch?: number) {
    if (!epoch) {
        return "";
    }
    const date = new Date(epoch * 1000);
    const offset = date.getTimezoneOffset();
    return new Date(date.getTime() - offset * 60000).toISOString().slice(0, 16);
}

function fromLocalDateTime(value?: string) {
    if (!value) {
        return undefined;
    }
    const time = new Date(value).getTime();
    if (Number.isNaN(time)) {
        return undefined;
    }
    return Math.floor(time / 1000);
}

function widgetFormValues(widget?: DashboardWidget) {
    const options = widget ? parseWidgetOptions(widget) : {};
    return {
        title: widget?.title || "",
        type: widget?.type || "value",
        deviceIds: widget?.deviceIds || [],
        metrics: widget?.metrics || ["temp_c10"],
        timeRange: widget?.timeRange || "24h",
        bucket: widget?.bucket || "raw",
        agg: widget?.agg || "avg",
        fromTime: toLocalDateTime(options.fromEpochSec),
        toTime: toLocalDateTime(options.toEpochSec),
    };
}

export default function HardwarePage() {
    const gate = useLoginGate({enabled: true, autoPrompt: true});
    const loginCtr = useContext(LoginCtx);
    const isMobile = useIsMobile();
    const hasPermission = loginCtr.loginInfo.hasPermission("admin") || loginCtr.loginInfo.hasPermission("hardware");
    const [loading, setLoading] = useState(false);
    const [devices, setDevices] = useState<Device[]>([]);
    const [commands, setCommands] = useState<Command[]>([]);
    const [credentials, setCredentials] = useState<Credential[]>([]);
    const [dashboard, setDashboard] = useState<Dashboard | null>(null);
    const [widgets, setWidgets] = useState<DashboardWidget[]>([]);
    const [dashboardResults, setDashboardResults] = useState<DashboardWidgetResult[]>([]);
    const [manageMode, setManageMode] = useState(false);
    const [deviceModal, setDeviceModal] = useState<{ open: boolean, device?: Device }>({open: false});
    const [credentialModal, setCredentialModal] = useState<{ open: boolean, credential?: Credential }>({open: false});
    const [tokenModal, setTokenModal] = useState<{ open: boolean, token: string }>({open: false, token: ""});
    const [widgetModal, setWidgetModal] = useState<{ open: boolean, widget?: DashboardWidget }>({open: false});
    const [deviceForm] = Form.useForm();
    const [credentialForm] = Form.useForm();
    const [widgetForm] = Form.useForm();
    const refreshSec = dashboard?.refreshSec ?? 30;

    const visibleDevices = useMemo(() => devices.filter((device) => manageMode || (!device.hidden && !device.deleted)), [devices, manageMode]);
    const deviceById = useMemo(() => new Map(devices.map((device) => [device.id, device])), [devices]);

    const loadData = useCallback(async (options?: { silent?: boolean }) => {
        if (!gate.isLoggedIn || !hasPermission) {
            return;
        }
        if (!options?.silent) {
            setLoading(true);
        }
        try {
            const [deviceRet, credentialRet, dashboardRet, dashboardQueryRet, commandRet] = await Promise.all([
                listDevices({includeHidden: manageMode, includeDeleted: manageMode}),
                listCredentials(),
                getDashboard(),
                queryDashboard(),
                listCommands({limit: 100}),
            ]);
            setDevices(deviceRet.devices || []);
            setCredentials(credentialRet.credentials || []);
            setDashboard(dashboardRet.dashboard);
            setWidgets(dashboardRet.widgets || []);
            setDashboardResults(dashboardQueryRet.widgets || []);
            setCommands(commandRet.commands || []);
        } catch {
            if (!options?.silent) {
                message.error("硬件数据加载失败");
            }
        } finally {
            if (!options?.silent) {
                setLoading(false);
            }
        }
    }, [gate.isLoggedIn, hasPermission, manageMode]);

    useEffect(() => {
        loadData();
    }, [loadData]);

    useEffect(() => {
        if (!gate.isLoggedIn || !hasPermission) {
            return undefined;
        }
        if (refreshSec <= 0) {
            return undefined;
        }
        const timer = window.setInterval(() => loadData({silent: true}), Math.max(10, refreshSec) * 1000);
        return () => window.clearInterval(timer);
    }, [gate.isLoggedIn, hasPermission, loadData, refreshSec]);

    if (!gate.loginReady) {
        return <div className="hardware-page"><Spin fullscreen/></div>;
    }
    if (!gate.isLoggedIn) {
        return <div className="hardware-page">
            {gate.loginPanel}
            <Result status="403" title="需要登录" extra={<Button type="primary" onClick={gate.openLogin}>登录</Button>}/>
        </div>;
    }
    if (!hasPermission) {
        return <div className="hardware-page"><Result status="403" title="无权限"/></div>;
    }

    const openDeviceModal = (device: Device) => {
        deviceForm.setFieldsValue({name: device.name, hidden: device.hidden});
        setDeviceModal({open: true, device});
    };

    const saveDevice = async () => {
        const values = await deviceForm.validateFields();
        if (!deviceModal.device) {
            return;
        }
        await updateDevice({id: deviceModal.device.id, name: values.name, hidden: !!values.hidden});
        setDeviceModal({open: false});
        message.success("设备已更新");
        await loadData();
    };

    const openCredentialModal = (credential?: Credential) => {
        credentialForm.setFieldsValue({name: credential?.name || "接入密钥", enabled: credential?.enabled ?? true});
        setCredentialModal({open: true, credential});
    };

    const saveCredential = async () => {
        const values = await credentialForm.validateFields();
        if (credentialModal.credential) {
            await updateCredential({id: credentialModal.credential.id, name: values.name, enabled: !!values.enabled});
            message.success("密钥已更新");
        } else {
            const ret = await createCredential(values.name);
            setTokenModal({open: true, token: ret.token});
            message.success("密钥已创建");
        }
        setCredentialModal({open: false});
        await loadData();
    };

    const saveDashboardConfig = async (nextWidgets = widgets) => {
        if (!dashboard) {
            return;
        }
        const ret = await saveDashboard({
            name: dashboard.name || "数据看板",
            timeRange: dashboard.timeRange || "24h",
            refreshSec: dashboard.refreshSec ?? 30,
            layoutJson: dashboard.layoutJson || "{}",
            widgets: nextWidgets,
        });
        setDashboard(ret.dashboard);
        setWidgets(ret.widgets || []);
        const queried = await queryDashboard();
        setDashboardResults(queried.widgets || []);
    };

    const submitWidget = async () => {
        const values = await widgetForm.validateFields();
        const type = values.type || "value";
        const options: { fromEpochSec?: number, toEpochSec?: number } = {};
        if (values.timeRange === "custom") {
            options.fromEpochSec = fromLocalDateTime(values.fromTime);
            options.toEpochSec = fromLocalDateTime(values.toTime);
        }
        const nextWidget: DashboardWidget = {
            id: widgetModal.widget?.id || "",
            title: values.title,
            type,
            deviceIds: values.deviceIds || [],
            metrics: type === "line" ? [values.metrics?.[0] || "temp_c10"] : (values.metrics || ["temp_c10"]),
            timeRange: values.timeRange || "24h",
            bucket: type === "value" ? "raw" : (values.bucket || "raw"),
            agg: values.agg || "avg",
            optionsJson: JSON.stringify(options),
            sortIndex: widgetModal.widget?.sortIndex ?? widgets.length,
        };
        const nextWidgets = widgetModal.widget
            ? widgets.map((item) => item.id === widgetModal.widget?.id ? nextWidget : item)
            : [...widgets, nextWidget];
        await saveDashboardConfig(nextWidgets);
        setWidgetModal({open: false});
        message.success("看板已更新");
    };

    const openWidgetModal = (widget?: DashboardWidget) => {
        widgetForm.resetFields();
        widgetForm.setFieldsValue(widgetFormValues(widget));
        setWidgetModal({open: true, widget});
    };

    return <div className="hardware-page">
        {gate.loginPanel}
        <main className="hardware-main">
            <header className="hardware-header">
                <div>
                    <h1>硬件平台</h1>
                </div>
                <Space wrap>
                    <Button icon={<ReloadOutlined/>} onClick={() => loadData()}>刷新</Button>
                </Space>
            </header>

            <Tabs
                items={[
                    {
                        key: "devices",
                        label: "设备",
                        children: <Spin spinning={loading}>
                            <div className="hardware-toolbar">
                                <Text type="secondary">{visibleDevices.length} 台设备</Text>
                                <Space>
                                    <Text>管理</Text>
                                    <Switch checked={manageMode} onChange={setManageMode}/>
                                </Space>
                            </div>
                            <DeviceGrid
                                devices={visibleDevices}
                                commands={commands}
                                deviceById={deviceById}
                                manageMode={manageMode}
                                isMobile={isMobile}
                                onEdit={openDeviceModal}
                                onHide={async (device) => {
                                    await updateDevice({id: device.id, name: device.name, hidden: !device.hidden});
                                    await loadData();
                                }}
                                onDelete={async (device) => {
                                    await deleteDevice(device.id);
                                    message.success("设备已删除");
                                    await loadData();
                                }}
                                onOta={async (device) => {
                                    await createCommand({deviceId: device.id, type: "ota", payloadJson: "{}"});
                                    message.success("OTA 已下发");
                                    await loadData();
                                }}
                            />
                        </Spin>,
                    },
                    {
                        key: "dashboard",
                        label: "看板",
                        children: <DashboardPanel
                            dashboard={dashboard}
                            widgets={widgets}
                            results={dashboardResults}
                            devices={devices.filter(isObservableDevice)}
                            onDashboardChange={setDashboard}
                            onRefresh={async () => {
                                const ret = await queryDashboard();
                                setDashboardResults(ret.widgets || []);
                            }}
                            onSave={() => saveDashboardConfig()}
                            onEditWidget={openWidgetModal}
                            onDeleteWidget={async (widget) => {
                                const next = widgets.filter((item) => item.id !== widget.id);
                                await saveDashboardConfig(next);
                            }}
                        />,
                    },
                    {
                        key: "credentials",
                        label: "接入密钥",
                        children: <CredentialPanel
                            credentials={credentials}
                            onCreate={() => openCredentialModal()}
                            onEdit={openCredentialModal}
                            onRotate={async (credential) => {
                                const ret = await rotateCredential(credential.id);
                                setTokenModal({open: true, token: ret.token});
                                await loadData();
                            }}
                            onDelete={async (credential) => {
                                await deleteCredential(credential.id);
                                await loadData();
                            }}
                        />,
                    },
                ]}
            />
        </main>

        <Modal title="编辑设备" open={deviceModal.open} onOk={saveDevice} onCancel={() => setDeviceModal({open: false})} destroyOnClose forceRender>
            <Form form={deviceForm} layout="vertical" preserve={false}>
                <Form.Item name="name" label="名称" rules={[{required: true}]}>
                    <Input/>
                </Form.Item>
                <Form.Item name="hidden" label="隐藏" valuePropName="checked">
                    <Switch/>
                </Form.Item>
            </Form>
        </Modal>

        <Modal title={credentialModal.credential ? "编辑密钥" : "创建密钥"} open={credentialModal.open} onOk={saveCredential} onCancel={() => setCredentialModal({open: false})} destroyOnClose forceRender>
            <Form form={credentialForm} layout="vertical" preserve={false}>
                <Form.Item name="name" label="名称" rules={[{required: true}]}>
                    <Input/>
                </Form.Item>
                <Form.Item name="enabled" label="启用" valuePropName="checked">
                    <Switch/>
                </Form.Item>
            </Form>
        </Modal>

        <Modal title="完整密钥" open={tokenModal.open} onCancel={() => setTokenModal({open: false, token: ""})} footer={<Button onClick={() => setTokenModal({open: false, token: ""})}>关闭</Button>}>
            <Alert type="warning" showIcon message="关闭后无法再次查看"/>
            <Input.TextArea className="hardware-token-box" value={tokenModal.token} autoSize readOnly/>
            <Button icon={<CopyOutlined/>} onClick={() => navigator.clipboard.writeText(tokenModal.token)}>复制</Button>
        </Modal>

        <Modal title={widgetModal.widget ? "编辑组件" : "添加组件"} open={widgetModal.open} onOk={submitWidget} onCancel={() => setWidgetModal({open: false})} width={680} destroyOnClose forceRender>
            <WidgetForm form={widgetForm} devices={devices.filter(isObservableDevice)} widget={widgetModal.widget}/>
        </Modal>
    </div>;
}

const deviceTypeDeleted = "deleted";

function DeviceGrid(props: {
    devices: Device[]
    commands: Command[]
    deviceById: Map<string, Device>
    manageMode: boolean
    isMobile: boolean
    onEdit: (device: Device) => void
    onHide: (device: Device) => void
    onDelete: (device: Device) => void
    onOta: (device: Device) => void
}) {
    if (props.devices.length === 0) {
        return <Empty description="暂无设备"/>;
    }
    return <div className={`hardware-device-grid ${props.isMobile ? "is-mobile" : ""}`}>
        {props.devices.map((device) => <DeviceCard
            key={device.id}
            device={device}
            commands={props.commands.filter((command) => command.deviceId === device.id || command.gatewayDeviceId === device.id)}
            gateway={props.deviceById.get(device.lastGatewayDeviceId)}
            manageMode={props.manageMode}
            onEdit={() => props.onEdit(device)}
            onHide={() => props.onHide(device)}
            onDelete={() => props.onDelete(device)}
            onOta={() => props.onOta(device)}
        />)}
    </div>;
}

function DeviceCard(props: {
    device: Device
    gateway?: Device
    commands: Command[]
    manageMode: boolean
    onEdit: () => void
    onHide: () => void
    onDelete: () => void
    onOta: () => void
}) {
    const latestCommand = props.commands[0];
    return <section className="hardware-card">
        <div className="hardware-card-head">
            <div>
                <h2>{props.device.name}</h2>
                <div className="hardware-card-meta">
                    <Tag>{props.device.type}</Tag>
                    {statusTag(props.device.status, props.device.hidden, props.device.deleted)}
                </div>
            </div>
            <Space>
                {props.manageMode && props.device.type === "gateway" && !props.device.deleted ? <Tooltip title="OTA">
                    <Button aria-label="OTA" icon={<SendOutlined/>} onClick={props.onOta}/>
                </Tooltip> : null}
                <Tooltip title="重命名">
                    <Button aria-label="重命名" icon={<EditOutlined/>} onClick={props.onEdit}/>
                </Tooltip>
            </Space>
        </div>
        <div className="hardware-kv compact">
            <span>最近在线</span><strong>{formatDate(props.device.lastSeenAt)}</strong>
            <span>最近刷新</span><strong>{formatDate(props.device.lastSampleAt || props.device.updatedAt)}</strong>
            {props.gateway ? <><span>连接</span><strong>{props.gateway.name}</strong></> : null}
            {props.manageMode && props.device.type === "gateway" ? <>
                <span>IP</span><strong>{props.device.lastIp || "无"}</strong>
                <span>客户端</span><strong>{props.device.userAgent || "无"}</strong>
            </> : null}
            {props.manageMode && latestCommand ? <><span>最近命令</span><strong>{commandStatusLabel(latestCommand.status)}</strong></> : null}
        </div>
        {props.manageMode ? <div className="hardware-card-actions">
            <Button icon={props.device.hidden ? <EyeOutlined/> : <EyeInvisibleOutlined/>} onClick={props.onHide}>
                {props.device.hidden ? "显示" : "隐藏"}
            </Button>
            <Popconfirm title="删除后历史数据会被清除" onConfirm={props.onDelete}>
                <Button danger icon={<DeleteOutlined/>}>删除</Button>
            </Popconfirm>
        </div> : null}
    </section>;
}

function DashboardPanel(props: {
    dashboard: Dashboard | null
    widgets: DashboardWidget[]
    results: DashboardWidgetResult[]
    devices: Device[]
    onDashboardChange: (dashboard: Dashboard) => void
    onRefresh: () => void
    onSave: () => void
    onEditWidget: (widget?: DashboardWidget) => void
    onDeleteWidget: (widget: DashboardWidget) => void
}) {
    return <section className="hardware-panel">
        <div className="hardware-toolbar">
            <Space wrap>
                <Select value={props.dashboard?.timeRange || "24h"} options={rangeOptions.filter((item) => item.value !== "custom")} onChange={(value) => props.dashboard && props.onDashboardChange({...props.dashboard, timeRange: value})} className="hardware-control"/>
                <Select value={String(props.dashboard?.refreshSec ?? 30)} options={[
                    {value: "0", label: "不自动刷新"},
                    {value: "10", label: "10 秒"},
                    {value: "30", label: "30 秒"},
                    {value: "60", label: "1 分钟"},
                ]} onChange={(value) => props.dashboard && props.onDashboardChange({...props.dashboard, refreshSec: Number(value)})} className="hardware-control"/>
                <Button icon={<ReloadOutlined/>} onClick={props.onRefresh}>刷新</Button>
                <Button icon={<SaveOutlined/>} onClick={props.onSave}>保存看板</Button>
            </Space>
            <Button type="primary" icon={<PlusOutlined/>} onClick={() => props.onEditWidget()}>添加组件</Button>
        </div>
        {props.results.length === 0 ? <Empty description="暂无组件"/> : <div className="hardware-widget-grid">
            {props.results.map((result) => <DashboardWidgetView
                key={result.widget.id}
                result={result}
                onEdit={() => props.onEditWidget(result.widget)}
                onDelete={() => props.onDeleteWidget(result.widget)}
            />)}
        </div>}
    </section>;
}

function DashboardWidgetView(props: { result: DashboardWidgetResult, onEdit: () => void, onDelete: () => void }) {
    const deleted = props.result.devices.some((device) => device.deleted);
    const metric = props.result.widget.metrics[0] || "temp_c10";
    return <section className="hardware-card hardware-widget-card">
        <div className="hardware-card-head">
            <div>
                <h2>{props.result.widget.title}</h2>
                <div className="hardware-card-meta">
                    <Tag>{props.result.widget.type === "value" ? "实时值" : "折线图"}</Tag>
                    {props.result.widget.type === "line" ? <Tag>{rangeOptions.find((item) => item.value === props.result.widget.timeRange)?.label || props.result.widget.timeRange}</Tag> : null}
                </div>
            </div>
            <Space>
                <Tooltip title="编辑">
                    <Button aria-label="编辑组件" icon={<EditOutlined/>} onClick={props.onEdit}/>
                </Tooltip>
                <Popconfirm title="移除这个组件" onConfirm={props.onDelete}>
                    <Button aria-label="删除组件" icon={<DeleteOutlined/>}/>
                </Popconfirm>
            </Space>
        </div>
        {deleted ? <Alert type="warning" message="设备已删除" showIcon/> : null}
        {props.result.widget.type === "value"
            ? <ValueWidget result={props.result}/>
            : <LineWidget samples={props.result.samples} devices={props.result.devices} metric={metric}/>}
    </section>;
}

function ValueWidget(props: { result: DashboardWidgetResult }) {
    const metrics = props.result.widget.metrics;
    return <div className="hardware-value-grid">
        {props.result.devices.map((device) => {
            const sample = props.result.latest.find((item) => item.deviceId === device.id);
            return <div className="hardware-value-item" key={device.id}>
                <Text type="secondary">{device.name}</Text>
                {metrics.map((metric) => <strong key={metric}>{metricLabel(metric)} {formatMetricValue(metric, sampleValue(sample, metric))}</strong>)}
            </div>;
        })}
    </div>;
}

function LineWidget(props: { samples: Sample[], devices: Device[], metric: string }) {
    const chartRef = useRef<HTMLDivElement | null>(null);
    const [chartWidth, setChartWidth] = useState(0);
    const points = props.samples
        .map((sample) => ({sample, value: sampleValue(sample, props.metric)}))
        .filter((item): item is { sample: Sample, value: number } => item.value !== null && item.value !== undefined);
    useEffect(() => {
        const node = chartRef.current;
        if (!node) {
            return undefined;
        }
        const updateWidth = () => {
            setChartWidth(Math.floor(node.clientWidth));
        };
        updateWidth();
        if (typeof ResizeObserver === "undefined") {
            window.addEventListener("resize", updateWidth);
            return () => window.removeEventListener("resize", updateWidth);
        }
        const observer = new ResizeObserver(updateWidth);
        observer.observe(node);
        return () => observer.disconnect();
    }, []);
    if (points.length < 2) {
        return <div className="hardware-chart-empty">无足够数据</div>;
    }
    const deviceById = new Map(props.devices.map((device) => [device.id, device]));
    const rowsByEpoch = new Map<number, Record<string, number | string>>();
    points.forEach((point) => {
        const row = rowsByEpoch.get(point.sample.epochSec) || {
            epoch: point.sample.epochSec,
            time: new Date(point.sample.epochSec * 1000).toLocaleTimeString([], {hour: "2-digit", minute: "2-digit"}),
        };
        row[point.sample.deviceId] = point.value;
        rowsByEpoch.set(point.sample.epochSec, row);
    });
    const chartData = Array.from(rowsByEpoch.entries())
        .sort(([a], [b]) => a - b)
        .map(([, row]) => row);
    const colors = ["#2563eb", "#059669", "#d97706", "#7c3aed", "#dc2626"];
    const activeDevices = props.devices.filter((device) => points.some((point) => point.sample.deviceId === device.id));
    return <div className="hardware-chart-wrap">
        <div className="hardware-chart-summary">
            <Text type="secondary">{metricLabel(props.metric)} · {points.length} 个数据点</Text>
        </div>
        <div className="hardware-chart-canvas" ref={chartRef}>
            {chartWidth > 0 ? <LineChart width={chartWidth} height={280} data={chartData} margin={{top: 10, right: 18, left: 4, bottom: 8}}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb"/>
                <XAxis dataKey="time" tick={{fontSize: 12}} stroke="#64748b"/>
                <YAxis tick={{fontSize: 12}} stroke="#64748b" tickFormatter={(value) => formatMetricValue(props.metric, Number(value))}/>
                <ChartTooltip
                    labelFormatter={(_, items) => {
                        const epoch = items?.[0]?.payload?.epoch;
                        return epoch ? new Date(Number(epoch) * 1000).toLocaleString() : "";
                    }}
                    formatter={(value, name) => [
                        formatMetricValue(props.metric, Number(value)),
                        deviceById.get(String(name))?.name || String(name),
                    ]}
                />
                <Legend formatter={(value) => deviceById.get(String(value))?.name || String(value)}/>
                {activeDevices.map((device, index) => <Line
                    key={device.id}
                    type="monotone"
                    dataKey={device.id}
                    stroke={colors[index % colors.length]}
                    strokeWidth={2.4}
                    dot={{r: 3}}
                    activeDot={{r: 5}}
                    connectNulls
                    isAnimationActive={false}
                />)}
            </LineChart> : null}
        </div>
    </div>;
}

function WidgetForm(props: { form: any, devices: Device[], widget?: DashboardWidget }) {
    const type = Form.useWatch("type", props.form) || props.form.getFieldValue("type") || props.widget?.type || "value";
    const timeRange = Form.useWatch("timeRange", props.form) || props.form.getFieldValue("timeRange") || props.widget?.timeRange || "24h";
    useEffect(() => {
        props.form.setFieldsValue(widgetFormValues(props.widget));
    }, [props.form, props.widget?.id]);
    useEffect(() => {
        if (type === "line") {
            props.form.setFieldsValue({
                timeRange: props.widget?.timeRange || "24h",
                bucket: props.widget?.bucket || "raw",
                agg: props.widget?.agg || "avg",
            });
        }
    }, [props.form, props.widget?.id, type]);
    return <Form form={props.form} layout="vertical" initialValues={widgetFormValues(props.widget)}>
        <Form.Item name="title" label="标题" rules={[{required: true}]}>
            <Input/>
        </Form.Item>
        <Form.Item name="type" label="类型" rules={[{required: true}]}>
            <Select options={[
                {value: "value", label: "实时值"},
                {value: "line", label: "折线图"},
            ]}/>
        </Form.Item>
        <Form.Item name="deviceIds" label="设备" rules={[{required: true}]}>
            <Select mode="multiple" options={props.devices.map((device) => ({value: device.id, label: `${device.name} · ${device.type}`}))}/>
        </Form.Item>
        <Form.Item name="metrics" label="指标" rules={[{required: true}]}>
            <Select mode="multiple" options={metricOptions}/>
        </Form.Item>
        {type === "line" ? <>
            <Form.Item name="timeRange" label="时间范围" rules={[{required: true}]}>
                <Select options={rangeOptions}/>
            </Form.Item>
            {timeRange === "custom" ? <div className="hardware-form-row">
                <Form.Item name="fromTime" label="开始">
                    <Input type="datetime-local"/>
                </Form.Item>
                <Form.Item name="toTime" label="结束">
                    <Input type="datetime-local"/>
                </Form.Item>
            </div> : null}
            <div className="hardware-form-row">
                <Form.Item name="bucket" label="粒度">
                    <Select options={bucketOptions}/>
                </Form.Item>
                <Form.Item name="agg" label="聚合">
                    <Select options={[
                        {value: "avg", label: "平均值"},
                        {value: "max", label: "最大值"},
                        {value: "min", label: "最小值"},
                    ]}/>
                </Form.Item>
            </div>
        </> : null}
    </Form>;
}

function CredentialPanel(props: {
    credentials: Credential[]
    onCreate: () => void
    onEdit: (credential: Credential) => void
    onRotate: (credential: Credential) => void
    onDelete: (credential: Credential) => void
}) {
    return <section className="hardware-panel">
        <div className="hardware-toolbar">
            <Text type="secondary">{props.credentials.length} 个密钥</Text>
            <Button type="primary" icon={<PlusOutlined/>} onClick={props.onCreate}>创建密钥</Button>
        </div>
        {props.credentials.length === 0 ? <Empty description="暂无密钥"/> : <div className="hardware-credential-list">
            {props.credentials.map((credential) => <section className="hardware-card" key={credential.id}>
                <div className="hardware-card-head">
                    <div>
                        <h2>{credential.name}</h2>
                        <div className="hardware-card-meta">
                            {credential.enabled ? <Tag color="success">启用</Tag> : <Tag>停用</Tag>}
                        </div>
                    </div>
                    <Space>
                        <Tooltip title="编辑">
                            <Button aria-label="编辑密钥" icon={<EditOutlined/>} onClick={() => props.onEdit(credential)}/>
                        </Tooltip>
                        <Tooltip title="轮换">
                            <Button aria-label="轮换密钥" icon={<KeyOutlined/>} onClick={() => props.onRotate(credential)}/>
                        </Tooltip>
                    </Space>
                </div>
                <div className="hardware-kv compact">
                    <span>标识</span><strong>{credential.tokenPrefix || "无"}</strong>
                    <span>最近使用</span><strong>{formatDate(credential.lastUsedAt)}</strong>
                    <span>创建时间</span><strong>{formatDate(credential.createdAt)}</strong>
                </div>
                <div className="hardware-card-actions">
                    <Popconfirm title="删除后使用它的硬件将无法接入" onConfirm={() => props.onDelete(credential)}>
                        <Button danger icon={<DeleteOutlined/>}>删除</Button>
                    </Popconfirm>
                </div>
            </section>)}
        </div>}
    </section>;
}
