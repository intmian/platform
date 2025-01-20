import {useCallback, useEffect, useRef, useState} from 'react';
import {
    Button,
    Card,
    Col,
    Flex,
    List,
    Modal,
    Progress,
    Result,
    Row,
    Space,
    Spin,
    Statistic,
    Table,
    Tabs,
    Tooltip,
    Typography
} from 'antd';
import TabPane from "antd/es/tabs/TabPane";
import {Configs, UniConfig} from "../common/UniConfig";
import {ConfigType, UniConfigType} from "../common/UniConfigDef";
import {getWebPing} from "../common/newSendHttp";
import {SettingOutlined} from "@ant-design/icons";

const {Text} = Typography

function formatBytes(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
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
    info: any[];
    times: any[];
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
    init: boolean;
    outUrl: string;
    realUrl: string;
    baseUrl: string;
}

function PerformanceSettings({onChange, onExit, show}: {
    onChange: (data: PerformanceSettingData) => void,
    onExit: () => void,
    show: boolean
}) {
    const configRef = useRef(new Configs(() => {
        onChange({
            init: true,
            outUrl: configRef.current.get('outUrl'),
            realUrl: configRef.current.get('realUrl'),
            baseUrl: configRef.current.get('baseUrl'),
        })
    }, ConfigType.Plat))
    useEffect(() => {
        configRef.current.addBase('realUrl', '后端真实地址', UniConfigType.String, '')
        configRef.current.addBase('outUrl', 'CDN地址', UniConfigType.String, '')
        configRef.current.addBase('baseUrl', '对比地址', UniConfigType.String, '')
    }, []);
    return <Modal
        open={show}
        footer={null}
        maskClosable={true}
        onCancel={() => {
            onExit()
        }}
    >
        <UniConfig
            configs={configRef.current}
        />
    </Modal>
}

export function Ping({setting}: { setting: PerformanceSettingData }) {
    const [pingData, setPingData] = useState({
        base: {ping: 0, lost: 0, loading: true},
        real: {ping: 0, lost: 0, loading: true},
        out: {ping: 0, lost: 0, loading: true}
    })

    const fetchPingData = useCallback(async (url: string, key: keyof typeof pingData) => {
        try {
            const ret = await getWebPing(url)
            const averagePing = ret.delays.length > 0 ? ret.delays.reduce((sum, delay) => sum + delay, 0) / ret.delays.length : 0
            setPingData(prevState => ({
                ...prevState,
                [key]: {
                    ping: averagePing,
                    lost: ret.lossRate,
                    loading: false
                }
            }))
        } catch (error) {
            console.error(`Error fetching ping data from ${url}:`, error)
            setPingData(prevState => ({
                ...prevState,
                [key]: {
                    ...prevState[key],
                    loading: false
                }
            }))
        }
    }, [])

    useEffect(() => {
        if (setting.baseUrl) fetchPingData(setting.baseUrl, 'base')
        if (setting.realUrl) fetchPingData(setting.realUrl, 'real')
        if (setting.outUrl) fetchPingData(setting.outUrl, 'out')
    }, [setting.baseUrl, setting.realUrl, setting.outUrl, fetchPingData])

    // 计算延迟对比
    const calculatePingDifference = (ping1: number, ping2: number) => {
        if (ping1 === 0 || ping2 === 0) return 0
        return ((ping2 - ping1) / ping1) * 100
    }

    // 是否完全加载完成
    const isLoaded = !pingData.base.loading && !pingData.real.loading && !pingData.out.loading
    const isSettingEnough = setting.init && setting.baseUrl && setting.realUrl && setting.outUrl

    return <Flex justify={
        'space-between'
    } wrap={
        'wrap'
    }>
        {!isLoaded && isSettingEnough ? <div style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                backgroundColor: 'rgba(0, 0, 0, 0.2)',
                zIndex: 1,
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center'
            }}>
                <Spin/>
            </div>
            : null}
        {!isSettingEnough ? <div style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                backgroundColor: 'rgba(0, 0, 0, 0.2)',
                zIndex: 1,
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center'
            }}>
                <div style={{fontSize: '18px'}}>需要先进行配置</div>
            </div>
            : null}
        <Card
            style={{
                width: 250,
                height: 120,
                margin: '8px'
            }}
        >
            <Flex justify="space-between">
                <Statistic
                    title={"CDN ping"}
                    value={pingData.out.ping}
                    suffix="ms"
                    precision={2}
                />
                <Statistic
                    title={"CDN 丢包率"}
                    value={pingData.out.lost}
                    suffix="%"
                    precision={2}
                />
            </Flex>
            <Space
                style={{
                    // 靠右
                    float: 'right'
                }}
            >
                <Text type={calculatePingDifference(pingData.real.ping, pingData.out.ping) > 0 ? 'danger' : 'success'}>
                    {`${calculatePingDifference(pingData.real.ping, pingData.out.ping).toFixed(2)}%`}
                </Text>
                <Text type={calculatePingDifference(pingData.base.ping, pingData.out.ping) > 0 ? 'danger' : 'success'}>
                    {`${calculatePingDifference(pingData.base.ping, pingData.out.ping).toFixed(2)}%`}
                </Text>
            </Space>
        </Card>
        <Card
            style={{
                width: 250,
                height: 120,
                margin: '8px'
            }}
        >
            <Flex justify="space-between">
                <Statistic
                    title={"后端 ping"}
                    value={pingData.real.ping}
                    suffix="ms"
                    precision={2}
                />
                <Statistic
                    title={"后端 丢包率"}
                    value={pingData.real.lost}
                    suffix="%"
                    precision={2}
                />
            </Flex>
            <Text type={calculatePingDifference(pingData.base.ping, pingData.real.ping) > 0 ? 'danger' : 'success'}
                  style={{
                      // 靠右
                      float: 'right'
                  }}
            >
                {`${calculatePingDifference(pingData.base.ping, pingData.real.ping).toFixed(2)}%`}
            </Text>
        </Card>
        <Card
            style={{
                width: 250,
                height: 120,
                margin: '8px'
            }}
        >
            <Flex justify="space-between">
                <Statistic
                    title={"基础 ping"}
                    value={pingData.base.ping}
                    suffix="ms"
                    precision={2}
                />
                <Statistic
                    title={"基础 丢包率"}
                    value={pingData.base.lost}
                    suffix="%"
                    precision={2}
                />
            </Flex>
        </Card>

    </Flex>
}


