import IndexHeader from "./IndexHeader.jsx";
import {Flex, Layout, message, notification, Spin, theme} from "antd";
import IndexSider from "./IndexSider.jsx";
import IndexFooter from "./IndexFooter.jsx";
import IndexContent from "./IndexContent.jsx";
import {useContext, useState} from "react";
import {LoginCtx} from "../common/loginCtx.jsx";


const {Content} = Layout;


function Index() {
    const [api, contextHolder] = notification.useNotification();
    const openNotificationWithIcon = (type, msg, desc) => {
        api[type]({
            message: msg,
            description: desc,
            duration: 3,
        });
    };

    const [contentType, setContentType] = useState('monitor');
    const {
        token: {colorBgContainer, borderRadiusLG},
    } = theme.useToken();

    const loginCtr = useContext(LoginCtx);
    if (!loginCtr.loginInfo.init) {
        // 居中显示，提示正在自动登录
        return <Flex
            style={{
                justifyContent: 'center',
                alignItems: 'center',
                height: '100vh',
            }}
        >
            <Spin size="large" tip={"正在自动登录..."}/>
        </Flex>
    } else {
        openNotificationWithIcon('success', '自动登录', `欢迎回来，${loginCtr.loginInfo.usr}`)
    }

    return <Layout>
        {contextHolder}
        <IndexHeader
            onLogOut={() => {
                loginCtr.onLogout()
                message.success("登出成功");
            }}
            onLoginSuc={(user) => {
                loginCtr.onLogin(user);
                message.success("登陆成功");
            }}
        />
        <Content
            style={{
                padding: '0 48px',
            }}
        >
            <div
                style={
                    {
                        height: '16px',
                    }
                }
            />
            <Layout
                style={{
                    padding: '24px 0',
                    background: colorBgContainer,
                    borderRadius: borderRadiusLG,
                    minHeight: '80vh'
                }}
            >
                <IndexSider
                    disable={!loginCtr.loginInfo.isValid() || !loginCtr.loginInfo.hasPermission('admin')}
                    onChooseMenuItem={(item) => {
                        setContentType(item.key);
                    }}
                />
                {
                    // 未登录时显示登录提示
                    <IndexContent
                        contentType={contentType}
                    />
                }
            </Layout>
        </Content>
        <IndexFooter/>
    </Layout>
}

export default Index;