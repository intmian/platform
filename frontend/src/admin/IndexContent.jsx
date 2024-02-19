import {Empty, Layout} from "antd";
import Login from "../common/login.jsx";
import {Monitor} from "./Monitor.jsx";

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
    return <Content
        style={{
            padding: "0 48px",

        }}
    >
        {contentType === 'monitor' ? Monitor() : null}
        {contentType === 'debug' ? Debug() : null}
        {contentType === 'needLogin' ? <Empty
            description={"请先登陆"}
        /> : null}
    </Content>;
}

export default IndexContent;