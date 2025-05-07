import {useContext, useEffect, useRef, useState} from "react";
import {LoginCtr, LoginCtx} from "../common/loginCtx";
import {Dir} from "./Dir";
import {ConfigsCtr, UniConfig} from "../common/UniConfig";
import {ConfigsType, ConfigType} from "../common/UniConfigDef";
import {Drawer, FloatButton, message} from "antd";
import {Addr} from "./addr";
import Group from "./Group";
import {TaskDetail} from "./TaskDetail";
import {PTask} from "./net/protocal";
import {MenuOutlined} from "@ant-design/icons";
import {useIsMobile} from "../common/hooksv2";
import User from "../common/User";
import {useParams} from "react-router-dom";

const TodoneConfigs = new ConfigsCtr(ConfigsType.Server, 'todone')
TodoneConfigs.addBaseConfig('db.account_id', '数据库账号ID', ConfigType.String, 'cloudflare')
TodoneConfigs.addBaseConfig('db.api_token', '数据库token', ConfigType.String, 'cloudflare')
TodoneConfigs.addBaseConfig('db.db_id', '数据库ID', ConfigType.String, 'cloudflare')
TodoneConfigs.addCallback((isInit: boolean) => {
    if (!isInit) {
        message.warning('配置已经更新，需要重启服务').then()
    }
})

// TodoneConfigs.init()


export function TodoneSetting() {
    return <div>
        <UniConfig configCtr={TodoneConfigs}/>
    </div>
}

export function Todone() {
    // 读取路由
    const {group} = useParams();
    // 获得账户
    const loginCtr: LoginCtr = useContext<LoginCtr>(LoginCtx);
    const [chooseAddr, setChooseAddr] = useState<Addr | null>(null);
    const [chooseTitle, setChooseTitle] = useState<string>('')
    const [selectTaskAddr, setSelectTaskAddr] = useState<Addr>();
    const taskRef = useRef<PTask>();
    const refreshApiRef = useRef<() => void>();
    const [showDir, setShowDir] = useState(false);
    const isMobile = useIsMobile()

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

    useEffect(() => {
        document.title = `TODONE 任务板: ${chooseTitle}`;
    }, [chooseTitle]);

    useEffect(() => {
        // 使用竖线分隔group
        if (!group) {
            setShowDir(true);
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
        if (savedAddr && savedTitle) {
            const addr = new Addr(loginCtr.loginInfo.usr);
            addr.bindAddr(savedAddr);
            setChooseAddr(addr);
            setChooseTitle(savedTitle);
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
            title="目录"
            placement="left"
            size={"default"}
            closable={true}
            onClose={() => {
                setShowDir(false);
            }}
            open={showDir}
            extra={<User/>}
            width={isMobile ? '70%' : '400px'}
        >
            <div
                style={{
                    width: "100%",
                }}
            >
                <Dir
                    userID={loginCtr.loginInfo.usr}
                    onSelectGroup={(addr, title) => {
                        setChooseAddr(addr);
                        setChooseTitle(title);
                        // 修改路由
                        const newAddr = addr.toString();
                        const newTitle = title;
                        const newGroup = `${newAddr}|${newTitle}`;
                        // 对group进行URL编码
                        const encodedGroup = encodeURIComponent(newGroup);
                        window.history.replaceState({}, '', `/todone/${encodedGroup}`);
                        setShowDir(false);
                        // 修改标题
                        document.title = `TODONE 任务板: ${title}`;
                    }}
                    onSelectDir={(addr) => {
                        // 暂无逻辑
                    }}
                />
            </div>
        </Drawer>

        <div
            style={{
                width: isMobile ? '80%' : '650px',
                minHeight: '100%',
            }}
        >
            <Group
                addr={chooseAddr}
                GroupTitle={chooseTitle}
                onSelectTask={(addr, pTask, refreshApi) => {
                    setSelectTaskAddr(addr);
                    taskRef.current = pTask;
                    refreshApiRef.current = refreshApi;
                }}
            />
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
            <TaskDetail addr={selectTaskAddr} task={taskRef.current} refreshApi={refreshApiRef.current}/>
        </Drawer>


    </div>
}