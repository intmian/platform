import {useEffect, useRef, useState} from "react";
import {useNavigate, useParams} from "react-router-dom";
import ReportSelector from "./reportSelector";
import ReportShow from "./reportShow";
import {Col, Row} from "antd";
import {useIsMobile} from "../common/hooksv2";

function ReportPanel() {
    // 更换Favicon为/newslogo.webp
    useEffect(() => {
        const link = document.createElement('link');
        link.type = 'image/x-icon';
        link.rel = 'shortcut icon';
        link.href = '/newslogo.webp';
        document.getElementsByTagName('head')[0].appendChild(link);
    }, []);

    // 读取路由
    const {date} = useParams();
    const [selected, setSelected] = useState<string>(date || "");
    const isMobile = useIsMobile();
    useEffect(() => {
        if (selected === "whole") {
            document.title = "新闻汇总";
            return;
        }
        document.title = "日报：" + selected;
    }, [selected]);

    // 不合法的日期，自动导入今日日期
    if (date && date !== "" && date !== "whole" && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        // 获取今日日期
        const today = new Date();
        setSelected(`${today.getFullYear()}-${today.getMonth() + 1}-${today.getDate()}`);
    }
    // 如果是空的，也自动导入今天的日期
    if (selected === "") {
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
        <Col
            span={isMobile ? 0 : 4}
        >
            <ReportSelector onSelect={setSelected}/>
        </Col>
        <Col
            span={isMobile ? 24 : 16}
        >
            <div>
                <ReportShow selected={selected}/>
            </div>
        </Col>
    </Row>

}

export default ReportPanel;