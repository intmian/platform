import {ReactNode, useCallback, useEffect, useRef, useState} from 'react';
import {Button, List, Result, Table, Tabs, Tooltip} from 'antd';
import {ConfigsCtr, UniConfigModal} from "../common/UniConfig";
import {ConfigsType, ConfigType} from "../common/UniConfigDef";
import {getWebPing} from "../common/newSendHttp";
import {SettingOutlined} from "@ant-design/icons";
import {PageCard, PageHeader} from "../common/PageHeader";
import "./admin.css";


function formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

interface MemoryData {
    total: number;
    used: number;
    free: number;
    shared: number;
    buffers: number;
    cached: number;
    available: number;
    usedPercent: number;
}

interface SwapData {
    total: number;
    used: number;
    free: number;
    usedPercent: number;
}

interface CpuData {
    percent: number;
    info: { modelName: string; cores: number }[];
    times: unknown[];
}

type MemoryInfo = {
    percent: number;
    memoryInfo: MemoryExData;
};

type MemoryExData = {
    rss: number;    // bytes
    vms: number;    // bytes
    hwm: number;    // bytes
    data: number;   // bytes
    stack: number;  // bytes
    locked: number; // bytes
    swap: number;   // bytes
};


interface PerformanceData {
    memory: MemoryData;
    swap: SwapData;
    cpu: CpuData;
    top10Mem: MemoryInfo[];
    top10Cpu: MemoryInfo[];
}

type PerformanceSettingData = {
    hasInit: boolean;
    outUrl: string;
    realUrl: string;
    baseUrl: string;
}

const PerformanceConfigs = new ConfigsCtr(ConfigsType.Plat)
PerformanceConfigs.addBaseConfig('realUrl', '后端真实地址', ConfigType.String, '')
PerformanceConfigs.addBaseConfig('outUrl', 'CDN地址', ConfigType.String, '')
PerformanceConfigs.addBaseConfig('baseUrl', '对比地址', ConfigType.String, '')


interface PingResult {
    ping: number;
    lost: number;
    loading: boolean;
}

// 三个地址各测一次：CDN、后端直连、对比用的基础地址
function usePing(setting: PerformanceSettingData) {
    const empty: PingResult = {ping: 0, lost: 0, loading: true};
    const [ping, setPing] = useState({base: empty, real: empty, out: empty});
    const aliveRef = useRef(true);
    const run = useCallback(async (url: string, key: "base" | "real" | "out") => {
        try {
            const ret = await getWebPing(url);
            if (!aliveRef.current) return;
            const avg = ret.delays.length > 0 ? ret.delays.reduce((sum, d) => sum + d, 0) / ret.delays.length : 0;
            setPing((prev) => ({...prev, [key]: {ping: avg, lost: ret.lossRate, loading: false}}));
        } catch {
            if (!aliveRef.current) return;
            setPing((prev) => ({...prev, [key]: {...prev[key], loading: false}}));
        }
    }, []);
    useEffect(() => {
        aliveRef.current = true;
        if (setting.baseUrl) void run(setting.baseUrl, "base");
        if (setting.realUrl) void run(setting.realUrl, "real");
        if (setting.outUrl) void run(setting.outUrl, "out");
        // 离开页面后测速请求可能还没回来，回来了也不再更新
        return () => {
            aliveRef.current = false;
        };
    }, [setting.baseUrl, setting.realUrl, setting.outUrl, run]);
    return ping;
}

// 比基础地址慢/快多少
function diffText(base: PingResult, cur: PingResult) {
    if (base.loading || cur.loading || base.ping === 0 || cur.ping === 0) return null;
    const pct = ((cur.ping - base.ping) / base.ping) * 100;
    return <span className={pct > 0 ? "is-bad" : "is-good"}>比基础{pct > 0 ? "慢" : "快"} {Math.abs(pct).toFixed(0)}%</span>;
}

function Stat({label, value, sub, bar, onClick}: {
    label: string;
    value: string;
    sub?: ReactNode;
    bar?: { percent: number; color: string };
    onClick?: () => void;
}) {
    const Tag = onClick ? "button" : "div";
    return <Tag className={`adm-stat${onClick ? " is-link" : ""}`} onClick={onClick}>
        <div className="adm-stat-label">{label}</div>
        <div className="adm-stat-value">{value}</div>
        {bar && <div className="adm-bar"><span style={{width: `${Math.min(100, bar.percent)}%`, background: bar.color}}/></div>}
        {sub && <div className="adm-stat-sub">{sub}</div>}
    </Tag>;
}

