import {DayReport, sendGetReport, sendGetWholeReport, WholeReport} from "../common/newSendHttp";
import {useEffect, useState} from "react";

function ReportShow({selected}: {
    selected: string,
}) {
    const [data, setData] = useState<DayReport | WholeReport | null>(null);

    // 发送请求
    useEffect(() => {
        if (selected === "") {
            return;
        }
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
    }, [selected]);

    return <div>
        {data ? <pre>{JSON.stringify(data, null, 2)}</pre> : "loading..."}
    </div>;
}

export default ReportShow;