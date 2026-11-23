import {useEffect} from "react";
import {useNavigate, useParams} from "react-router-dom";
import {Col, Row} from "antd";
import dayjs from "dayjs";
import ReportSelector from "./reportSelector";
import ReportShow from "./reportShow";
import {useIsMobile} from "../common/breakpoints";
import MobileAdapter from "../common/MobileAdapter";
import {useAppTitle} from "../shell/runtime";

// 合法的地址：单天 2024-01-02、多天 2024-01-02_2024-01-03、新闻汇总 whole
function isValidSelection(date: string | undefined): date is string {
    return !!date && (date === "whole" || /^(\d{4}-\d{2}-\d{2})(_\d{4}-\d{2}-\d{2})*$/.test(date));
}

function titleOf(selected: string) {
    if (selected === "whole") return "新闻汇总";
    return "日报：" + selected.replace(/_/g, " ~ ");
}

function ReportPanel() {
    // 选中的日期就是地址里的 :date；空的、last 或不合法的都换成今天
    const {date} = useParams();
    const navigate = useNavigate();
    const selected = isValidSelection(date) ? date : "";
    const isMobile = useIsMobile();

    useEffect(() => {
        if (!isValidSelection(date)) {
            navigate(`/day-report/${dayjs().format("YYYY-MM-DD")}`, {replace: true});
        }
    }, [date, navigate]);

    useAppTitle(selected ? titleOf(selected) : null);

    const select = (next: string) => {
        if (next && next !== selected) navigate(`/day-report/${next}`, {replace: true});
    };

    return <Row>
        <Col span={4}>
            <MobileAdapter position={"left"} width={"15%"}>
                <ReportSelector onSelect={select}/>
            </MobileAdapter>
        </Col>
        <Col span={isMobile ? 24 : 16}>
            <ReportShow selected={selected}/>
        </Col>
    </Row>;
}

export default ReportPanel;
