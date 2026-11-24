import {useEffect, useMemo, useState} from "react";
import {useNavigate, useParams, useSearchParams} from "react-router-dom";
import {Button, DatePicker, Dropdown, Empty, message, Modal, Skeleton} from "antd";
import {DownOutlined, EllipsisOutlined, LeftOutlined, RightOutlined} from "@ant-design/icons";
import dayjs, {Dayjs} from "dayjs";
import {
    sendGenerateReport,
    sendGetReport,
    sendGetReportList,
    sendGetSharedReport,
    sendGetWholeReport,
} from "../common/newSendHttp";
import {useAuth} from "../common/loginCtx";
import {useAppTitle, useIsAppActive} from "../shell/runtime";
import {DayView, RawNews, ReportData} from "./ReportView";
import {keywordNewsOf} from "./keywordNews";
import "./report.css";

// 日报页：顶上是日期（左右箭头翻天、点日期选日子），下面是这一天的正文。
// 地址：/day-report/2026-11-24 是某一天，/day-report/whole 是新闻汇总。
// 没登录但带 ?t=签名 时是分享模式：只能看这一天，没有翻页和菜单。

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const WEEKDAYS = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

type LoadState =
    | { status: "loading" }
    | { status: "missing" }
    | { status: "ready"; report: ReportData };

function ReportPanel() {
    const {date} = useParams();
    const [params] = useSearchParams();
    const navigate = useNavigate();
    const auth = useAuth();
    const shareToken = params.get("t") || "";
    const shared = !auth.loginInfo.isValid();
    const isWhole = date === "whole";
    const selected = date && (isWhole || DATE_RE.test(date)) ? date : "";

    // 地址不合法（空、旧的区间地址 a_b 等）时换成今天或区间的最后一天
    useEffect(() => {
        if (selected) return;
        const last = date?.split("_").pop();
        const target = last && DATE_RE.test(last) ? last : dayjs().format("YYYY-MM-DD");
        navigate(`/day-report/${target}`, {replace: true});
    }, [selected, date, navigate]);

    const reportList = useReportList(!shared);
    const state = useReport(selected, shared ? shareToken : null);

    useAppTitle(selected ? (isWhole ? "新闻汇总" : `日报 ${dayjs(selected).format("M月D日")}`) : null);

    const go = (day: string) => navigate(`/day-report/${day}`);

    return <div className="rp-page">
        <ReportHeader
            selected={selected}
            shared={shared}
            reportList={reportList.list}
            onGo={go}
            onGenerated={() => {
                reportList.refresh();
                go(dayjs().format("YYYY-MM-DD"));
            }}
        />
        {state.status === "loading" && <Skeleton active paragraph={{rows: 8}} className="rp-skeleton"/>}
        {state.status === "missing" && <MissingView whole={isWhole} shared={shared} onLogin={() => navigate(`/day-report/${selected}`)}/>}
        {state.status === "ready" && (isWhole
            ? <WholeView report={state.report}/>
            : <DayView report={state.report}/>)}
    </div>;
}

function useReportList(enabled: boolean) {
    const [list, setList] = useState<string[]>([]);
    const refresh = () => {
        sendGetReportList({}, (ret) => {
            if (ret.ok) setList([...(ret.data.List || [])].sort());
        });
    };
    useEffect(() => {
        if (enabled) refresh();
    }, [enabled]);
    return {list, refresh};
}

// 按地址加载数据；shareToken 不为 null 时走免登录接口
function useReport(selected: string, shareToken: string | null): LoadState {
    const [state, setState] = useState<LoadState>({status: "loading"});
    useEffect(() => {
        if (!selected) return;
        setState({status: "loading"});
        // 切换太快时丢掉过期的回包
        let stale = false;
        const done = (ok: boolean, report?: ReportData) => {
            if (stale) return;
            setState(ok && report ? {status: "ready", report} : {status: "missing"});
        };
        if (shareToken !== null) {
            sendGetSharedReport({DayString: selected, Token: shareToken}, (ret) => done(ret.ok, ret.data.Report));
        } else if (selected === "whole") {
            sendGetWholeReport({}, (ret) => done(ret.ok, ret.data.Report));
        } else {
            sendGetReport({DayString: selected}, (ret) => done(ret.ok, ret.data.Report));
        }
        return () => {
            stale = true;
        };
    }, [selected, shareToken]);
    return state;
}

