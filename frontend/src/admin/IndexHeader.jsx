import {Avatar, Button, Image, Layout, Menu, Popconfirm, Space} from "antd";
import {getItem} from "../tool.js";
import LoginPanel from "../common/loginPanel.jsx";
import {useContext, useState} from "react";
import biglogo from "/plat-logo.png";
import {UserOutlined} from "@ant-design/icons";
import {LoginCtx} from "../common/loginCtx.jsx";
import {useIsMobile} from "../common/hooksv2";

const {Header} = Layout;

function UserButton({user, onLogOut}) {
    return <Popconfirm
        title={"确定要登出吗？"}
        okText={"确定"}
        cancelText={"取消"}
        onConfirm={() => {
            fetch('/api/logout', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({}),
            }).then((response) => {
                if (response.ok) {
                    onLogOut();
                }
            })
        }}
    >
        <Button type="primary" danger={true}>
            <Space>
                <Avatar size={22} icon={<UserOutlined/>}/>
                {user}
            </Space>

        </Button>
    </Popconfirm>;
}

function NeedLoginButton({onLoginSuc}) {
    const [isLogin, setIsLogin] = useState(false);

    return (
        <>
            {isLogin ? (
                <LoginPanel
                    onLoginSuc={(user) => {
                        onLoginSuc(user);
                    }}
                    onCancel={() => {
                        setIsLogin(false);
                    }}
                />
            ) : (
                <Button type="primary" danger={true} onClick={() => {
                    setIsLogin(true);
                }}>登陆</Button>
            )}
        </>
    );
}


function UsrArea({user, onLoginSuc, onLogOut}) {
    if (user !== null && user !== "") {
        return <UserButton user={user} onLogOut={onLogOut}/>;
    }
    return <NeedLoginButton onLoginSuc={onLoginSuc}/>;
}

function IndexHeader({onLoginSuc, onLogOut}) {
    const loginCtr = useContext(LoginCtx);
    const isMobile = useIsMobile();
    return <Header
        style={{
            display: 'flex',
            alignItems: 'center',
            background: '#ede8e4',
        }}
    >
        <Space size="0"
               style={{
                   margin: isMobile ? "0" : "10px",
                   height: "100%",
                   // 白色背景
               }}
        >
            <Image
                width={50}
                preview={false}
                src={biglogo}
            />
            <h1
                style={{
                    fontSize: "20px",
                    // fontWeight: 500,
                    minWidth: 0,
                }}
            >
                {isMobile ? "管理后台" : "platform管理后台"}

            </h1>
        </Space>
        {
            isMobile ?
                <div style={{
                    marginLeft: 'auto',
                }}>
                    <UsrArea
                        user={loginCtr.loginInfo.usr}
                        onLoginSuc={onLoginSuc}
                        onLogOut={onLogOut}
                    />
                </div>
                : <Space style={{marginLeft: 'auto'}}>
                    <Menu
                        mode="horizontal"
                        theme={'white'}
                        defaultSelectedKeys={['home']}
                        items={[
                            getItem('管理', 'home'),
                            getItem('笔记', 'note'),
                            getItem('工具', 'tool'),
                        ]
                        }
                        style={{
                            flex: 1,
                            minWidth: 0,
                        }}
                    />
                    <Button type="link" href="https://www.intmian.com">我的博客</Button>
                    <UsrArea
                        user={loginCtr.loginInfo.usr}
                        onLoginSuc={onLoginSuc}
                        onLogOut={onLogOut}
                    />
                </Space>
        }

    </Header>
}

export default IndexHeader;