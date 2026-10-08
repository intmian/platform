import {Empty, Layout, theme} from "antd";
import {Monitor} from "./Monitor.jsx";
import {Log} from "./Log.jsx";
import {Config} from "./Config.jsx";
import {LoginCtx} from "../common/loginCtx.jsx";
import {useContext} from "react";
import {AccountAdmin} from "./AccountAdmin.jsx";
import Performance from "./Performance.tsx";
import {useIsMobile} from "../common/hooksv2";
import Setting from "./Setting";
import BiLog from "./BiLog.tsx";

const {Content} = Layout;

function IndexContent({contentType}) {
    const LoginCtr = useContext(LoginCtx);
    const isMobile = useIsMobile();
    const {
        token: {colorBgContainer, borderRadiusLG},
    } = theme.useToken();
    // 表格类页面本身没有容器，需要放在白色面板里；其余页面自带卡片，直接放在灰底上
    const panelStyle = {
        background: colorBgContainer,
        borderRadius: borderRadiusLG,
        padding: isMobile ? 12 : 24,
    };
    if (!LoginCtr.loginInfo.isValid() || !LoginCtr.loginInfo.hasPermission('admin')) {
        contentType = 'needLogin';
    }
    if (contentType === 'needLogin') {
        return <Content
            style={{
                ...panelStyle,
                minHeight: '60vh',
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
    let needPanel = false;
    switch (contentType) {
        case 'monitor':
            content = <Monitor/>;
            break;
        case 'log':
            content = <Log/>;
            needPanel = true;
            break;
        case 'db':
            content = <Config/>;
            needPanel = true;
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
        case 'bi':
            content = <BiLog/>
            break;
        default:
            break;
    }
    return <Content
        style={{
            minWidth: 0,
            width: '100%',
            ...(needPanel ? panelStyle : {}),
        }}
    >
        {content}
    </Content>;
}

export default IndexContent;
