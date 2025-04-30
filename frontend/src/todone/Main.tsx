import {useContext, useRef, useState} from "react";
import {LoginCtr, LoginCtx} from "../common/loginCtx";
import {Dir} from "./Dir";
import {ConfigsCtr, UniConfig} from "../common/UniConfig";
import {ConfigsType, ConfigType} from "../common/UniConfigDef";
import {Flex, message} from "antd";
import {Addr} from "./addr";
import Group from "./Group";
import {useParams} from "react-router-dom";
import {PTask} from "./net/protocal";
import {TaskDetail} from "./TaskDetail";

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
    // 获得账户
    const loginCtr: LoginCtr = useContext<LoginCtr>(LoginCtx);

    // 获取参数
    const params = useParams()
    const {addrStr} = params
    const urlAddr = new Addr(loginCtr.loginInfo.usr)
    if (addrStr) {
        urlAddr.bindAddr(addrStr)
    }

    const [chooseAddr, setChooseAddr] = useState<Addr | null>(null);
    const [chooseTitle, setChooseTitle] = useState<string>('')

    const selectTaskAddrRef = useRef<Addr>();
    const selectTaskRef = useRef<PTask>();
    const refreshApiRef = useRef<() => void>();

    return <>
        <Flex>
            <div
                style={{
                    width: 300,
                }}
            >
                <Dir
                    // TODO 手机端要收起来
                    userID={loginCtr.loginInfo.usr}
                    onSelectGroup={(addr, title) => {
                        setChooseAddr(addr);
                        setChooseTitle(title);
                    }}
                    onSelectDir={(addr) => {
                        // 暂无逻辑
                    }}
                />
            </div>
            <div
                style={{
                    width: 650,
                }}
            >
                <Group
                    addr={chooseAddr}
                    GroupTitle={chooseTitle}
                    onSelectTask={(addr, pTask, callback) => {
                        console.log(addr, pTask, callback);
                        selectTaskAddrRef.current = addr;
                        selectTaskRef.current = pTask;
                        refreshApiRef.current = callback;
                    }}
                />
            </div>

            <div
                style={{
                    flex: 1,
                }}
            >
                <TaskDetail addr={selectTaskAddrRef.current}
                            task={selectTaskRef.current}
                            refreshApi={refreshApiRef.current}
                />
            </div>
        </Flex>


    </>
}