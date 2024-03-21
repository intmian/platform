import {LoginProvider} from "./loginctx.jsx";

export function GlobalCtx(children) {
    return (
        <LoginProvider>
            {children}
        </LoginProvider>
    );
}