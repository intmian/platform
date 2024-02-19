import {Empty, Layout} from "antd";
import Login from "../common/login.jsx";
import {Monitor} from "./Monitor.jsx";
import {Log} from "./Log.jsx";

const {Content} = Layout;

function Debug() {
    return <Login/>;
    return <Content
        style={{
            padding: "0 48px",
        }}
    >
        content
    </Content>;
}

function IndexContent({contentType}) {
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
        case 'debug':
            content = <Debug/>;
            break;
        case 'log':
            content = <Log/>;
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