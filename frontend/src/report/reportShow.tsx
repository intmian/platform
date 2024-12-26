import {DayReport, sendGetReport, sendGetWholeReport, WholeReport} from "../common/newSendHttp";
import {useState} from "react";

function ReportShow({selected}: {
    selected: string,
}) {
    const [data, setData] = useState<DayReport | WholeReport | null>(null);
    if (selected === "whole") {
        sendGetWholeReport({}, (ret) => {
            if (ret.ok) {
                setData(ret.data.Report);
            }
        });
    } else {
        sendGetReport({DayString: selected}, (ret) => {
            if (ret.ok) {
                setData(ret.data.Report);
            }
        })
    }
    return <div>
        {data ? <pre>{JSON.stringify(data, null, 2)}</pre> : "loading..."}
    </div>;
}

export default ReportShow;