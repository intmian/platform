import {useEffect, useState} from "react";
import {Button, Card, Empty, Flex, message, Popconfirm, Space, Spin, Tag, Typography} from "antd";
import dayjs from "dayjs";
import {TimeFromStart} from "../common/misc";
import {useIsMobile} from "../common/breakpoints";
import {getServices, ServiceInfo, setServiceRunning} from "./adminApi";

type ServiceKind = "核心" | "模组" | "微服务" | "未知";

// 后端 SvrProp 位标记
function kindOf(props: number): ServiceKind {
    if ((props & 2) !== 0) return "核心";
    if ((props & 4) !== 0) return "模组";
    if ((props & 8) !== 0) return "微服务";
    return "未知";
}

const KIND_ORDER: ServiceKind[] = ["核心", "模组", "微服务", "未知"];

const SERVICE_NAMES: Record<string, string> = {
    auto: "自动任务平台",
    core: "系统",
    account: "账号服务",
    cmd: "脚本管理",
    todone: "TODONE",
};

function StatusDot({running}: { running: boolean }) {
    return <span title={running ? "运行中" : "已停止"} style={{
        display: "inline-block",
        width: 8,
        height: 8,
        borderRadius: "50%",
        background: running ? "var(--pf-success)" : "var(--pf-error)",
    }}/>;
}

function ServiceCard({service}: { service: ServiceInfo }) {
    const [startTime, setStartTime] = useState(service.StartTime);
    const [running, setRunning] = useState(service.Status === "start");
    const [loading, setLoading] = useState(false);
    const isMobile = useIsMobile();

    const kind = kindOf(service.Props);
    const name = SERVICE_NAMES[service.Name] ?? service.Name;
    // 核心和模组不能单独开关
    const locked = kind === "核心" || kind === "模组";

    const toggle = async () => {
        setLoading(true);
        try {
            await setServiceRunning(service.Name, !running);
            setRunning(!running);
            setStartTime(dayjs().format("YYYY-MM-DD HH:mm:ss"));
            message.success(`${name}已${running ? "关闭" : "开启"}`);
        } catch (e) {
            message.error(e instanceof Error ? `操作失败：${e.message}` : "操作失败");
        } finally {
            setLoading(false);
        }
    };

    return <Card size="small" style={{width: isMobile ? "100%" : 300}}>
        <Flex justify="space-between" align="center" gap={8}>
            <Space size={8}>
                <StatusDot running={running}/>
                <Typography.Text strong>{name}</Typography.Text>
                <Tag color={locked ? "red" : "blue"} bordered={false}>{kind}</Tag>
            </Space>
            <Popconfirm
                title={`${running ? "关闭" : "开启"}${name}？`}
                okText="确定"
                cancelText="取消"
                disabled={locked}
                onConfirm={() => void toggle()}
            >
                <Button size="small" disabled={locked} loading={loading} danger={running}>
                    {running ? "关闭" : "开启"}
                </Button>
            </Popconfirm>
        </Flex>
        <Typography.Text type="secondary" style={{display: "flex", gap: 6, marginTop: 8, fontSize: 13}}>
            {running ? "已运行" : "已停止"}
            <TimeFromStart startTime={startTime}/>
        </Typography.Text>
    </Card>;
}

export function Monitor() {
    const [services, setServices] = useState<ServiceInfo[] | null>(null);
    const [failed, setFailed] = useState("");

    useEffect(() => {
        let cancelled = false;
        getServices()
            .then((list) => !cancelled && setServices(list))
            .catch((e: Error) => !cancelled && setFailed(e.message));
        return () => {
            cancelled = true;
        };
    }, []);

    if (failed) {
        return <Empty description={`服务列表加载失败：${failed}`}/>;
    }
    if (services === null) {
        return <Flex justify="center" style={{padding: 48}}><Spin/></Flex>;
    }

    const sorted = [...services].sort((a, b) => KIND_ORDER.indexOf(kindOf(a.Props)) - KIND_ORDER.indexOf(kindOf(b.Props)));
    return <Flex wrap="wrap" gap="small">
        {sorted.map((s) => <ServiceCard key={s.Name} service={s}/>)}
    </Flex>;
}
