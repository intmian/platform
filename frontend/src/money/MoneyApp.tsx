import {Route, Routes} from "react-router-dom";
import {MoneyBookList} from "./BookListPage";
import {MoneyConfigPage} from "./ConfigPage";
import {MoneyReconcilePage} from "./ReconcilePage";
import {MoneyHistoryPage} from "./HistoryPage";
import {MoneyDashboardPage} from "./DashboardPage";
import {MoneyImportPage} from "./ImportPage";

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
