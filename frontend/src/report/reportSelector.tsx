import {sendGetReportList} from "../common/newSendHttp";
import {useEffect, useState} from "react";
import {Button} from "antd";

function ReportSelector({onSelect}: {
    onSelect: (report: string) => void,
}) {
    const [reportList, setReportList] = useState<string[]>([]);

    useEffect(() => {
        sendGetReportList({}, (ret) => {
            if (!ret.ok) {
                return;
            }
            setReportList(ret.data.List);
        });
    }, []);

    const handleRefresh = () => {
        sendGetReportList({}, (ret) => {
            if (!ret.ok) {
                return;
            }
            setReportList(ret.data.List);
        });
    };

    return <div>
        <Button onClick={() => onSelect("whole")}>Select Whole</Button>
        <Button onClick={handleRefresh}>Refresh</Button>
        <ul style={{maxHeight: "200px", overflowY: "scroll"}}>
            {reportList.map((report, index) => (
                <li key={index} onClick={() => onSelect(report)}>
                    {report}
                </li>
            ))}
        </ul>
    </div>
}

export default ReportSelector;