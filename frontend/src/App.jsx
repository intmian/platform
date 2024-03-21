import Index from "./admin/index.jsx";
import {createBrowserRouter, RouterProvider} from "react-router-dom";
import {GlobalCtx} from "./common/globalCtx.jsx";


const router = createBrowserRouter([
    {
        path: '/',
        element: <Index/>,
    },
    {
        path: '/admin',
        element: <Index/>,
    }
])

const App = () => {

    return <GlobalCtx>
        <RouterProvider router={router}/>
    </GlobalCtx>;
};
export default App;