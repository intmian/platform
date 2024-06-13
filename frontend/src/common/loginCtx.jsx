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
        if (this.permissions === null) {
            return false;
        }
        return this.permissions.includes(permission);
    }

    isValid() {
        return this.usr !== null && this.lastValid !== null && this.lastValid > new Date().getTime() / 1000;
    }
}

// LoginCtr 提供目前的用户信息，并且在发生变更时调用回调，建议使用含set函数的callback
// 可以复合到provider中，提供全局的用户信息和用户控制（例如子组件触发注销逻辑）
export class LoginCtr {
    loginInfo = new LoginInfo();
    onUserChange = () => {
        console.log("UserChangeCallBack not set");
    }

    onLogin(newData) {
        let newUser = new LoginInfo();
        newUser.usr = newData.User;
        newUser.permissions = newData.Permission;
        newUser.lastValid = newData.ValidTime;
        newUser.init = true;
        // 不用刷新loginInfo，因为回调的上层会刷新，仅做类型转换，newData是golang返回的json对象
        this.onUserChange(newUser);
    }

    onAutoLogin(newData) {
        let newUser = new LoginInfo();
        newUser.usr = newData.User;
        newUser.permissions = newData.Permission;
        newUser.lastValid = newData.ValidTime;
        newUser.init = true;
        newUser.autoLogin = true;
        this.onUserChange(newUser);
    }

    onLogout() {
        let newUser = new LoginInfo();
        newUser.init = true;
        this.onUserChange(newUser);
    }
}

export const LoginCtx = createContext(LoginCtr);

function useAutoCheckLogin(loginCtr) {
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
}

// LoginProvider 提供全局的用户信息和用户控制，建议放到根组件上，或者将逻辑抽离到别的全局provider中
export function LoginProvider({children}) {
    const [currentUser, setCurrentUser] = useState(new LoginInfo());

    let loginCtr = new LoginCtr();
    loginCtr.loginInfo = currentUser;
    loginCtr.onUserChange = (newData) => {
        setCurrentUser(newData);
    }

    useAutoCheckLogin(loginCtr);

    return (
        <LoginCtx.Provider value={loginCtr}>
            {children}
        </LoginCtx.Provider>
    );
}