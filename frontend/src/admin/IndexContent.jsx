import {Empty, Layout} from "antd";
import {Monitor} from "./Monitor.jsx";
import {Log} from "./Log.jsx";
import {Config} from "./Config.jsx";
import {LoginCtx} from "../common/loginCtx.jsx";
import {useContext} from "react";

const {Content} = Layout;

function IndexContent({contentType}) {
    const LoginCtr = useContext(LoginCtx);
    if (!LoginCtr.loginInfo.isValid() || !LoginCtr.loginInfo.hasPermission('admin')) {
        contentType = 'needLogin';
    }
    if (contentType === 'needLogin') {
        return <Content
            style={{
                padding: "0 48px",
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
        case 'config':
            content = <Config/>;
            break;
        default:
            break;
    }
    return <Content
        style={{
            padding: "0 48px",

        }}
    >
        {content}
    </Content>;
}

export default IndexContent;