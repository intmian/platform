import {Route, Routes} from "react-router-dom";
import ReportPanel from "./report";

export default function ReportApp() {
    return <Routes>
        <Route index element={<ReportPanel/>}/>
        <Route path=":date" element={<ReportPanel/>}/>
    </Routes>;
}
