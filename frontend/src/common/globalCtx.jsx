import {LoginProvider} from "./loginCtx.jsx";
import 'moment/dist/locale/zh-cn';
import zhCN from 'antd/lib/locale/zh_CN';
import {ConfigProvider} from "antd";

export function GlobalCtx({children}) {
    return (
        <ConfigProvider locale={zhCN}>
            <LoginProvider>
                {children}
            </LoginProvider>
        </ConfigProvider>
    );
}