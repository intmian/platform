import {Button, Image, Layout, Menu, Popconfirm, Space} from "antd";
import {getItem} from "../tool.js";
import Login from "../common/login.jsx";
import {useState} from "react";
import biglogo from "../assets/biglogo.png";
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
        <Button type="primary">{user}</Button>;
    </Popconfirm>;
}

function NeedLoginButton({onLoginSuc}) {
    const [isLogin, setIsLogin] = useState(false);

    return (
        <>
            {isLogin ? (
                <Login
                    onLoginSuc={(user) => {
                        onLoginSuc(user);
                    }}
                    onCancel={() => {
                        setIsLogin(false);
                    }}
                />
            ) : (
                <Button type="primary" onClick={() => {
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

function IndexHeader({user, onLoginSuc, onLogOut}) {
    return <Header
        style={{
            display: 'flex',
            alignItems: 'center',
            // background: '#fff',
        }}
    >
        <Space size="0"
               style={{
                   margin: 10,
                   height: "100%",
                   // 白色背景
                   background: 'rgba(0, 0, 0, 0.2)',
               }}
        >
            <Image
                width={100}
                preview={false}
                src={biglogo}
            />
            <h1
                style={{
                    color: 'white',
                    fontSize: 20,
                    // fontWeight: 500,
                    minWidth: 0,
                }}
            >
                管理员界面
            </h1>
        </Space>
        <Menu
            mode="horizontal"
            theme={'dark'}
            defaultSelectedKeys={['home']}
            items={[
                getItem('主页', 'home'),
                getItem('笔记', 'note'),
                getItem('工具', 'tool'),
            ]
            }
            style={{
                flex: 1,
                minWidth: 0,
            }}
        />
        <Space>
            <Button type="link" href="https://www.intmian.com">博客</Button>
            <UsrArea
                user={user}
                onLoginSuc={onLoginSuc}
                onLogOut={onLogOut}
            />
        </Space>
    </Header>;
}

export default IndexHeader;