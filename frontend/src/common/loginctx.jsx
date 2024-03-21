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

export function LoginProvider(children) {
    // 每隔一小时检查一次是否过期
    const [loginInfo, setLoginInfo] = UseLogin();
    return (
        <Loginctx.Provider value={{loginInfo, setLoginInfo}}>
            {children}
        </Loginctx.Provider>
    );
}

export function UseLogin() {
    const [currentUser, setCurrentUser] = useState(new LoginInfo());
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
                setCurrentUser(newDate);
            })
        }, 1000);
        return () => clearInterval(interval);
    }, []);
    return {
        loginInfo: currentUser,
        setLoginInfo: (newData) => setCurrentUser(newData),
        logout: () => {
            currentUser.usr = null;
            currentUser.permissions = [];
            currentUser.lastValid = null;
            setCurrentUser(currentUser)
        }
    }
}