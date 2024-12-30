import {sendGenerateReport, sendGetReportList} from "../common/newSendHttp";
import {useEffect, useState} from "react";
import {Button, Col, Divider, List, Popconfirm, Row} from "antd";
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

    const opre = <Row
        gutter={[16, 16]}
        style={{
            marginBottom: "10px"
        }}
    >
        <Col span={12}>
            <Button style={{width: "100%"}} onClick={() => {
                if (window.confirm("确定要生成新闻汇总吗？")) {
                    onSelect("whole");
                }
            }} danger>{isMobile ? "新闻汇总" : "生成新闻汇总"}</Button>
        </Col>
        <Col span={12}>
            <Popconfirm
                title="确定要生成今日报告吗？"
                onConfirm={() => generateReport()}
                okText="确定"
                cancelText="取消"
            >
                <Button style={{width: "100%"}}>{isMobile ? "今日报告" : "生成今日报告"}</Button>
            </Popconfirm>
        </Col>
        <Col span={12}>
            <Button style={{width: "100%"}} onClick={() => {
                const today = new Date();
                onSelect(`${today.getFullYear()}-${today.getMonth() + 1}-${today.getDate()}`);
            }}>选择今日</Button>
        </Col>
        <Col span={12}>
            <Button style={{width: "100%"}} onClick={handleRefresh}>刷新列表</Button>
        </Col>
    </Row>

    return <div
        style={{
            padding: isMobile ? "0px" : "20px",
        }}
    >
        <Row
            style={{
                // 靠右
                float: "right",
                marginBottom: "10px"
            }}
        >
            <ReportUser/>
        </Row>
        <Divider/>
        {opre}
        <Divider/>
        <Row>
            <List
                style={{
                    width: "100%",
                    height: "calc(100vh - 300px)",
                    overflow: "auto"
                }}
                dataSource={reportList}
                renderItem={(report) => (
                    <List.Item onClick={() => onSelect(report)}>
                        <Button
                            variant="filled"
                            color="primary"
                            style={{width: "100%", height: "100%"}}
                        >{report}</Button>
                    </List.Item>
                )}
            />
        </Row>
    </div>;
}

export default ReportSelector;