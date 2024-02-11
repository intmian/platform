import Index from "./admin/index.jsx";
import {createBrowserRouter, RouterProvider} from "react-router-dom";

const router = createBrowserRouter([
    {
        path: '/',
        element: <Index/>,
    },
])
const App = () => {
    return (
        <RouterProvider router={router}/>
    );
};
export default App;