function KV({items}: { items: { label: string; value: string; meaning: string }[] }) {
    return <div className="adm-kv">
        {items.map((it) => <Tooltip key={it.label} title={it.meaning}>
            <div className="adm-kv-item">
                <span>{it.label}</span>
                <b>{it.value}</b>
            </div>
        </Tooltip>)}
    </div>;
}

const Performance = () => {
    const [data, setData] = useState<PerformanceData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);
    const [showSetting, setShowSetting] = useState(false)
    const [setting, setSetting] = useState<PerformanceSettingData>({
        hasInit: false,
        outUrl: '',
        realUrl: '',
        baseUrl: ''
    })

    useEffect(() => {
        const read = (hasInit: boolean) => setSetting({
            hasInit,
            outUrl: String(PerformanceConfigs.get('outUrl') ?? ''),
            realUrl: String(PerformanceConfigs.get('realUrl') ?? ''),
            baseUrl: String(PerformanceConfigs.get('baseUrl') ?? '')
        })
        read(!PerformanceConfigs.needInit)
        const remove = PerformanceConfigs.addCallback(() => read(true))
        void PerformanceConfigs.init()
        return remove
    }, []);

    // 断线后点“重新连接”时加一，触发下面的 effect 重新建连
    const [connection, setConnection] = useState(0);

    useEffect(() => {
        setError(false);
        setLoading(true);
        const eventSource = new EventSource('/api/admin/system/usage/sse');
        eventSource.onmessage = (event) => {
            try {
                const result = JSON.parse(event.data);
                if (isValidPerformanceData(result)) {
                    setData(result);
                    setLoading(false);
                } else {
                    throw new Error('Invalid data');
                }
            } catch {
                setError(true);
                setLoading(false);
            }
        };

        return () => {
            eventSource.close();
        };
    }, [connection]);

    const columns = [
        {
            title: 'PID',
            dataIndex: 'pid',
            key: 'pid',
        },
        {
            title: '进程名',
            dataIndex: 'name',
            key: 'name',
        },
        {
            title: '内存占用 (%)',
            dataIndex: 'memory',
            key: 'memory',
            render: (memory: MemoryInfo) => (
                <Tooltip title={
                    <div>
                        <p>RSS: {formatBytes(memory.memoryInfo.rss)}</p>
                        <p>VMS: {formatBytes(memory.memoryInfo.vms)}</p>
                        <p>HWM: {formatBytes(memory.memoryInfo.hwm)}</p>
                        <p>Data: {formatBytes(memory.memoryInfo.data)}</p>
                        <p>Stack: {formatBytes(memory.memoryInfo.stack)}</p>
                        <p>Locked: {formatBytes(memory.memoryInfo.locked)}</p>
                        <p>Swap: {formatBytes(memory.memoryInfo.swap)}</p>
                    </div>
                }>
                    {memory.percent.toFixed(2) + '(' + formatBytes(memory.memoryInfo.rss) + ')'}
                </Tooltip>
            ),
        },
        {
            title: 'CPU占用 (%)',
            dataIndex: 'cpu',
            key: 'cpu',
            render: (text: number) => text.toFixed(2),
        },
    ];
    const ping = usePing(setting);
    const pingReady = setting.hasInit && !!setting.baseUrl && !!setting.realUrl && !!setting.outUrl;
    const pingValue = (r: PingResult) => !pingReady ? "未配置" : r.loading ? "测速中" : r.ping ? `${r.ping.toFixed(0)} ms` : "失败";
    const memColor = (p: number) => p > 85 ? "var(--pf-error)" : p > 70 ? "var(--pf-warning)" : "var(--pf-success)";

    const header = <PageHeader
        title="性能"
        meta={error ? "连接已断开" : loading ? "连接中…" : "实时更新"}
        actions={[{key: "setting", label: "测速设置", icon: <SettingOutlined/>, onClick: () => setShowSetting(true)}]}
    />;

    if (error) {
        return <>
            {header}
            <PageCard><Result status="warning" title="连接已断开"
                              extra={<Button onClick={() => setConnection((c) => c + 1)}>重新连接</Button>}/></PageCard>
        </>;
    }

    // 没收到第一份数据前也先把卡片画出来，数字用“-”占位
    const mem = data?.memory;
    const cpu = data?.cpu;
    return <div>
        {header}
        <UniConfigModal name={"测速设置"} ctr={PerformanceConfigs} show={showSetting} onExit={() => setShowSetting(false)}/>
        <div className="adm-stats is-four">
            <Stat label="内存" value={mem ? `${mem.usedPercent.toFixed(1)}%` : "-"}
                  bar={mem && {percent: mem.usedPercent, color: memColor(mem.usedPercent)}}
                  sub={mem && `${formatBytes(mem.used)} / ${formatBytes(mem.total)}`}/>
            <Stat label="CPU" value={cpu ? `${cpu.percent.toFixed(1)}%` : "-"}
                  bar={cpu && {percent: cpu.percent, color: memColor(cpu.percent)}}
                  sub={cpu?.info?.length ? `${cpu.info.reduce((n, i) => n + i.cores, 0)} 核` : undefined}/>
            <Stat label="CDN 延迟" value={pingValue(ping.out)} onClick={pingReady ? undefined : () => setShowSetting(true)}
                  sub={pingReady && !ping.out.loading && <>丢包 {ping.out.lost.toFixed(1)}% {diffText(ping.base, ping.out)}</>}/>
            <Stat label="后端延迟" value={pingValue(ping.real)} onClick={pingReady ? undefined : () => setShowSetting(true)}
                  sub={pingReady && !ping.real.loading && <>丢包 {ping.real.lost.toFixed(1)}% {diffText(ping.base, ping.real)}</>}/>
        </div>

        <PageCard flush>
            <Tabs className="adm-card-tabs" defaultActiveKey="mem" items={[
                {
                    label: '内存占用前 10', key: 'mem',
                    children: <Table dataSource={data?.top10Mem ?? []} loading={loading} columns={columns} rowKey="pid"
                                     pagination={false} scroll={{x: 'max-content'}} size="middle"/>,
                },
                {
                    label: 'CPU 占用前 10', key: 'cpu',
                    children: <Table dataSource={data?.top10Cpu ?? []} loading={loading} columns={columns} rowKey="pid"
                                     pagination={false} scroll={{x: 'max-content'}} size="middle"/>,
                },
            ]}/>
        </PageCard>

        {data && <PageCard title="详情">
            <Tabs size="small" items={[
                {
                    label: '内存', key: 'mem',
                    children: <KV items={[
                        {label: '总内存', value: formatBytes(data.memory.total), meaning: "系统中所有内存的总和"},
                        {label: '已用', value: formatBytes(data.memory.used), meaning: "已经被使用的内存"},
                        {label: '空闲', value: formatBytes(data.memory.free), meaning: "完全没被使用的内存"},
                        {label: '可用', value: formatBytes(data.memory.available), meaning: "可以分配给程序的内存（含可回收的缓存）"},
                        {label: '共享', value: formatBytes(data.memory.shared), meaning: "被多个进程共享的内存"},
                        {label: '缓冲区', value: formatBytes(data.memory.buffers), meaning: "用于块设备缓冲的内存"},
                        {label: '缓存', value: formatBytes(data.memory.cached), meaning: "用于文件缓存的内存"},
                    ]}/>,
                },
                {
                    label: 'Swap', key: 'swap',
                    children: <KV items={[
                        {label: '总量', value: formatBytes(data.swap.total), meaning: "Swap 总大小"},
                        {label: '已用', value: formatBytes(data.swap.used), meaning: "已经被使用的 Swap"},
                        {label: '空闲', value: formatBytes(data.swap.free), meaning: "没被使用的 Swap"},
                        {label: '使用率', value: `${data.swap.usedPercent.toFixed(1)}%`, meaning: "Swap 使用比例"},
                    ]}/>,
                },
                {
                    label: 'CPU', key: 'cpu',
                    children: <List size="small" dataSource={data.cpu.info ?? []}
                                    renderItem={(info, index) => <List.Item key={index}>{info.modelName} · {info.cores} 核</List.Item>}/>,
                },
            ]}/>
        </PageCard>}
    </div>;
};
export default Performance;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function isValidPerformanceData(data: any): data is PerformanceData {
    return data && typeof data.memory === 'object' && typeof data.swap === 'object' && typeof data.cpu === 'object' && Array.isArray(data.top10Mem) && Array.isArray(data.top10Cpu);
}
