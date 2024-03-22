import {LoginProvider} from "./loginCtx.jsx";

export function GlobalCtx({children}) {
    return (
        <LoginProvider>
            {children}
        </LoginProvider>
    );
}