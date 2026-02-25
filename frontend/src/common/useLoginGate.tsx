import {useContext, useEffect, useMemo, useRef, useState} from "react";
import LoginPanel from "./loginPanel";
import {LoginCtr, LoginCtx} from "./loginCtx";

type UseLoginGateOptions = {
    enabled?: boolean;
    autoPrompt?: boolean;
    repromptOnCancel?: boolean;
    onLogin?: (user: any) => void;
    onCancel?: () => void;
};

export function useLoginGate({
    enabled = true,
    autoPrompt = true,
    repromptOnCancel = false,
    onLogin,
    onCancel,
}: UseLoginGateOptions = {}) {
    const loginCtr: LoginCtr = useContext<LoginCtr>(LoginCtx);
    const [visible, setVisible] = useState(false);
    const promptedRef = useRef(false);

    const loginReady = loginCtr.loginInfo.init;
    const isLoggedIn = loginCtr.loginInfo.isValid();

    useEffect(() => {
        if (!enabled) {
            setVisible(false);
            promptedRef.current = false;
            return;
        }
        if (!autoPrompt || !loginReady) {
            return;
        }
        if (!isLoggedIn && !promptedRef.current) {
            promptedRef.current = true;
            setVisible(true);
            return;
        }
        if (isLoggedIn) {
            promptedRef.current = false;
            setVisible(false);
        }
    }, [enabled, autoPrompt, loginReady, isLoggedIn]);

    const panel = useMemo(() => {
        if (!visible) {
            return null;
        }
        return (
            <LoginPanel
                onLoginSuc={(user) => {
                    loginCtr.onLogin(user);
                    setVisible(false);
                    onLogin?.(user);
                }}
                onCancel={() => {
                    setVisible(false);
                    if (repromptOnCancel) {
                        promptedRef.current = false;
                    }
                    onCancel?.();
                }}
            />
        );
    }, [visible, loginCtr, onLogin, onCancel, repromptOnCancel]);

    return {
        loginReady,
        isLoggedIn,
        openLogin: () => {
            promptedRef.current = true;
            setVisible(true);
        },
        closeLogin: () => setVisible(false),
        loginPanel: panel,
    };
}
