import Index from "./admin/Index.jsx";
import {createBrowserRouter, RouterProvider} from "react-router-dom";
import {GlobalCtx} from "./common/globalCtx.jsx";
import {Debug} from "./debug/debug.jsx";
import {Cmd} from "./tool/cmd.tsx";
import {ErrorPage} from "./misc/ErrorPage.tsx";
import Anniversary from "./misc/love";
import Memos from "./misc/memso";


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
    }
])

const App = () => {
    return <GlobalCtx>
        <RouterProvider router={router}/>
    </GlobalCtx>;
};
export default App;