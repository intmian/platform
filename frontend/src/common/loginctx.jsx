import {createContext, useEffect, useState} from "react";
import {SendCheckLogin} from "./sendhttp.js";

export class LoginInfo {
    constructor() {
        this.usr = null;
        this.permissions = [];
        this.lastValid = null;
        this.init = false;
    }

    hasPermission(permission) {
        if (!this.isValid()) {
            return false;
        }
        return this.permissions.includes(permission);
    }

    isValid() {
        return this.usr !== null && this.lastValid !== null && this.lastValid > new Date().getTime();
    }
}

export const Loginctx = createContext({
    loginInfo: new LoginInfo(),
    onLogin: () => {
    },
    onLogout: () => {
    },
});

export function LoginProvider({children}) {
    // 每隔一小时检查一次是否过期
    const loginCtr = UseLogin();
    useEffect(() => {
        const interval = setInterval(() => {
            SendCheckLogin((data) => {
                if (data === null) {
                    return;
                }
                let newDate = new LoginInfo();
                newDate.usr = data.User;
                newDate.permissions = data.PermissionMap;
                newDate.lastValid = data.ValidTime;
                newDate.init = true;
                loginCtr.onLogin(newDate);
            })
        }, 1000);
        return () => clearInterval(interval);
    }, []);
    return (
        <Loginctx.Provider value={loginCtr}>
            {children}
        </Loginctx.Provider>
    );
}

// 用来触发账号变更，不直接使用这个，因为这个会导致所有使用这个的组件都刷新
export function UseLogin() {
    const [currentUser, setCurrentUser] = useState(new LoginInfo());
    return {
        loginInfo: currentUser,
        onLogin: (newData) => {
            currentUser.usr = newData.User;
            currentUser.permissions = newData.PermissionMap;
            currentUser.lastValid = newData.ValidTime;
            setCurrentUser(currentUser)
        },
        onLogout: () => {
            currentUser.usr = null;
            currentUser.permissions = [];
            currentUser.lastValid = null;
            setCurrentUser(currentUser)
        }
    }
}