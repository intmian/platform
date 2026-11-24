import {useEffect, useState} from "react";
import {Button, Empty, Flex, message, Popconfirm, Spin} from "antd";
import {useNavigate} from "react-router-dom";
import {ReloadOutlined} from "@ant-design/icons";
import {PageHeader} from "../common/PageHeader";
import dayjs from "dayjs";
import {TimeFromStart} from "../common/misc";
import {getLastLogs, getServices, ServiceInfo, setServiceRunning} from "./adminApi";
import {parseLine} from "./Log";
import "./admin.css";

type ServiceKind = "核心" | "模组" | "微服务" | "未知";

// 后端 SvrProp 位标记
function kindOf(props: number): ServiceKind {
    if ((props & 2) !== 0) return "核心";
    if ((props & 4) !== 0) return "模组";
    if ((props & 8) !== 0) return "微服务";
    return "未知";
}

const SERVICE_NAMES: Record<string, string> = {
    auto: "自动任务平台",
    core: "系统",
    account: "账号服务",
    cmd: "脚本管理",
    todone: "TODONE",
};

// 页面上的分组：核心和模组不能单独开关，放一组
const GROUPS: { title: string; kinds: ServiceKind[] }[] = [
    {title: "核心与模组", kinds: ["核心", "模组"]},
    {title: "微服务", kinds: ["微服务"]},
    {title: "其他", kinds: ["未知"]},
];

const isRunning = (s: ServiceInfo) => s.Status === "start";

function ServiceCard({service, onChanged}: { service: ServiceInfo; onChanged: (s: ServiceInfo) => void }) {
    const [loading, setLoading] = useState(false);
    const kind = kindOf(service.Props);
    const name = SERVICE_NAMES[service.Name] ?? service.Name;
    const running = isRunning(service);
    const locked = kind === "核心" || kind === "模组";

    const toggle = async () => {
        setLoading(true);
        try {
            await setServiceRunning(service.Name, !running);
            onChanged({...service, Status: running ? "stop" : "start", StartTime: dayjs().format("YYYY-MM-DD HH:mm:ss")});
            message.success(`${name}已${running ? "关闭" : "开启"}`);
        } catch (e) {
            message.error(e instanceof Error ? `操作失败：${e.message}` : "操作失败");
        } finally {
            setLoading(false);
        }
    };

    return <div className={`adm-svc${running ? "" : " is-stopped"}`}>
        <div className="adm-svc-head">
            <span className="adm-dot"/>
            <span className="adm-svc-name">{name}</span>
            {locked
                ? <span className="adm-svc-lock">常驻</span>
                : <Popconfirm title={`${running ? "关闭" : "开启"}${name}？`} okText="确定" cancelText="取消"
                              onConfirm={() => void toggle()}>
                    <Button size="small" type="text" loading={loading} danger={running}>{running ? "关闭" : "开启"}</Button>
                </Popconfirm>}
        </div>
        <div className="adm-svc-meta">
            {running ? "已运行" : "已停止"}
            {running && <TimeFromStart startTime={service.StartTime}/>}
        </div>
    </div>;
}

export function Monitor() {
    const navigate = useNavigate();
    const [services, setServices] = useState<ServiceInfo[] | null>(null);
    const [failed, setFailed] = useState("");
    // 最近日志里的错误、警告条数（日志接口只给最近的一批）
    const [issues, setIssues] = useState<{ error: number; warning: number } | null>(null);
    const [reloadKey, setReloadKey] = useState(0);

    useEffect(() => {
        let cancelled = false;
        setFailed("");
        getServices()
            .then((list) => !cancelled && setServices(list))
            .catch((e: Error) => !cancelled && setFailed(e.message));
        getLastLogs()
            .then((lines) => {
                if (cancelled) return;
                const rows = lines.map(parseLine);
                setIssues({
                    error: rows.filter((r) => r.level === "ERROR").length,
                    warning: rows.filter((r) => r.level === "WARNING").length,
                });
            })
            .catch(() => !cancelled && setIssues(null));
        return () => {
            cancelled = true;
        };
    }, [reloadKey]);

    const stopped = services?.filter((s) => !isRunning(s)) ?? [];
    const core = services?.find((s) => s.Name === "core");
    const update = (next: ServiceInfo) => setServices((list) => list && list.map((s) => s.Name === next.Name ? next : s));

    const header = <PageHeader
        title="监控"
        meta={services && (stopped.length ? `${services.length} 个服务，${stopped.length} 个已停止` : `${services.length} 个服务，全部运行中`)}
        actions={[{key: "reload", label: "刷新", icon: <ReloadOutlined/>, onClick: () => setReloadKey((k) => k + 1)}]}
    />;

    if (failed) {
        return <>{header}<Empty description={`服务列表加载失败：${failed}`}/></>;
    }
    if (services === null) {
        return <>{header}<Flex justify="center" style={{padding: 48}}><Spin/></Flex></>;
    }

    return <div className="adm-monitor">
        {header}
        <div className="adm-stats">
            {core && <div className="adm-stat">
                <div className="adm-stat-label">系统已运行</div>
                <div className="adm-stat-value"><TimeFromStart startTime={core.StartTime}/></div>
            </div>}
            <div className="adm-stat">
                <div className="adm-stat-label">启动于</div>
                <div className="adm-stat-value is-small">{core ? dayjs(core.StartTime).format("M月D日 HH:mm") : "-"}</div>
            </div>
            <button className="adm-stat is-link" onClick={() => navigate("../log?level=problem", {relative: "path"})}>
                <div className="adm-stat-label">最近日志</div>
                <div className="adm-stat-value is-small">
                    {issues === null ? "-" : issues.error + issues.warning === 0
                        ? <span className="is-good">没有错误和警告</span>
                        : <>
                            {issues.error > 0 && <span className="is-bad">错误 {issues.error}</span>}
                            {issues.warning > 0 && <span className="is-warn">警告 {issues.warning}</span>}
                        </>}
                </div>
            </button>
        </div>
        {GROUPS.map((g) => {
            // 后端返回的顺序每次不一样，组内按名字排，免得刷新一次卡片换一次位置
            const list = services.filter((s) => g.kinds.includes(kindOf(s.Props)))
                .sort((a, b) => a.Name.localeCompare(b.Name));
            if (list.length === 0) return null;
            return <section key={g.title} className="adm-group">
                <div className="adm-group-title">{g.title}</div>
                <div className="adm-svc-grid">
                    {list.map((s) => <ServiceCard key={`${s.Name}-${reloadKey}`} service={s} onChanged={update}/>)}
                </div>
            </section>;
        })}
    </div>;
}
