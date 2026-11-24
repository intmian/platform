import {ReactNode, useLayoutEffect, useRef, useState} from "react";
import {Tag} from "antd";
import {DownOutlined} from "@ant-design/icons";
import type {DayReport, DigestItem, KeywordNewsGroup, KeywordNewsItem, RssItem} from "../common/newSendHttp";
import {formatPublished, keywordNewsOf} from "./keywordNews";
import {cleanRssText, ReportSources, resolveSourceRefs, rssField} from "./sources";

// 一天日报的正文，从上到下：天气一行 → 概览 → 今日重点 → 关注 → 原始新闻（折叠）。
// 每一条都是"先看一句话，点开再看来源"，手机上一屏能扫完重点和关键词。

export type ReportData = Omit<DayReport, "Weather" | "WeatherIndex"> & {
    Weather?: DayReport["Weather"];
    WeatherIndex?: DayReport["WeatherIndex"];
};

export function DayView({report}: { report: ReportData }) {
    const keywordNews = keywordNewsOf(report);
    const sources: ReportSources = {bbcNews: report.BbcNews || [], nytNews: report.NytNews || [], keywordNews};
    const digest = report.digest;
    // 页面上用完整版的重点（推送里那份是精简版），没有时退回推送版
    const important = digest?.importantNews?.length ? digest.importantNews : digest?.pushBrief?.importantNews || [];
    const overview = digest?.overview || digest?.pushBrief?.overview || "";

    return <div className="rp-day">
        <WeatherStrip report={report}/>
        {overview
            ? <Overview text={overview}/>
            : report.Summary && <Overview text={report.Summary}/>}
        {important.length > 0 && <Section title="今日重点" count={important.length}>
            <ol className="rp-list">
                {important.map((item, i) => <ImportantRow key={`${item.title}-${i}`} index={i} item={item} sources={sources}/>)}
            </ol>
        </Section>}
        <KeywordSection groups={keywordNews}/>
        <RawNews bbcNews={report.BbcNews || []} nytNews={report.NytNews || []}/>
    </div>;
}

function Section({title, count, children}: { title: string; count?: number; children: ReactNode }) {
    return <section className="rp-section">
        <h2 className="rp-section-title">
            {title}
            {count !== undefined && <span className="rp-section-count">{count}</span>}
        </h2>
        {children}
    </section>;
}

// ---------- 天气 ----------

function WeatherStrip({report}: { report: ReportData }) {
    const [open, setOpen] = useState(false);
    const today = report.Weather?.daily?.[0];
    if (!today) return null;
    const indices = report.WeatherIndex?.daily || [];
    const text = today.textDay === today.textNight ? today.textDay : `${today.textDay}转${today.textNight}`;

    return <div className="rp-weather">
        <button className="rp-weather-line" onClick={() => setOpen(!open)} disabled={indices.length === 0}>
            <span className="rp-weather-main">{text} {today.tempMin}–{today.tempMax}°C</span>
            <span className="rp-weather-sub">{today.windDirDay}{today.windScaleDay}级 · 湿度{today.humidity}%</span>
            {indices.length > 0 && <DownOutlined className={`rp-chevron ${open ? "rp-chevron-open" : ""}`}/>}
        </button>
        {open && <ul className="rp-weather-index">
            {indices.map(item => <li key={item.name}>
                <span className="rp-weather-index-name">{item.name.replace(/指数$/, "")}</span>
                <span className={`rp-level rp-level-${Math.min(Number(item.level) || 1, 4)}`}>{item.category}</span>
                <span className="rp-weather-index-text">{item.text}</span>
            </li>)}
        </ul>}
    </div>;
}

// ---------- 概览 ----------

// 收起时把所有段落连成一段、只露三行；点一下展开成原来的分段。
// 只有文字真的被截断时才显示"展开"按钮：渲染后比较内容总高度和可见高度，前者更高就是被截掉了。
function Overview({text}: { text: string }) {
    const [open, setOpen] = useState(false);
    const [clamped, setClamped] = useState(false);
    const ref = useRef<HTMLParagraphElement>(null);
    const paragraphs = text.split("\n").map(p => p.trim()).filter(Boolean);

    useLayoutEffect(() => {
        const measure = () => {
            const el = ref.current;
            if (el) setClamped(el.scrollHeight > el.clientHeight + 1);
        };
        measure();
        window.addEventListener("resize", measure);
        return () => window.removeEventListener("resize", measure);
    }, [text, open]);

    const canToggle = open || clamped;
    return <div className={`rp-overview ${open ? "rp-overview-open" : ""} ${canToggle ? "rp-overview-toggle" : ""}`}
                onClick={() => canToggle && setOpen(!open)}>
        {open
            ? paragraphs.map((p, i) => <p key={i}>{p}</p>)
            : <p ref={ref}>{paragraphs.join(" ")}</p>}
        {canToggle && <span className="rp-overview-more">
            {open ? "收起" : "展开"}<DownOutlined className={`rp-chevron ${open ? "rp-chevron-open" : ""}`}/>
        </span>}
    </div>;
}

// ---------- 今日重点 ----------

