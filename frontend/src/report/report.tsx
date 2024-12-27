import {useEffect, useRef, useState} from "react";
import {useNavigate, useParams} from "react-router-dom";
import ReportSelector from "./reportSelector";
import ReportShow from "./reportShow";
import {Col, Row} from "antd";

function ReportPanel() {
    // 读取路由
    const {date} = useParams();
    const [selected, setSelected] = useState<string>(date || "");
    useEffect(() => {
        document.title = "日报：" + selected;
    }, [selected]);

    // 不合法的日期，自动导入今日日期
    if (date && date !== "" && date !== "whole" && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        // 获取今日日期
        const today = new Date();
        setSelected(`${today.getFullYear()}-${today.getMonth() + 1}-${today.getDate()}`);
    }
    //同步路由
    const navigate = useRef(useNavigate());
    useEffect(() => {
        if (selected) {
            navigate.current(`/day-report/${selected}`, {replace: true});
        }
    }, [selected]);

    return <Row>
        <Col>
            <ReportSelector onSelect={setSelected}/>
        </Col>
        <Col>
            <ReportShow selected={selected}/>
        </Col>
    </Row>

}

export default ReportPanel;