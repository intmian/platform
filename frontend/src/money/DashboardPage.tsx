import {useCallback, useEffect, useMemo, useState} from "react";
import {useNavigate, useParams} from "react-router-dom";
import {Button, Empty, Pagination, Spin, Tabs, message} from "antd";
import {formatMoney, formatRate, getMoneyDashboard} from "./moneyApi";
import {MoneyDashboard, MoneyDashboardTrendItem, MoneySummary} from "./types";
import {MoneyShell, PageHeader, useIsAdmin, MoneyMetric} from "./components";
import {signedClass} from "./utils";
import {sortRecordsAsc, summarizeRecord, dashboardTrendItems, loadAdminDashboardFallback} from "./summary";
import {buildStructureTree, StructureTree} from "./structure";

function DashboardSummary({summary, latestDate}: { summary: MoneySummary, latestDate: string }) {
    return <div className="money-dashboard-summary">
        <div className="money-hero-metric">
            <div className="money-metric-label">当前净资产</div>
            <div className={`money-hero-value ${signedClass(summary.netAssetCents)}`}>{formatMoney(summary.netAssetCents)}</div>
            <div className="money-hero-sub">
                <span>较上期 <strong className={signedClass(summary.netAssetChangeCents)}>{formatMoney(summary.netAssetChangeCents)}</strong></span>
                <span>最新记录 {latestDate || "暂无"}</span>
            </div>
        </div>
        <div className="money-dashboard-metrics">
            <MoneyMetric label="现金" value={formatMoney(summary.cashCents)}/>
            <MoneyMetric label="总资产" value={formatMoney(summary.totalAssetCents)}/>
            <MoneyMetric label="负债" value={formatMoney(summary.liabilityCents)}/>
            <MoneyMetric label="投资盈利" value={formatMoney(summary.investmentProfitCents)}/>
            <MoneyMetric label="净资产负债率" value={formatRate(summary.netAssetLiabilityRate)}/>
            <MoneyMetric label="资产负债率" value={formatRate(summary.assetLiabilityRate)}/>
        </div>
    </div>;
}

function TrendLine({values}: { values: MoneyDashboardTrendItem[] }) {
    const [hoverIndex, setHoverIndex] = useState<number | null>(null);
    if (!values.length) {
        return <Empty description="暂无趋势数据"/>;
    }
    const width = 760;
    const height = 260;
    const padding = {top: 24, right: 28, bottom: 40, left: 72};
    const minValue = Math.min(...values.map((item) => item.netAssetCents), 0);
    const maxValue = Math.max(...values.map((item) => item.netAssetCents), 0);
    const range = maxValue - minValue || 1;
    const plotWidth = width - padding.left - padding.right;
    const plotHeight = height - padding.top - padding.bottom;
    const points = values.map((item, index) => {
        const x = padding.left + (values.length === 1 ? plotWidth / 2 : index / (values.length - 1) * plotWidth);
        const y = padding.top + (maxValue - item.netAssetCents) / range * plotHeight;
        return {...item, x, y};
    });
    const linePath = points.map((item, index) => `${index === 0 ? "M" : "L"} ${item.x} ${item.y}`).join(" ");
    const zeroY = padding.top + (maxValue - 0) / range * plotHeight;
    const hoverPoint = hoverIndex === null ? null : points[hoverIndex];
    const tooltipClass = hoverPoint ? [
        "money-line-tooltip",
        hoverPoint.x > width * 0.72 ? "is-left" : "is-right",
        hoverPoint.y < height * 0.34 ? "is-below" : "is-above",
    ].join(" ") : "";
    return <div>
        <div className="money-line-chart">
            <div className="money-line-scroll">
                <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="净资产历史趋势折线图">
                    <line className="money-line-axis" x1={padding.left} y1={padding.top} x2={padding.left} y2={height - padding.bottom}/>
                    <line className="money-line-axis" x1={padding.left} y1={height - padding.bottom} x2={width - padding.right} y2={height - padding.bottom}/>
                    <line className="money-line-zero" x1={padding.left} y1={zeroY} x2={width - padding.right} y2={zeroY}/>
                    <text className="money-line-scale" x={padding.left - 10} y={padding.top + 4} textAnchor="end">{formatMoney(maxValue)}</text>
                    <text className="money-line-scale" x={padding.left - 10} y={height - padding.bottom + 4} textAnchor="end">{formatMoney(minValue)}</text>
                    <path className="money-line-path" d={linePath}/>
                    {points.map((item, index) => <g key={`${item.date}-${index}`}>
                        <circle
                            className={`money-line-point ${hoverIndex === index ? "is-active" : ""}`}
                            cx={item.x}
                            cy={item.y}
                            r={hoverIndex === index ? 6 : 4}
                            tabIndex={0}
                            onMouseEnter={() => setHoverIndex(index)}
                            onMouseLeave={() => setHoverIndex(null)}
                            onFocus={() => setHoverIndex(index)}
                            onBlur={() => setHoverIndex(null)}
                            onClick={() => setHoverIndex(index)}
                            onTouchStart={() => setHoverIndex(index)}
                        />
                        <text className="money-line-date" x={item.x} y={height - 14} textAnchor="middle">{item.date.slice(5)}</text>
                    </g>)}
                </svg>
            </div>
            {hoverPoint ? <div className={tooltipClass} style={{left: `${hoverPoint.x / width * 100}%`, top: `${hoverPoint.y / height * 100}%`}}>
                <strong>{hoverPoint.date}</strong>
                <span>净资产 {formatMoney(hoverPoint.netAssetCents)}</span>
                <span>总资产 {formatMoney(hoverPoint.totalAssetCents)}</span>
                <span>负债 {formatMoney(hoverPoint.liabilityCents)}</span>
                <span>现金 {formatMoney(hoverPoint.cashCents)}</span>
            </div> : null}
        </div>
        <div className="money-trend-list">
            {values.slice().reverse().map((item, index) => <div className="money-trend-list-row" key={`${item.date}-${index}`}>
                <span>{item.date}</span>
                <strong className={signedClass(item.netAssetCents)}>{formatMoney(item.netAssetCents)}</strong>
            </div>)}
        </div>
    </div>;
}

