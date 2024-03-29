import Index from "./admin/index.jsx";
import {createBrowserRouter, RouterProvider} from "react-router-dom";
import {GlobalCtx} from "./common/globalCtx.jsx";
import {Debug} from "./debug/debug.jsx";


const router = createBrowserRouter([
    {
        path: '/',
        element: <Index/>,
    },
    {
        path: '/admin',
        element: <Index/>,
    },
    {
        path: '/debug',
        element: <Debug/>,
    }
])

const App = () => {
    return <GlobalCtx>
        <RouterProvider router={router}/>
    </GlobalCtx>;
};
export default App;