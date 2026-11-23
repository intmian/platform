import {createBrowserRouter, RouterProvider} from "react-router-dom";
import {ConfigProvider} from "antd";
import zhCN from "antd/locale/zh_CN";
import dayjs from "dayjs";
import "dayjs/locale/zh-cn";
import {LoginProvider} from "./common/loginCtx";
import {Shell} from "./shell/Shell";
import {appTheme, ThemeVars} from "./shell/theme";
import {ErrorPage} from "./misc/ErrorPage";
import "./shell/shell.css";

dayjs.locale("zh-cn");

// 所有路径都交给外壳：外壳按应用清单决定挂哪个应用，见 shell/apps.tsx
const router = createBrowserRouter([
    {path: "*", element: <Shell/>, errorElement: <ErrorPage/>},
]);

export default function App() {
    return <ConfigProvider locale={zhCN} theme={appTheme}>
        <ThemeVars/>
        <LoginProvider>
            <RouterProvider router={router}/>
        </LoginProvider>
    </ConfigProvider>;
}