function DashboardEvents({dashboard}: { dashboard: MoneyDashboard }) {
    const pageSize = 5;
    const [currentPage, setCurrentPage] = useState(1);
    const events = useMemo(() => (dashboard.events || [])
        .map((event, index) => ({event, index}))
        .filter((item) => String(item.event.content || "").trim() !== "")
        .sort((a, b) => String(b.event.date || "").localeCompare(String(a.event.date || "")) || a.index - b.index)
        .map((item) => item.event), [dashboard.events]);
    const pageCount = Math.max(1, Math.ceil(events.length / pageSize));
    const page = Math.min(currentPage, pageCount);
    const pageEvents = events.slice((page - 1) * pageSize, page * pageSize);
    useEffect(() => {
        setCurrentPage(1);
    }, [dashboard.events]);
    if (!events.length) {
        return <Empty description="暂无大事记"/>;
    }
    return <div className="money-event-list">
        {pageEvents.map((event) => <div className="money-event-item" key={event.id || `${event.date}-${event.content}`}>
            <div className="money-event-date">{event.date}</div>
            <div className="money-event-content">{event.content}</div>
        </div>)}
        {events.length > pageSize ? <Pagination
            className="money-event-pagination"
            current={page}
            pageSize={pageSize}
            total={events.length}
            showSizeChanger={false}
            onChange={setCurrentPage}
        /> : null}
    </div>;
}

export function MoneyDashboardPage() {
    const navigate = useNavigate();
    const {bookId = ""} = useParams();
    const isAdmin = useIsAdmin();
    const [dashboard, setDashboard] = useState<MoneyDashboard | null>(null);
    const [loading, setLoading] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const nextDashboard = await getMoneyDashboard(bookId);
            setDashboard(isAdmin ? await loadAdminDashboardFallback(bookId, nextDashboard) : nextDashboard);
        } catch {
            message.error("看板加载失败");
        } finally {
            setLoading(false);
        }
    }, [bookId, isAdmin]);

    useEffect(() => {
        if (bookId) {
            load();
        }
    }, [bookId, load]);

    const dashboardRecords = useMemo(() => sortRecordsAsc(dashboard?.records || []), [dashboard?.records]);
    const latestRecord = dashboardRecords[dashboardRecords.length - 1] || null;
    const dashboardSummary = useMemo(() => summarizeRecord(latestRecord, dashboard?.items || [], dashboardRecords.length > 1), [dashboard?.items, dashboardRecords.length, latestRecord]);
    const trends = useMemo(() => dashboardTrendItems(dashboard), [dashboard]);

    const assetTree = useMemo(() => buildStructureTree({
        rootName: "资产合计",
        mode: "asset",
        record: latestRecord,
        items: dashboard?.items || [],
    }), [dashboard?.items, latestRecord]);

    const liabilityTree = useMemo(() => buildStructureTree({
        rootName: "负债合计",
        mode: "liability",
        record: latestRecord,
        items: dashboard?.items || [],
    }), [dashboard?.items, latestRecord]);

    return <MoneyShell>
        <PageHeader title={dashboard?.book?.name || "家庭账本看板"} desc={dashboard?.latestDate ? `最新确认记录：${dashboard.latestDate}` : "暂无确认记录"} extra={<Button onClick={() => navigate("/money")}>返回列表</Button>}/>
        <Spin spinning={loading}>
            {!dashboard ? <div className="money-section"><Empty description="暂无看板数据"/></div> : <>
                {!dashboard.latestRecordId ? <div className="money-section money-empty-action">
                    <Empty description="暂无确认记录"/>
                    <Button type="primary" onClick={() => navigate(`/money/${bookId}/history`)}>去完成首次对账</Button>
                </div> : <>
                    <DashboardSummary summary={dashboardSummary} latestDate={dashboard.latestDate}/>
                    <div className="money-section money-dashboard-panel">
                        <Tabs
                            items={[
                                {key: "trend", label: "历史趋势", children: <TrendLine values={trends}/>},
                                {key: "asset", label: "资产结构", children: <StructureTree root={assetTree}/>},
                                {key: "liability", label: "负债结构", children: <StructureTree root={liabilityTree}/>},
                            ]}
                        />
                    </div>
                    <div className="money-section">
                        <div className="money-section-title"><h2>大事记</h2></div>
                        <DashboardEvents dashboard={dashboard}/>
                    </div>
                </>}
            </>}
        </Spin>
    </MoneyShell>;
}
