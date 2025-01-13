import IndexHeader from "./IndexHeader.jsx";
import {Button, Drawer, Flex, Layout, message, notification, Spin, theme} from "antd";
import IndexSider from "./IndexSider.jsx";
import IndexFooter from "./IndexFooter.jsx";
import IndexContent from "./IndexContent.jsx";
import {useContext, useRef, useState} from "react";
import {LoginCtx} from "../common/loginCtx.jsx";
import {useIsMobile} from "../common/hooksv2";
import {MenuOutlined} from "@ant-design/icons";


const {Content} = Layout;


function Index() {
    const [drawerVisible, setDrawerVisible] = useState(false);
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

    const isMobile = useIsMobile();

    const loginCtr = useContext(LoginCtx);
    const loginShow = useRef(false);
    if (!loginCtr.loginInfo.init) {
        // 居中显示，提示正在自动登录
        return <Flex
            style={{
                justifyContent: 'center',
                alignItems: 'center',
                height: '100vh',
            }}
        >
            <Spin size="large"/>
        </Flex>
    } else {
        if (loginCtr.loginInfo.isValid() && loginCtr.loginInfo.autoLogin && !loginShow.current) {
            openNotificationWithIcon('success', '自动登录', `欢迎回来，${loginCtr.loginInfo.usr}`)
            loginShow.current = true;
        }
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
                padding: isMobile ? '0 8px' : '0 48px',
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

                {!isMobile && (
                    <IndexSider
                        disable={!loginCtr.loginInfo.isValid() || !loginCtr.loginInfo.hasPermission('admin')}
                        onChooseMenuItem={(item) => {
                            setContentType(item.key);
                        }}
                    />
                )}
                {isMobile && (
                    <>
                        <Drawer
                            title="Menu"
                            placement="left"
                            closable={true}
                            onClose={() => setDrawerVisible(false)}
                            open={drawerVisible}
                            width={200}

                        >
                            <IndexSider
                                disable={!loginCtr.loginInfo.isValid() || !loginCtr.loginInfo.hasPermission('admin')}
                                onChooseMenuItem={(item) => {
                                    setContentType(item.key);
                                    setDrawerVisible(false);
                                }}
                            />
                        </Drawer>
                        <Button
                            style={{
                                position: 'fixed',
                                top: 20,
                                left: 10,
                                zIndex: 100,
                            }}
                            icon={<MenuOutlined/>}
                            type="primary"
                            onClick={() => setDrawerVisible(true)}
                        />
                    </>
                )}
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