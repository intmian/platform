import {Avatar, Button, Popconfirm, Space, Spin} from "antd";
import {UserOutlined} from "@ant-design/icons";
import {useContext, useState} from "react";
import LoginPanel from "../common/loginPanel";
import {LoginCtx} from "../common/loginCtx";


function UserButton({user, onLogOut}: {
    user: string,
    onLogOut: () => void
}) {
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

function NeedLoginButton({onLoginSuc}: {
    onLoginSuc: (user: string) => void
}) {

    // 为了避免一些状态同步的问题，这里做一些简化处理，必须登录，因为不登录也用不了，登录后刷新，不进行动态处理了。
    const [inLogin, setInLogin] = useState(true);

    return (
        <>
            {inLogin ? (
                <LoginPanel
                    onLoginSuc={(user: string) => {
                        onLoginSuc(user);
                    }}
                    onCancel={() => {
                        setInLogin(false);
                    }}
                />
            ) : (
                <Button type="primary" danger={true} onClick={() => {
                    setInLogin(true);
                }}>登陆</Button>
            )}
        </>
    );
}


function UsrArea({user, onLoginSuc, onLogOut}: {
    user: string | null,
    onLoginSuc: (user: string) => void,
    onLogOut: () => void
}) {
    if (user !== null && user !== "") {
        return <UserButton user={user} onLogOut={onLogOut}/>;
    }
    return <NeedLoginButton onLoginSuc={onLoginSuc}/>;
}

function ReportUser() {
    const loginCtr = useContext(LoginCtx);
    // 增加自动登录和登入登出的显示
    console.log(loginCtr.loginInfo);
    if (!loginCtr.loginInfo.init) {
        // 返回一个全屏的正在加载中
        return <div
            style={{
                position: 'fixed',
                zIndex: 1000,
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
            }}
        >
            <Spin size="large"/>
        </div>
    }

    return <UsrArea
        user={loginCtr.loginInfo.usr}
        onLoginSuc={(user) => {
            loginCtr.onLogin(user);
            // 刷新页面
            window.location.reload();
        }}
        onLogOut={loginCtr.onLogout}
    />
}

export default ReportUser;