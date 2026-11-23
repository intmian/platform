import {Route, Routes} from "react-router-dom";
import {
    MoneyBookList,
    MoneyConfigPage,
    MoneyDashboardPage,
    MoneyHistoryPage,
    MoneyImportPage,
    MoneyReconcilePage,
} from "./MoneyPages";

export default function MoneyApp() {
    return <Routes>
        <Route index element={<MoneyBookList/>}/>
        <Route path=":bookId/config" element={<MoneyConfigPage/>}/>
        <Route path=":bookId/reconcile/:recordId" element={<MoneyReconcilePage/>}/>
        <Route path=":bookId/history" element={<MoneyHistoryPage/>}/>
        <Route path=":bookId/dashboard" element={<MoneyDashboardPage/>}/>
        <Route path=":bookId/import" element={<MoneyImportPage/>}/>
    </Routes>;
}