function ImportantRow({index, item, sources}: { index: number; item: DigestItem; sources: ReportSources }) {
    const [open, setOpen] = useState(false);
    const refs = resolveSourceRefs(item.sourceRefs, sources);
    const canOpen = refs.length > 0;

    return <li className="rp-item">
        <button className="rp-item-head" onClick={() => setOpen(!open)} disabled={!canOpen}>
            <span className="rp-item-index">{index + 1}</span>
            <span className="rp-item-body">
                <span className="rp-item-title">{item.title || item.summary}</span>
                {item.title && item.summary && <span className="rp-item-summary">{item.summary}</span>}
            </span>
            {canOpen && <span className="rp-item-meta">
                {refs.length}<DownOutlined className={`rp-chevron ${open ? "rp-chevron-open" : ""}`}/>
            </span>}
        </button>
        {open && <ul className="rp-sources">
            {refs.map(source => <li key={source.ref}>
                <span className="rp-source-label">{source.label}</span>
                {source.link
                    ? <a href={source.link} target="_blank" rel="noopener noreferrer">{source.title || source.ref}</a>
                    : <span>{source.title || source.ref}</span>}
            </li>)}
        </ul>}
    </li>;
}

// ---------- 关注关键词 ----------

function KeywordSection({groups}: { groups: KeywordNewsGroup[] }) {
    if (groups.length === 0) return null;
    const active = groups.filter(group => group.news.length > 0);
    const failed = groups.filter(group => group.news.length === 0 && group.error);
    const quiet = groups.filter(group => group.news.length === 0 && !group.error);

    return <Section title="关注" count={active.length}>
        {active.length > 0 && <ul className="rp-list">
            {active.map(group => <KeywordRow key={group.keyword} group={group}/>)}
        </ul>}
        {quiet.length > 0 && <p className="rp-muted-line">无新动态：{quiet.map(g => g.keyword).join("、")}</p>}
        {failed.map(group => <p key={group.keyword} className="rp-muted-line rp-error-line" title={group.error}>
            {group.keyword}：搜索失败
        </p>)}
    </Section>;
}

function KeywordRow({group}: { group: KeywordNewsGroup }) {
    const [open, setOpen] = useState(false);
    return <li className="rp-item">
        <button className="rp-item-head" onClick={() => setOpen(!open)}>
            <span className="rp-item-body">
                <span className="rp-item-title">{group.keyword}</span>
                {group.summary && <span className="rp-item-summary">{group.summary}</span>}
            </span>
            <span className="rp-item-meta">
                {group.news.length}<DownOutlined className={`rp-chevron ${open ? "rp-chevron-open" : ""}`}/>
            </span>
        </button>
        {open && <ul className="rp-news">
            {group.news.map((item, i) => <KeywordNewsLine key={`${item.url}-${i}`} item={item}/>)}
        </ul>}
    </li>;
}

// "新闻"是默认类型，不显示标签，其余类型用颜色区分
const kindColors: Record<string, string> = {爆料: "magenta", 前瞻: "blue", 讨论: "default"};

function KeywordNewsLine({item}: { item: KeywordNewsItem }) {
    const meta = [item.source, formatPublished(item.published, true)].filter(Boolean).join(" · ");
    return <li>
        <div className="rp-news-title">
            {item.kind && kindColors[item.kind] && <Tag color={kindColors[item.kind]} bordered={false}>{item.kind}</Tag>}
            {item.caution && <Tag color="orange" bordered={false}>{item.caution}</Tag>}
            <a href={item.url} target="_blank" rel="noopener noreferrer">{item.title}</a>
        </div>
        {item.summary && <div className="rp-news-summary">{item.summary}</div>}
        {meta && <div className="rp-news-meta">{meta}</div>}
    </li>;
}

// ---------- 原始新闻 ----------

export function RawNews({bbcNews, nytNews, defaultOpen = false}: { bbcNews: RssItem[]; nytNews: RssItem[]; defaultOpen?: boolean }) {
    if (bbcNews.length === 0 && nytNews.length === 0) return null;
    return <Section title="原始新闻">
        <div className="rp-raw">
            <RawGroup name="BBC" items={bbcNews} defaultOpen={defaultOpen}/>
            <RawGroup name="纽约时报" items={nytNews} defaultOpen={defaultOpen}/>
        </div>
    </Section>;
}

function RawGroup({name, items, defaultOpen}: { name: string; items: RssItem[]; defaultOpen: boolean }) {
    const [open, setOpen] = useState(defaultOpen);
    if (items.length === 0) return null;
    // 按发布时间从新到旧
    const sorted = [...items].sort((a, b) =>
        new Date(rssField(b, "pubDate", "PubDate")).getTime() - new Date(rssField(a, "pubDate", "PubDate")).getTime());

    return <div className="rp-raw-group">
        <button className="rp-raw-head" onClick={() => setOpen(!open)}>
            <span>{name}</span>
            <span className="rp-item-meta">{items.length} 条<DownOutlined className={`rp-chevron ${open ? "rp-chevron-open" : ""}`}/></span>
        </button>
        {open && <ul className="rp-news">
            {sorted.map((item, i) => {
                const desc = cleanRssText(rssField(item, "description", "Description"));
                return <li key={i}>
                    <div className="rp-news-title">
                        <a href={rssField(item, "link", "Link")} target="_blank" rel="noopener noreferrer">
                            {cleanRssText(rssField(item, "title", "Title"))}
                        </a>
                    </div>
                    {desc && <div className="rp-news-summary">{desc}</div>}
                    <div className="rp-news-meta">{formatPublished(rssField(item, "pubDate", "PubDate"), true)}</div>
                </li>;
            })}
        </ul>}
    </div>;
}
