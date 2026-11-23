import {Route, Routes} from "react-router-dom";
import {Cmd} from "./cmd";

export default function CmdApp() {
    return <Routes>
        <Route index element={<Cmd/>}/>
        <Route path=":mode" element={<Cmd/>}/>
        <Route path=":mode/:id" element={<Cmd/>}/>
    </Routes>;
}
