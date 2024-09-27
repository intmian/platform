import Index from "./admin/Index.jsx";
import {createBrowserRouter, RouterProvider} from "react-router-dom";
import {GlobalCtx} from "./common/globalCtx.jsx";
import {Debug} from "./debug/debug.jsx";
import {Cmd} from "./tool/Cmd.tsx";
import {ErrorPage} from "./misc/ErrorPage.tsx";


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
        path: '/cmd/:mode/:open',
        element: <Cmd/>,
    },
    {
        path: '/cmd/:mode/:open',
        element: <Cmd/>,
    },
])

const App = () => {
    return <GlobalCtx>
        <RouterProvider router={router}/>
    </GlobalCtx>;
};
export default App;