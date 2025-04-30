import {useContext, useState} from "react";
import {LoginCtr, LoginCtx} from "../common/loginCtx";
import {Dir} from "./Dir";
import {ConfigsCtr, UniConfig} from "../common/UniConfig";
import {ConfigsType, ConfigType} from "../common/UniConfigDef";
import {Flex, message} from "antd";
import {Addr} from "./addr";
import Group from "./Group";
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
    return <>
        <Flex>
            <div
                style={{
                    flex: 1,
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
                    flex: 1,
                }}
            >
                <Group
                    addr={chooseAddr}
                    GroupTitle={chooseTitle}
                />
            </div>

            <div
                style={{
                    flex: 1,
                }}
            >
                TODO:detail
            </div>
        </Flex>


    </>
}