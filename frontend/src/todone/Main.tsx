import {useContext, useEffect, useRef, useState} from "react";
import {LoginCtr, LoginCtx} from "../common/loginCtx";
import {Dir} from "./Dir";
import {ConfigsCtr, UniConfig} from "../common/UniConfig";
import {ConfigsType, ConfigType} from "../common/UniConfigDef";
import {Card, Drawer, FloatButton, message, theme} from "antd";
import {Addr} from "./addr";
import Group from "./Group";
import {TaskDetail} from "./TaskDetail";
import {GroupType, PTask} from "./net/protocal";
import {MenuOutlined, StarOutlined} from "@ant-design/icons";
import {useIsMobile} from "../common/hooksv2";
import User from "../common/User";
import {useParams} from "react-router-dom";
import TaskTree from "./TaskTree";
import Library from "./Library";
import Routine from "./Routine";
import {useLoginGate} from "../common/useLoginGate";
import Overview from "./Overview";
import {OverviewGroup} from "./net/send_back";
import {locateInPage, LocateTarget} from "./locate";

const TodoneConfigs = new ConfigsCtr(ConfigsType.Server, 'todone')
TodoneConfigs.addBaseConfig('db.worker_endpoint', 'Worker Endpoint', ConfigType.String, 'https://worker.example.com')
TodoneConfigs.addBaseConfig('db.worker_token', 'Worker Token', ConfigType.String, '', {secret: true})
TodoneConfigs.addCallback((isInit: boolean) => {
    if (!isInit) {
        message.warning('配置已经更新，需要重启服务').then()
    }
})

export function TodoneSetting() {
    return <Card title="Todone Worker 配置" style={{marginBottom: 16}}>
        <UniConfig configCtr={TodoneConfigs}/>
    </Card>
}

function groupPageTitle(groupType: number, title: string, overview = false) {
    if (overview) {
        return 'TODONE 关注';
    }
    switch (groupType) {
        case GroupType.Library:
            return `TODONE 娱乐库: ${title}`;
        case GroupType.Routine:
            return `TODONE 例行清单: ${title}`;
        default:
            return `TODONE 任务板: ${title}`;
    }
}