function ReportHeader({selected, shared, reportList, onGo, onGenerated}: {
    selected: string;
    shared: boolean;
    reportList: string[];
    onGo: (day: string) => void;
    onGenerated: () => void;
}) {
    const [pickerOpen, setPickerOpen] = useState(false);
    const isActive = useIsAppActive();
    const isDay = DATE_RE.test(selected);
    const {prev, next} = useMemo(() => {
        if (!isDay) return {prev: reportList[reportList.length - 1], next: undefined};
        return {
            prev: [...reportList].reverse().find(d => d < selected),
            next: reportList.find(d => d > selected),
        };
    }, [reportList, selected, isDay]);

    // 电脑上用键盘左右键翻天（应用在后台、或者在输入框里时不响应）
    useEffect(() => {
        if (shared || !isActive) return;
        const onKey = (e: KeyboardEvent) => {
            const target = e.target as HTMLElement | null;
            if (target && (target.isContentEditable || ["INPUT", "TEXTAREA"].includes(target.tagName))) return;
            if (e.key === "ArrowLeft" && prev) onGo(prev);
            if (e.key === "ArrowRight" && next) onGo(next);
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [shared, isActive, prev, next, onGo]);

    const generate = () => Modal.confirm({
        title: "重新生成今天的日报？",
        content: "会重新抓取新闻并调用 AI，大约需要几分钟，期间可以离开这个页面。",
        okText: "生成",
        cancelText: "取消",
        onOk: () => {
            const hide = message.loading("正在生成今天的日报…", 0);
            sendGenerateReport({}, (ret) => {
                hide();
                if (ret.ok) {
                    message.success("日报已生成");
                    onGenerated();
                } else {
                    message.error("生成失败，看一下后台日志");
                }
            });
        },
    });

    const day = isDay ? dayjs(selected) : null;
    const title = day
        ? <>
            <span className="rp-date-main">{day.format("M月D日")}</span>
            <span className="rp-date-sub">{WEEKDAYS[day.day()]}{day.year() !== dayjs().year() ? ` · ${day.year()}` : ""}</span>
        </>
        : <span className="rp-date-main">{selected === "whole" ? "新闻汇总" : ""}</span>;

    if (shared) {
        return <header className="rp-header">
            <div className="rp-date">{title}</div>
        </header>;
    }

    return <header className="rp-header">
        <button className="rp-date rp-date-btn" onClick={() => setPickerOpen(true)} disabled={!isDay}>
            {title}
            {isDay && <DownOutlined className="rp-date-caret"/>}
        </button>
        <Button type="text" icon={<LeftOutlined/>} disabled={!prev}
                onClick={() => prev && onGo(prev)} aria-label="前一天"/>
        <Button type="text" icon={<RightOutlined/>} disabled={!next}
                onClick={() => next && onGo(next)} aria-label="后一天"/>
        <Dropdown trigger={["click"]} placement="bottomRight" menu={{
            items: [
                {key: "today", label: "回到今天", disabled: selected === dayjs().format("YYYY-MM-DD")},
                {key: "whole", label: "新闻汇总（实时抓取）"},
                {type: "divider"},
                {key: "generate", label: "重新生成今天的日报"},
            ],
            onClick: ({key}) => {
                if (key === "today") onGo(dayjs().format("YYYY-MM-DD"));
                if (key === "whole") onGo("whole");
                if (key === "generate") generate();
            },
        }}>
            <Button type="text" icon={<EllipsisOutlined/>} aria-label="更多"/>
        </Dropdown>
        {/* 日期选择器本身藏起来，只借用它的弹出面板：点日期时打开，面板对齐顶栏左边 */}
        <DatePicker
            className="rp-hidden-picker"
            open={pickerOpen}
            onOpenChange={setPickerOpen}
            value={day}
            disabledDate={(d: Dayjs) => !reportList.includes(d.format("YYYY-MM-DD"))}
            onChange={(d) => {
                setPickerOpen(false);
                if (d) onGo(d.format("YYYY-MM-DD"));
            }}
            inputReadOnly
            allowClear={false}
            showNow={false}
        />
    </header>;
}

function MissingView({whole, shared, onLogin}: { whole: boolean; shared: boolean; onLogin: () => void }) {
    if (shared) {
        return <Empty className="rp-empty" description="链接无效，或者这天没有日报">
            <Button onClick={onLogin}>登录后查看</Button>
        </Empty>;
    }
    return <Empty className="rp-empty" description={whole ? "汇总抓取失败" : "这天没有日报"}/>;
}

// 新闻汇总：没有摘要，只有原始新闻，默认展开
function WholeView({report}: { report: ReportData }) {
    const keywordGroups = keywordNewsOf(report).filter(group => group.news.length > 0);
    return <div className="rp-day">
        <RawNews bbcNews={report.BbcNews || []} nytNews={report.NytNews || []} defaultOpen/>
        {keywordGroups.length > 0 && <section className="rp-section">
            <h2 className="rp-section-title">关键词</h2>
            {keywordGroups.map(group => <div key={group.keyword} className="rp-raw-group">
                <div className="rp-raw-head">{group.keyword}</div>
                <ul className="rp-news">
                    {group.news.map((item, i) => <li key={i}>
                        <div className="rp-news-title">
                            <a href={item.url} target="_blank" rel="noopener noreferrer">{item.title}</a>
                        </div>
                        {item.source && <div className="rp-news-meta">{item.source}</div>}
                    </li>)}
                </ul>
            </div>)}
        </section>}
    </div>;
}

export default ReportPanel;
