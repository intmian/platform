import {useEffect, useRef, useState} from "react";
import {useNavigate, useParams} from "react-router-dom";
import ReportSelector from "./reportSelector";
import ReportShow from "./reportShow";
import ReportUser from "./reportUser";


function ReportPanel() {
    // 读取路由
    const {date} = useParams();
    const [selected, setSelected] = useState<string>(date || "");

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

    return <>
        <ReportUser/>
        <ReportSelector onSelect={setSelected}/>
        <ReportShow selected={selected}/>
    </>

}

export default ReportPanel;