export function Todone() {
    // 读取路由
    const {group} = useParams();
    // 获得账户
    const loginCtr: LoginCtr = useContext<LoginCtr>(LoginCtx);
    const [chooseAddr, setChooseAddr] = useState<Addr | null>(null);
    const [chooseTitle, setChooseTitle] = useState<string>('')
    const [chooseGroupType, setChooseGroupType] = useState<number>(GroupType.Normal);
    const [selectTaskAddr, setSelectTaskAddr] = useState<Addr>();
    const taskRef = useRef<PTask>();
    const refreshApiRef = useRef<() => void>();
    const treeRef = useRef<TaskTree>();
    const [showDir, setShowDir] = useState(false);
    const isMobile = useIsMobile()
    const {token} = theme.useToken();
    const {loginPanel} = useLoginGate();

    // 更换Favicon为/todone-mini.png
    useEffect(() => {
        const existingFavicon = document.querySelector('link[rel="icon"], link[rel="shortcut icon"]');
        if (existingFavicon) {
            existingFavicon.remove();
        }

        const link = document.createElement('link');
        link.type = 'image/x-icon';
        link.rel = 'shortcut icon';
        link.href = '/todone-mini.png';
        document.getElementsByTagName('head')[0].appendChild(link);

    }, []);

    const showOverview = chooseAddr === null;

    useEffect(() => {
        document.title = groupPageTitle(chooseGroupType, chooseTitle, showOverview);
    }, [chooseTitle, chooseGroupType, showOverview]);

    const openGroup = (addr: Addr, title: string, groupType: number) => {
        setChooseAddr(addr);
        setChooseTitle(title);
        setChooseGroupType(groupType);
        const encodedGroup = encodeURIComponent(`${addr.toString()}|${title}|${groupType}`);
        window.history.pushState({}, '', `/todone/${encodedGroup}`);
        setShowDir(false);
    };

    const openOverview = () => {
        setChooseAddr(null);
        setChooseTitle('');
        setChooseGroupType(GroupType.Normal);
        window.history.pushState({}, '', '/todone');
        setShowDir(false);
    };

    // 从“关注”页打开清单；带了 target 就滚到那条任务（或那一栏）并闪一下
    const openOverviewGroup = (g: OverviewGroup, target?: LocateTarget) => {
        const addr = new Addr(loginCtr.loginInfo.usr);
        addr.addDir(g.DirID);
        addr.addGroup(g.GroupID);
        openGroup(addr, g.Title, g.Type);
        if (target) locateInPage(target);
    };

    // 浏览器后退/前进：按地址栏重新解析
    useEffect(() => {
        const onPop = () => {
            const m = window.location.pathname.match(/^\/todone\/?(.*)$/);
            const raw = m?.[1] ? decodeURIComponent(m[1]) : '';
            const parts = raw.split('|');
            if (parts.length < 2 || !parts[0] || !parts[1]) {
                setChooseAddr(null);
                setChooseTitle('');
                setChooseGroupType(GroupType.Normal);
                return;
            }
            const addr = new Addr(loginCtr.loginInfo.usr);
            addr.bindAddr(parts[0]);
            setChooseAddr(addr);
            setChooseTitle(parts[1]);
            setChooseGroupType(parts[2] ? parseInt(parts[2]) : GroupType.Normal);
        };
        window.addEventListener('popstate', onPop);
        return () => window.removeEventListener('popstate', onPop);
    }, [loginCtr.loginInfo.usr]);

    useEffect(() => {
        // 使用竖线分隔group: addr|title|type
        if (!group) {
            // 没选分组时显示总视图
            setChooseAddr(null);
            setChooseTitle('');
            setChooseGroupType(GroupType.Normal);
            return;
        }
        // url解码
        const decodedGroup = decodeURIComponent(group);
        const groupData = decodedGroup.split('|');
        if (groupData.length < 2) {
            setShowDir(true);
            return;
        }
        const savedAddr = groupData[0];
        const savedTitle = groupData[1];
        const savedType = groupData[2] ? parseInt(groupData[2]) : GroupType.Normal;
        if (savedAddr && savedTitle) {
            const addr = new Addr(loginCtr.loginInfo.usr);
            addr.bindAddr(savedAddr);
            setChooseAddr(addr);
            setChooseTitle(savedTitle);
            setChooseGroupType(savedType);
        } else {
            setShowDir(true);
        }
    }, [group, loginCtr.loginInfo.usr]);

    return <div
        style={{
            // 居中
            display: 'flex',
            justifyContent: 'center',
        }}
    >
        {!showDir ?
            <FloatButton
                style={{
                    // 左上角
                    left: 10,
                    top: 30,
                }}
                icon={<MenuOutlined/>}
                tooltip={<div>目录</div>}
                onClick={() => {
                    setShowDir(true);
                }}
            /> : null}
        <Drawer
            autoFocus={false}
            title="目录"
            placement="left"
            size={"default"}
            closable={true}
            onClose={() => {
                setShowDir(false);
            }}
            open={showDir}
            extra={<User autoOpenLoginPanel={false}/>}
            width={isMobile ? '70%' : '400px'}
        >
            <div
                style={{
                    width: "100%",
                }}
            >
                <div
                    onClick={openOverview}
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        padding: '6px 10px',
                        marginBottom: 12,
                        borderRadius: token.borderRadius,
                        cursor: 'pointer',
                        fontWeight: 500,
                        color: showOverview ? token.colorPrimary : token.colorText,
                        background: showOverview ? token.colorPrimaryBg : token.colorFillQuaternary,
                    }}
                >
                    <StarOutlined/> 关注
                </div>
                <Dir
                    userID={loginCtr.loginInfo.usr}
                    onSelectGroup={(addr, title, groupType) => {
                        openGroup(addr, title, groupType ?? GroupType.Normal);
                    }}
                    onSelectDir={(addr) => {
                        // 暂无逻辑
                    }}
                />
            </div>
        </Drawer>

        <div
            style={{
            // 总视图在宽屏是看板，铺满；窄一点时由 Overview 自己限宽居中
            width: showOverview
                ? (isMobile ? '90%' : '94%')
                : (isMobile || chooseGroupType === GroupType.Library) ? '90%' : '650px',
            minHeight: '100%',
            }}
        >
            {showOverview ? (
                <Overview userID={loginCtr.loginInfo.usr} onOpenGroup={openOverviewGroup}/>
            ) : chooseGroupType === GroupType.Library ? (
                <Library
                    addr={chooseAddr}
                    groupTitle={chooseTitle}
                />
            ) : chooseGroupType === GroupType.Routine ? (
                <Routine
                    key={chooseAddr?.toString()}
                    addr={chooseAddr}
                    groupTitle={chooseTitle}
                />
            ) : (
                <Group
                    addr={chooseAddr}
                    GroupTitle={chooseTitle}
                    onSelectTask={(addr, pTask, refreshApi, tree) => {
                        setSelectTaskAddr(addr);
                        taskRef.current = pTask;
                        refreshApiRef.current = refreshApi;
                        treeRef.current = tree;
                    }}
                />
            )}
        </div>

        <Drawer
            title="任务详情"
            placement="right"
            closable={true}
            onClose={() => {
                setSelectTaskAddr(undefined);
            }}
            open={selectTaskAddr !== undefined}
            width={isMobile ? '80%' : '400px'}
        >
            <TaskDetail addr={selectTaskAddr} task={taskRef.current} refreshApi={refreshApiRef.current}
                        tree={treeRef.current}
            />
        </Drawer>

        {loginPanel}


    </div>
}
