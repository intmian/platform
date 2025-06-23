import {sendGenerateReport, sendGetReportList} from "../common/newSendHttp";
import {useEffect, useState} from "react";
import {Button, Col, DatePicker, Divider, message, Popconfirm, Row} from "antd";
import {ScreenType, useScreenType} from "../common/hooksv2";
import User from "../common/User";
import dayjs, {Dayjs} from "dayjs";

const {RangePicker} = DatePicker;

function ReportSelector({onSelect}: {
    onSelect: (report: string) => void,
}) {
    const [reportList, setReportList] = useState<string[]>([]);
    // 响应式
    const screenType = useScreenType();

    useEffect(() => {
        sendGetReportList({}, (ret) => {
            if (!ret.ok) {
                message.error("获取日报列表失败");
                return;
            }
            setReportList(ret.data.List.reverse());
        });
    }, []);

    const handleRefresh = () => {
        sendGetReportList({}, (ret) => {
            if (!ret.ok) {
                return;
            }
            setReportList(ret.data.List.reverse());
        });
    };

    const generateReport = () => {
        sendGenerateReport({}, (ret) => {
            if (ret.ok) {
                handleRefresh();
            }
        });
    };

    // 只允许选择有日报的日期
    const disabledDate = (current: Dayjs) => {
        const dateStr = current.format("YYYY-MM-DD");
        return !reportList.includes(dateStr);
    };

    // 选择单天或区间
    const onCalendarChange = (dates: any, dateStrings: string[] | string) => {
        if (!dates || (Array.isArray(dates) && dates.length === 0)) return;
        if (Array.isArray(dates)) {
            // 区间
            if (dates[0] && dates[1]) {
                // 只聚合有日报的日期
                const start = dates[0].startOf('day');
                const end = dates[1].endOf('day');
                const selectedDays = reportList.filter(d => {
                    const djs = dayjs(d);
                    return (djs.isSame(start) || djs.isAfter(start)) && (djs.isSame(end) || djs.isBefore(end));
                });
                if (selectedDays.length > 0) {
                    // 倒序
                    selectedDays.sort((a, b) => dayjs(a).diff(dayjs(b)));
                    onSelect(selectedDays.join("_"));
                } else {
                    message.warning("所选区间无日报");
                }
            }
        } else {
            // 单天
            if (dates) {
                onSelect(dateStrings as string);
            }
        }
    };

    const opre = <Row
        gutter={[16, 16]}
        style={{
            marginBottom: "10px"
        }}
    >
        <Col span={24}>
            <DatePicker
                style={{width: "100%"}}
                placeholder={screenType == ScreenType.SmallDesktop ? "" : "选择日期"}
                disabledDate={disabledDate}
                // dateRender={dateCellRender}
                onChange={(date, dateStr) => {
                    if (dateStr) onSelect(typeof dateStr === "string" ? dateStr : "");
                }}
                allowClear={false}
            />
        </Col>
        <Col span={24}>
            <RangePicker
                style={{width: "100%"}}
                placeholder={screenType == ScreenType.SmallDesktop ? ["", ""] : ["开始日期", "结束日期"]}
                disabledDate={disabledDate}
                // dateRender={dateCellRender}
                onChange={onCalendarChange}
                allowClear={false}
            />
        </Col>
        <Col span={screenType == ScreenType.SmallDesktop ? 24 : 12}>
            <Button style={{width: "100%"}} onClick={() => {
                if (window.confirm("确定要生成新闻汇总吗？")) {
                    onSelect("whole");
                }
            }} danger>{screenType != ScreenType.Desktop ? "新闻汇总" : "生成新闻汇总"}</Button>
        </Col>
        <Col span={screenType == ScreenType.SmallDesktop ? 24 : 12}>
            <Popconfirm
                title="确定要生成今日报告吗？"
                onConfirm={() => generateReport()}
                okText="确定"
                cancelText="取消"
            >
                <Button
                    style={{width: "100%"}}>{screenType != ScreenType.Desktop ? "今日报告" : "生成今日报告"}</Button>
            </Popconfirm>
        </Col>
        <Col span={screenType == ScreenType.SmallDesktop ? 24 : 12}>
            <Button style={{width: "100%"}} onClick={() => {
                const today = dayjs();
                onSelect(today.format("YYYY-MM-DD"));
            }}>选择今日</Button>
        </Col>
        <Col span={screenType == ScreenType.SmallDesktop ? 24 : 12}>
            <Button style={{width: "100%"}} onClick={handleRefresh}>刷新列表</Button>
        </Col>
    </Row>

    return <div
        style={{
            padding: screenType == ScreenType.Mobile ? "0px" : "20px",
        }}
    >
        <Row
            style={{
                // 靠右
                float: "right",
                marginBottom: "10px"
            }}
        >
            <User/>
        </Row>
        <Divider/>
        {opre}
    </div>;
}

export default ReportSelector;