import {createContext, useEffect, useState} from "react";
import {SendCheckLogin} from "./sendhttp.js";

export class LoginInfo {
    usr = "";
    permissions = [];
    lastValid = null;
    init = false;
    autoLogin = false;

    hasPermission(permission) {
        if (!this.isValid()) {
            return false;
        }
        return this.permissions.includes(permission);
    }

    isValid() {
        return this.usr !== null && this.lastValid !== null && this.lastValid > new Date().getTime() / 1000;
    }
}

export class LoginCtr {
    loginInfo = new LoginInfo();
    onLogin = () => {
    };
    onAutoLogin = () => {
    }
    onLogout = () => {
    };
}

export const LoginCtx = createContext(LoginCtr);

export function LoginProvider({children}) {
    const [currentUser, setCurrentUser] = useState(new LoginInfo());
    let loginCtr = new LoginCtr();

    loginCtr.loginInfo = currentUser;

    loginCtr.onLogin = (newData) => {
        let newUser = new LoginInfo();
        newUser.usr = newData.User;
        newUser.permissions = newData.Permission;
        newUser.lastValid = newData.ValidTime;
        newUser.init = true;
        setCurrentUser(newUser);
    };

    loginCtr.onAutoLogin = (newData) => {
        let newUser = new LoginInfo();
        newUser.usr = newData.User;
        newUser.permissions = newData.Permission;
        newUser.lastValid = newData.ValidTime;
        newUser.init = true;
        newUser.autoLogin = true;
        setCurrentUser(newUser);
    }

    loginCtr.onLogout = () => {
        let newUser = new LoginInfo();
        newUser.init = true;
        setCurrentUser(newUser); // 或创建等于初始状态的新对象
    };

    useEffect(() => {
        SendCheckLogin((result) => {
            if (result !== null) {
                loginCtr.onAutoLogin(result);
            } else {
                loginCtr.onLogout();
            }
        });

        const interval = setInterval(() => {
            SendCheckLogin((result) => {
                if (result === null || result.usr !== loginCtr.loginInfo.usr) {
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