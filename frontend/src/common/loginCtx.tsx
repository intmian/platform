import {createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState} from "react";
import {checkLogin, LoginInfoData, logout as apiLogout, onAuthLost, setAuthKnownGood} from "./api";

// 登录状态。外壳（shell/AuthGate）保证应用页面渲染时一定已经登录，
// 所以应用里只需要读用户名、判断权限，不用再管登录框。

export class LoginInfo {
    usr = "";
    permissions: string[] = [];
    lastValid: number | null = null;
    init = false;

    static from(data: LoginInfoData | null): LoginInfo {
        const info = new LoginInfo();
        info.init = true;
        if (data) {
            info.usr = data.User;
            info.permissions = data.Permission ?? [];
            info.lastValid = data.ValidTime;
        }
        return info;
    }

    isValid(): boolean {
        return this.usr !== "" && this.lastValid !== null && this.lastValid > Date.now() / 1000;
    }

    hasPermission(permission: string): boolean {
        return this.isValid() && this.permissions.includes(permission);
    }

    hasAnyPermission(permissions: string[]): boolean {
        return permissions.some((p) => this.hasPermission(p));
    }
}

export interface LoginCtr {
    loginInfo: LoginInfo;
    // 登录过、但会话被后端判定失效（锁屏盖在上面，应用不卸载）
    sessionLost: boolean;
    onLogin: (data: LoginInfoData) => void;
    onLogout: () => Promise<void>;
    recheck: () => Promise<void>;
}

const noop = async () => undefined;
export const LoginCtx = createContext<LoginCtr>({
    loginInfo: new LoginInfo(),
    sessionLost: false,
    onLogin: () => undefined,
    onLogout: noop,
    recheck: noop,
});

export function useAuth(): LoginCtr {
    return useContext(LoginCtx);
}

export function LoginProvider({children}: { children: ReactNode }) {
    const [info, setInfo] = useState<LoginInfo>(() => new LoginInfo());
    const [sessionLost, setSessionLost] = useState(false);

    const infoRef = useRef(info);
    infoRef.current = info;

    const apply = useCallback((data: LoginInfoData | null) => {
        const next = LoginInfo.from(data);
        if (!next.isValid() && infoRef.current.isValid()) {
            // 已登录状态下复查失败：不清空用户，标成会话丢失，让锁屏盖上去，应用里没保存的东西还在
            setSessionLost(true);
            setAuthKnownGood(false);
            return;
        }
        setInfo(next);
        setSessionLost(false);
        setAuthKnownGood(next.isValid());
    }, []);

    const recheck = useCallback(async () => {
        apply(await checkLogin());
    }, [apply]);

    useEffect(() => {
        recheck();
        // 请求层发现掉线
        const off = onAuthLost(() => setSessionLost(true));
        // 回到前台时复查一次（后端会顺便续期）；不再定时轮询
        const onVisible = () => {
            if (document.visibilityState === "visible") recheck();
        };
        document.addEventListener("visibilitychange", onVisible);
        return () => {
            off();
            document.removeEventListener("visibilitychange", onVisible);
        };
    }, [recheck]);

    const ctr = useMemo<LoginCtr>(() => ({
        loginInfo: info,
        sessionLost,
        onLogin: (data) => {
            // 换了账号登录时，旧账号的界面状态不能留着
            if (info.usr && data.User !== info.usr) {
                window.location.reload();
                return;
            }
            setInfo(LoginInfo.from(data));
            setSessionLost(false);
            setAuthKnownGood(true);
        },
        onLogout: async () => {
            await apiLogout();
            setAuthKnownGood(false);
            setSessionLost(false);
            setInfo(LoginInfo.from(null));
        },
        recheck,
    }), [info, sessionLost, recheck]);

    return <LoginCtx.Provider value={ctr}>{children}</LoginCtx.Provider>;
}
