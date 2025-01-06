import {createContext, useEffect, useRef, useState} from "react";
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

function useAutoCheckLogin(loginCtrRef) {
    useEffect(() => {
        SendCheckLogin((result) => {
            if (result !== null) {
                loginCtrRef.current.onAutoLogin(result);
            } else {
                loginCtrRef.current.onLogout();
            }
        });

        const interval = setInterval(() => {
            // 如果没有登录信息，不检测
            if (loginCtrRef.current.loginInfo.usr === "") {
                return;
            }

            SendCheckLogin((result) => {
                if (result === null || result.User !== loginCtrRef.current.loginInfo.usr) {
                    loginCtrRef.current.onLogout();
                }
            });
            // 一分钟检测一次
        }, 60000);

        return () => clearInterval(interval);
    }, [loginCtrRef]);
}

export const LoginCtx = createContext(LoginCtr);

// LoginProvider 提供全局的用户信息和用户控制，建议放到根组件上，或者将逻辑抽离到别的全局provider中
export function LoginProvider({children}) {
    const [currentUser, setCurrentUser] = useState(new LoginInfo());

    // 根据当前用户信息创建控制器
    const loginCtr = new LoginCtr();
    loginCtr.loginInfo = currentUser;
    loginCtr.onUserChange = (newData) => {
        if (newData !== currentUser) {
            setCurrentUser(newData);
        }
    }

    // 触发一次登录检测并且自动检测。因为内部的逻辑会导致loginctr发生变化，所以这里用ref存一下
    /*
    * 如果传入的是一个对象，且没有effect依赖会导致反复重复触发use，只要use里面触发了一个user更改
    * 如果传入的是一个对象，且有effect依赖会导致外部userinfo发生改变时，use的还是旧的ctr，导致无脑注销
    * 如果loginctr不是对象，是ref，即使provider是.current引用的，因为引用还是同一个引用只是值有变化所以还是没法更新。
    * */
    const loginCtrRef = useRef(loginCtr);
    loginCtrRef.current.loginInfo = currentUser;
    useAutoCheckLogin(loginCtrRef);

    // 将控制器提供给子组件
    return (
        <LoginCtx.Provider value={loginCtr}>
            {children}
        </LoginCtx.Provider>
    );
}