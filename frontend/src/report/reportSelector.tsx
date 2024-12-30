import {sendGenerateReport, sendGetReportList} from "../common/newSendHttp";
import {useEffect, useState} from "react";
import {Button, Col, List} from "antd";
import ReportUser from "./reportUser";
import {useIsMobile} from "../common/hooksv2";

function ReportSelector({onSelect}: {
    onSelect: (report: string) => void,
}) {
    const [reportList, setReportList] = useState<string[]>([]);
    // 响应式
    const isMobile = useIsMobile();

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

    const generateReport = () => {
        sendGenerateReport({}, (ret) => {
            if (ret.ok) {
                handleRefresh();
            }
        });
    };

    return <div>
        <Col>
            <ReportUser/>
        </Col>
        <Col>
            <Button onClick={() => onSelect("whole")}>生成全量报告</Button>
            <Button onClick={() => generateReport()}>生成今日报告</Button>
        </Col>
        <Col>
            <Button onClick={() => {
                const today = new Date();
                onSelect(`${today.getFullYear()}-${today.getMonth() + 1}-${today.getDate()}`);
            }}>今日</Button>
            <Button onClick={handleRefresh}>刷新</Button>
        </Col>

        <List
            dataSource={reportList}
            renderItem={(report) => (
                <List.Item onClick={() => onSelect(report)}>
                    <Button
                        variant="filled"
                    >{report}</Button>
                </List.Item>
            )}
        />
    </div>
}

export default ReportSelector;