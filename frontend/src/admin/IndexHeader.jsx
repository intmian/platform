import {Button, Layout, Menu, Popconfirm} from "antd";
import {getItem} from "../tool.js";
import Login from "../common/login.jsx";
import {useState} from "react";

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
                <Login onLoginSuc={(user) => {
                    onLoginSuc(user);
                }}/>
            ) : (
                <Button type="primary" onClick={() => {
                    setIsLogin(true);
                }}>登陆</Button>
            )}
        </>
    );
}


function LoginButton({user, onLoginSuc, onLogOut}) {
    if (user !== null && user !== "") {
        return <UserButton user={user} onLogOut={onLogOut}/>;
    }
    return <NeedLoginButton onLoginSuc={onLoginSuc}/>;
}

function IndexHeader({user, onLoginSuc, onLogOut}) {
    console.log("user:", user);
    return <Header
        style={{
            display: 'flex',
            alignItems: 'center',
            // background: '#fff',
        }}
        theme={'dark'}
    >
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
        <LoginButton
            user={user}
            onLoginSuc={onLoginSuc}
            onLogOut={onLogOut}
        />
        <Button type="link" href="https://www.intmian.com">博客</Button>
    </Header>;
}

export default IndexHeader;