const Performance = () => {
    const [data, setData] = useState<PerformanceData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);
    const [showSetting, setShowSetting] = useState(false)
    const [setting, setSetting] = useState<PerformanceSettingData>({init: false, outUrl: '', realUrl: '', baseUrl: ''})

    useEffect(() => {
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
    }, []);

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
                    {memory.percent.toFixed(2) + '(' + formatBytes(memory.memoryInfo.rss) + '|' + formatBytes(memory.memoryInfo.swap) + ')'}
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
    if (loading) {
        return <Spin
            style={{display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh'}}/>;
    }

    if (error || !data) {
        return <Result status="error" title="Error" subTitle="停留时间过长，请刷新界面"/>;
    }

    return (
        <div>
            <div style={{
                textAlign: 'right',
            }}>
                <Button
                    style={{
                        marginBottom: 16,
                    }}
                    onClick={() => setShowSetting(true)}
                    type={"primary"}
                    icon={<SettingOutlined/>}
                />
            </div>
            <PerformanceSettings show={showSetting} onChange={setSetting} onExit={() => setShowSetting(false)}/>
            <Card>
                <Row gutter={16}>
                    <Col span={12}>
                        <p>内存使用率</p>
                        <Progress
                            type="dashboard"
                            percent={data.memory.usedPercent}
                            format={percent => `${percent?.toFixed(2)}%`}
                            strokeColor="#3f8600"
                        />
                    </Col>
                    <Col span={12}>
                        <p>CPU 使用率</p>
                        <Progress
                            type="dashboard"
                            percent={data.cpu.percent}
                            format={percent => `${percent?.toFixed(2)}%`}
                            strokeColor="#cf1322"
                        />
                    </Col>
                </Row>
            </Card>

            <Card
                style={{marginTop: 24}}
            >
                <Ping setting={setting}/>
            </Card>

            <Card
                style={{marginTop: 24}}
            >
                <Tabs defaultActiveKey="1"
                      items={[
                          {
                              label: '内存 top10',
                              key: '1',
                              children: <Table
                                  dataSource={data.top10Mem}
                                  columns={columns}
                                  rowKey="pid"
                                  pagination={false}
                                  scroll={{x: 'max-content'}}
                              />
                          },
                          {
                              label: 'CPU top10',
                              key: '2',
                              children: <Table
                                  dataSource={data.top10Cpu}
                                  columns={columns}
                                  rowKey="pid"
                                  pagination={false}
                                  scroll={{x: 'max-content'}}
                              />
                          }
                      ]}
                >
                </Tabs>
            </Card>


            <Card style={{marginTop: 24}}>
                <Tabs defaultActiveKey="1"
                      items={[
                          {
                              label: '内存详情',
                              key: '1',
                              children: <Flex wrap gap={"small"}>
                                  {[
                                      {
                                          label: '总内存',
                                          value: formatBytes(data.memory.total),
                                          meaning: "总内存是指系统中所有内存的总和"
                                      },
                                      {
                                          label: '已用内存',
                                          value: formatBytes(data.memory.used),
                                          meaning: "已用内存是指系统中已经被使用的内存"
                                      },
                                      {
                                          label: '空闲内存',
                                          value: formatBytes(data.memory.free),
                                          meaning: "空闲内存是指系统中未被使用的内存"
                                      },
                                      {
                                          label: '共享内存',
                                          value: formatBytes(data.memory.shared),
                                          meaning: "共享内存是指系统中被多个进程共享的内存"
                                      },
                                      {
                                          label: '缓冲区',
                                          value: formatBytes(data.memory.buffers),
                                          meaning: "缓冲区是指系统中用于缓冲的内存"
                                      },
                                      {
                                          label: '缓存',
                                          value: formatBytes(data.memory.cached),
                                          meaning: "缓存是指系统中用于文件缓存的内存"
                                      },
                                      {
                                          label: '可用内存',
                                          value: formatBytes(data.memory.available),
                                          meaning: "可用内存是指系统中可以被使用的内存"
                                      },
                                  ].map((item, index) => (
                                      <Card key={index} style={{


                                          width: 130,
                                          marginBottom: 4,
                                      }}>
                                          <Card.Meta
                                              title={<Tooltip title={item.meaning}>{item.label}</Tooltip>}
                                              description={item.value}
                                          />
                                      </Card>
                                  ))}
                              </Flex>
                          },
                          {
                              label: 'Swap详情',
                              key: '2',
                              children: <Flex wrap gap={"small"}>
                                  {[
                                      {
                                          label: '总Swap',
                                          value: formatBytes(data.swap.total),
                                          meaning: "总Swap是指系统中所有Swap的总和"
                                      },
                                      {
                                          label: '已用Swap',
                                          value: formatBytes(data.swap.used),
                                          meaning: "已用Swap是指系统中已经被使用的Swap"
                                      },
                                      {
                                          label: '空闲Swap',
                                          value: formatBytes(data.swap.free),
                                          meaning: "空闲Swap是指系统中未被使用的Swap"
                                      },
                                      {
                                          label: 'Swap使用率',
                                          value: `${data.swap.usedPercent.toFixed(2)}%`,
                                          meaning: "Swap使用率是指系统中Swap的使用率"
                                      },
                                  ].map((item, index) => (
                                      <Card key={index} style={{
                                          width: 150,
                                          marginBottom: 16,
                                      }}>
                                          <Card.Meta
                                              title={<Tooltip title={item.meaning}>{item.label}</Tooltip>}
                                              description={item.value}
                                          />
                                      </Card>
                                  ))}
                              </Flex>
                          },
                          {
                              label: 'CPU详情',
                              key: '3',
                              children: <List
                                  dataSource={data.cpu.info}
                                  renderItem={(info, index) => (
                                      <List.Item key={index}>
                                          {info.modelName} - {info.cores} 核心
                                      </List.Item>
                                  )}
                              />
                          },
                      ]}
                >
                    <TabPane tab="内存详情" key="1">

                    </TabPane>
                    <TabPane tab="Swap详情" key="2">


                    </TabPane>
                    <TabPane tab="CPU详情" key="3">
                        <List
                            dataSource={data.cpu.info}
                            renderItem={(info, index) => (
                                <List.Item key={index}>
                                    {info.modelName} - {info.cores} 核心
                                </List.Item>
                            )}
                        />
                    </TabPane>
                </Tabs>
            </Card>
        </div>
    );
};
export default Performance;

function isValidPerformanceData(data: any): data is PerformanceData {
    return data && typeof data.memory === 'object' && typeof data.swap === 'object' && typeof data.cpu === 'object' && Array.isArray(data.top10Mem) && Array.isArray(data.top10Cpu);
}
