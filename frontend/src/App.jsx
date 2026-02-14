import Index from "./admin/Index.jsx";
import {createBrowserRouter, RouterProvider} from "react-router-dom";
import {GlobalCtx} from "./common/globalCtx.jsx";
import {Debug} from "./debug/debug.jsx";
import {Cmd} from "./tool/cmd.tsx";
import {ErrorPage} from "./misc/ErrorPage.tsx";
import Anniversary from "./misc/love";

import {lazy} from 'react';
import ReportPanel from "./report/report";
import {Todone} from "./todone/Main";
import NutritionCalculator from "./misc/NutritionCalculator";
import KanaPractice from "./misc/KanaPractice";
import dayjs from 'dayjs';
import 'dayjs/locale/zh-cn';
import {JianXing} from "./library/JianXingTemp.tsx";

const Memos = lazy(() => import('./misc/memos'));

const router = createBrowserRouter([
    {
        path: '/',
        element: <Index/>,
        errorElement: <ErrorPage/>,
    },
    {
        path: '/admin',
        element: <Index/>,
    },
    {
        path: '/debug',
        element: <Debug/>,
    },
    {
        path: '/debug/:mode',
        element: <Debug/>,
    },
    {
        path: '/cmd/',
        element: <Cmd/>,
    },
    {
        path: '/cmd/:mode',
        element: <Cmd/>,
    },
    {
        path: '/cmd/:mode/:id',
        element: <Cmd/>,
    },
    {
        path: '/404',
        element: <ErrorPage/>,
    },
    {
        path: '/love47',
        element: <Anniversary/>,
    },
    {
        path: '/note_mini',
        element: <Memos/>,
    },
    {
        path: '/day-report',
        element: <ReportPanel/>,
    },
    {
        path: '/day-report/:date',
        element: <ReportPanel/>,
    },
    {
        path: '/todone/:group',
        element: <Todone/>,
    },
    {
        path: '/todone',
        element: <Todone/>,
    },
    {
        path: '/loss-fat',
        element: <NutritionCalculator/>,
    },
    {
        path: '/kana',
        element: <KanaPractice/>
    },
    {
        path: '/rate/jianxing',
        element: <JianXing/>
    }
])

const App = () => {
    dayjs.locale('zh-cn');
    return <GlobalCtx>
        <RouterProvider router={router}/>
    </GlobalCtx>;
};
export default App;