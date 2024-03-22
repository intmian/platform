import {createContext, useEffect, useState} from "react";
import {SendCheckLogin} from "./sendhttp.js";

export class LoginInfo {
    usr = "";
    permissions = [];
    lastValid = null;
    init = false;

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

export class LoginCtr {
    loginInfo = new LoginInfo();
    onLogin = () => {
    };
    onLogout = () => {
    };
}

export const LoginCtx = createContext(LoginCtr);

export function LoginProvider({children}) {
    // 每隔一小时检查一次是否过期
    const [currentUser, setCurrentUser] = useState(new LoginInfo());
    let loginCtr = new LoginCtr();
    loginCtr.loginInfo = currentUser;
    loginCtr.onLogin = (newData) => {
        currentUser.usr = newData.usr;
        currentUser.permissions = newData.permissions;
        currentUser.lastValid = newData.lastValid;
        currentUser.init = newData.init;
        setCurrentUser(currentUser)
    };
    loginCtr.onLogout = () => {
        currentUser.usr = null;
        currentUser.permissions = [];
        currentUser.lastValid = null;
        setCurrentUser(currentUser)
    };
    useEffect(() => {
        SendCheckLogin((result) => {
            if (result.User !== '') {
                loginCtr.onLogin(result);
            } else {
                loginCtr.onLogout();
            }
        });
        const interval = setInterval(() => {
            SendCheckLogin((result) => {
                if (result.User !== '') {
                    loginCtr.onLogin(result);
                } else {
                    loginCtr.onLogout();
                }
            });
        }, 3600000);
        return () => clearInterval(interval);
    }, []);
    return (
        <LoginCtx.Provider value={loginCtr}>
            {children}
        </LoginCtx.Provider>
    );
}