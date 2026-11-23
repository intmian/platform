import {FormEvent, useEffect, useRef, useState} from "react";
import {Button, Input, InputRef} from "antd";
import {LockOutlined, UserOutlined} from "@ant-design/icons";
import {login} from "../common/api";
import {useAuth} from "../common/loginCtx";

// 全屏登录。没登录时整页就是它；登录中途掉线时作为遮罩盖在应用上面，应用不卸载，没保存的内容还在。
export function LockScreen({overlay = false}: { overlay?: boolean }) {
    const auth = useAuth();
    const [username, setUsername] = useState(auth.loginInfo.usr || "");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);
    const pwdRef = useRef<InputRef>(null);
    const userRef = useRef<InputRef>(null);

    useEffect(() => {
        (username ? pwdRef : userRef).current?.focus();
        // 只在出现时聚焦一次
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const submit = async (e: FormEvent) => {
        e.preventDefault();
        if (!username.trim() || !password) {
            setError("用户名和密码都要填");
            return;
        }
        setLoading(true);
        setError("");
        const ret = await login(username.trim(), password);
        setLoading(false);
        if (!ret) {
            setError("用户名或密码不对");
            setPassword("");
            pwdRef.current?.focus();
            return;
        }
        auth.onLogin(ret);
    };

    return <div className={overlay ? "pf-lock pf-lock-overlay" : "pf-lock"}>
        <form className="pf-lock-card" onSubmit={submit}>
            <img className="pf-lock-logo" src="/icons/plat-192.png" alt=""/>
            <div className="pf-lock-title">{overlay ? "登录已过期" : "Platform"}</div>
            {overlay && <div className="pf-lock-sub">重新登录后会回到刚才的页面</div>}
            <Input ref={userRef} size="large" prefix={<UserOutlined/>} placeholder="用户名" autoComplete="username"
                   value={username} onChange={(e) => setUsername(e.target.value)}/>
            <Input.Password ref={pwdRef} size="large" prefix={<LockOutlined/>} placeholder="密码" autoComplete="current-password"
                            value={password} onChange={(e) => setPassword(e.target.value)}/>
            <div className="pf-lock-error">{error}</div>
            <Button type="primary" size="large" htmlType="submit" loading={loading} block>登录</Button>
        </form>
    </div>;
}
