import {Empty, Layout} from "antd";
import {Monitor} from "./Monitor.jsx";
import {Log} from "./Log.jsx";
import {Config} from "./Config.jsx";
import {LoginCtx} from "../common/loginCtx.jsx";
import {useContext} from "react";
import {AccountAdmin} from "./AccountAdmin.jsx";
import Performance from "./Performance.tsx";
import {useIsMobile} from "../common/hooksv2";
import Setting from "./Setting";

const {Content} = Layout;

function IndexContent({contentType}) {
    const LoginCtr = useContext(LoginCtx);
    const isMobile = useIsMobile();
    if (!LoginCtr.loginInfo.isValid() || !LoginCtr.loginInfo.hasPermission('admin')) {
        contentType = 'needLogin';
    }
    if (contentType === 'needLogin') {
        return <Content
            style={{
                padding: isMobile ? "8px" : "0 48px",
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
            }}
        >
            <Empty

                description={"请先登陆"}
            />
        </Content>;
    }
    let content = null;
    switch (contentType) {
        case 'monitor':
            content = <Monitor/>;
            break;
        case 'log':
            content = <Log/>;
            break;
        case 'db':
            content = <Config/>;
            break;
        case 'account':
            content = <AccountAdmin/>;
            break;
        case 'performance':
            content = <Performance/>;
            break;
        case 'setting':
            content = <Setting/>;
            break;
        default:
            break;
    }
    return <Content
        style={{
            padding: isMobile ? "8px" : "0 48px",

        }}
    >
        {content}
    </Content>;
}

export default IndexContent;
