import {Route, Routes} from "react-router-dom";
import {Todone} from "./Main";

export default function TodoneApp() {
    return <Routes>
        <Route index element={<Todone/>}/>
        <Route path=":group" element={<Todone/>}/>
    </Routes>;
}
