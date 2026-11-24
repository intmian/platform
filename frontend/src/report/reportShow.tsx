import {DayReport, sendGetReport, sendGetWholeReport} from "../common/newSendHttp";
import React, {useEffect, useRef, useState} from "react";
import {Button, Card, Col, Collapse, Empty, List, Menu, Row, Tag, Typography} from 'antd';
import {CloudOutlined, MenuOutlined, WindowsOutlined} from '@ant-design/icons';
import {useIsMobile} from "../common/breakpoints";
import {DigestConsole} from "./reportDigest";
import type {KeywordNewsGroup, RssItem} from "../common/newSendHttp";
import {formatPublished, keywordNewsOf, mergeKeywordNews} from "./keywordNews";

const {Title, Text, Link: TypographyLink} = Typography;


// 单天、多天聚合、新闻汇总三种数据都按这个形状展示（汇总没有天气和概要）
type ReportData = Omit<DayReport, "Weather" | "WeatherIndex"> & {
    Weather?: DayReport["Weather"];
    WeatherIndex?: DayReport["WeatherIndex"];
};

function ReportShow({selected}: { selected: string }) {
    const [data, setData] = useState<ReportData | null>(null);
    // 请求失败（这天没有日报或后端出错）时不再一直转圈
    const [missing, setMissing] = useState(false);

    // 发送请求
    useEffect(() => {
        if (selected === "") {
            return;
        }
        setData(null);
        setMissing(false);
        // 多天聚合
        if (selected.includes("_")) {
            const days = selected.split("_");
            let reports: DayReport[] = [];
            let loaded = 0;
            let summary = "";
            let bbcNews: RssItem[] = [];
            let nytNews: RssItem[] = [];
            const keywordLists: KeywordNewsGroup[][] = [];
            // 并发请求
            days.forEach(day => {
                sendGetReport({DayString: day}, (ret) => {
                    if (ret.ok) {
                        reports.push(ret.data.Report);
                    }
                    loaded++;
                    if (loaded === days.length) {
                        if (reports.length === 0) {
                            setMissing(true);
                            return;
                        }
                        // 聚合
                        let dayI = 0;
                        for (const rep of reports) {
                            if (rep.Summary) {
                                // 日期 内容 日期 内容
                                summary += days[dayI] + '\n' + rep.Summary + "\n";
                            }
                            // if (rep.Weather && !weather) weather = rep.Weather;
                            // if (rep.WeatherIndex && !weatherIndex) weatherIndex = rep.WeatherIndex;
                            if (rep.BbcNews) bbcNews = bbcNews.concat(rep.BbcNews || []);
                            if (rep.NytNews) nytNews = nytNews.concat(rep.NytNews || []);
                            keywordLists.push(keywordNewsOf(rep));
                            dayI++;
                        }
                        setData({
                            Summary: summary,
                            BbcNews: bbcNews,
                            NytNews: nytNews,
                            KeywordNews: mergeKeywordNews(keywordLists),
                        });
                    }
                });
            });
            return;
        }
        if (selected === "whole") {
            sendGetWholeReport({}, (ret) => {
                if (ret.ok) {
                    setData(ret.data.Report);
                } else {
                    setMissing(true);
                }
            });
        } else {
            sendGetReport({DayString: selected}, (ret) => {
                if (ret.ok) {
                    setData(ret.data.Report);
                } else {
                    setMissing(true);
                }
            })
        }
    }, [selected]);

    return <div>
        <Row style={{
            // 居中
            display: 'flex',
            justifyContent: 'center',
            marginBottom: '2px',
        }}>
            <Title level={2}>
                {selected === "whole" ? "新闻汇总" :
                    selected.includes("_") ? selected.replace(/_/g, " ~ ") + " 区间日报" : selected + " 日报"}
            </Title>
        </Row>
        {missing ? <Empty style={{marginTop: 48}} description={selected === "whole" ? "没有汇总" : "这天没有日报"}/> :
            <Dashboard data={data}/>}
    </div>;
}


type WeatherData = DayReport["Weather"];
type WeatherIndexData = DayReport["WeatherIndex"];

// 新闻数据接口
interface NewsArticle {
    title: string;
    link: string;
    description?: string;
    pubDate: string;
    Title?: string;
    Link?: string;
    Description?: string;
    PubDate?: string;
}

interface WeatherCardProps {
    weather: WeatherData;
    weatherIndex: WeatherIndexData;
}


function WeatherCard({weather, weatherIndex}: WeatherCardProps) {
    const today = weather.daily[0];
    const indices = weatherIndex.daily;

    return (
        <Card title="今日天气" style={{
            marginBottom: '16px',
            borderRadius: '10px',               /* 圆角 */
            boxShadow: 'var(--pf-shadow)', /* 阴影效果 */
        }}>
            <Row gutter={16} style={{
                marginBottom: '32px',
            }}>
                <Col span={6}>
                    <Title level={4}>天气</Title>
                    <Text>白天: {today.textDay}</Text><br/>
                    <Text>晚上: {today.textNight}</Text><br/>
                </Col>
                <Col span={6}>
                    <Title level={4}>温度</Title>
                    <Text>最高: {today.tempMax}°C</Text><br/>
                    <Text>最低: {today.tempMin}°C</Text><br/>
                </Col>
                <Col span={6}>
                    <Title level={4}>风</Title>
                    <Text>{today.windDirDay} {today.windScaleDay}</Text><br/>
                    <Text><WindowsOutlined/> {today.windSpeedDay} km/h</Text>
                </Col>
                <Col span={6}>
                    <Title level={4}>阴湿</Title>
                    <Text>湿度{today.humidity}%</Text><br/>
                    <Text><CloudOutlined/> {today.cloud}%</Text>
                </Col>
            </Row>
            <Collapse bordered={false}>
                <Collapse.Panel header="天气指数" key="1" style={{
                    // 不要背景颜色
                    backgroundColor: "transparent",
                }}>
                    <List
                        dataSource={indices}
                        renderItem={item => (
                            <List.Item key={item.name}>
                                <Row gutter={16} align="middle" style={{
                                    width: "100%",
                                }}>
                                    <Col span={6}>
                                        <Text>{item.name}:</Text>
                                    </Col>
                                    <Col span={6}>
                                        <Tag
                                            color={Number(item.level) > 3 ? "red" : Number(item.level) > 2 ? "orange" : Number(item.level) > 1 ? "yellow" : "green"}>
                                            {item.category}
                                        </Tag>
                                    </Col>
                                    <Col span={12}>
                                        <Text>{item.text}</Text>
                                    </Col>
                                </Row>
                            </List.Item>
                        )}
                    />
                </Collapse.Panel>
            </Collapse>
        </Card>
    );
}

function SummaryCard({summary}: { summary: string }) {
    // 拆分成段落
    const paragraphs = summary.split('\n');

    return <Card title="概要" style={{
        marginBottom: '16px',
        borderRadius: '10px',               /* 圆角 */
        boxShadow: 'var(--pf-shadow)', /* 阴影效果 */
    }}>
        {paragraphs.map((p, i) => (
            <Typography.Paragraph key={i}>{p}<br/></Typography.Paragraph>
        ))}
    </Card>;
}

function cleanNewsDescription(description?: string): string | undefined {
    if (!description) {
        return undefined;
    }
    const cleaned = description
        .replace(/<[^>]*>/g, " ")
        .replace(/&nbsp;/gi, " ")
        .replace(/&amp;/gi, "&")
        .replace(/&lt;/gi, "<")
        .replace(/&gt;/gi, ">")
        .replace(/&quot;/gi, "\"")
        .replace(/&#39;/gi, "'")
        .replace(/\s+/g, " ")
        .trim();
    return cleaned || undefined;
}

function NewsCard({title, articles}: { title: string, articles?: NewsArticle[] }) {
    const isMobile = useIsMobile();

    if (!articles || articles.length === 0) {
        return <Card title={title} style={{
            marginBottom: '16px',
            borderRadius: '10px',               /* 圆角 */
            boxShadow: 'var(--pf-shadow)', /* 阴影效果 */
            padding: '16px',                     /* 内边距 */
        }}>
            <Text type="secondary">暂无新闻</Text>
        </Card>;
    }

    return <Card title={title} style={{
        marginBottom: '16px',
        borderRadius: '10px',               /* 圆角 */
        boxShadow: 'var(--pf-shadow)', /* 阴影效果 */
        padding: '16px',                     /* 内边距 */
    }}>
        <List
            itemLayout="horizontal"
            dataSource={articles}
            renderItem={item => (
                <List.Item key={item.title}>
                    <List.Item.Meta
                        title={<div
                            style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                            }}
                        >
                            <TypographyLink href={item.link} target="_blank" rel="noopener noreferrer"
                                            style={{color: "var(--pf-text)", fontWeight: 'normal'}}>{item.title}
                            </TypographyLink>
                            <Text type="secondary" style={{fontSize: '12px', fontWeight: 'normal'}}>
                                {isMobile ? new Date(item.pubDate).toLocaleDateString('zh-CN', {timeZone: 'Asia/Shanghai'}) : new Date(item.pubDate).toLocaleString('zh-CN', {timeZone: 'Asia/Shanghai'})}
                            </Text>
                        </div>}
                        description={cleanNewsDescription(item.description)}
                    />
                </List.Item>
            )}
        />
    </Card>
}

const cardStyle: React.CSSProperties = {
    marginBottom: '16px',
    borderRadius: '10px',
    boxShadow: 'var(--pf-shadow)',
    padding: '16px',
};

// "新闻"是默认类型，不显示标签，其余类型用颜色区分
const keywordKindColors: Record<string, string> = {爆料: "magenta", 前瞻: "blue", 讨论: "default"};

// 一个关注关键词一张卡片：顶部一句话动态，下面是出处列表
function KeywordNewsCard({group}: { group: KeywordNewsGroup }) {
    const isMobile = useIsMobile();
    const hasNews = group.news.length > 0;

    return (
        <Card
            title={group.keyword}
            extra={group.error && !hasNews
                ? <Tag color="red">搜索失败</Tag>
                : hasNews && <Text type="secondary">{group.news.length} 条</Text>}
            style={cardStyle}
        >
            {group.summary && group.summary.split("\n").map((line, index) => (
                <Typography.Paragraph key={index} style={{marginBottom: 8}}>{line}</Typography.Paragraph>
            ))}
            {!hasNews && <Text type="secondary">
                {group.error ? `搜索失败：${group.error}` : "今日无新动态"}
            </Text>}
            {hasNews && <List
                itemLayout="vertical"
                size="small"
                dataSource={group.news}
                renderItem={(item, index) => (
                    <List.Item key={`${item.url}-${index}`} style={{paddingInline: 0}}>
                        <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12}}>
                            <div style={{display: 'flex', alignItems: 'baseline', gap: 6, flexWrap: 'wrap', minWidth: 0}}>
                                {item.kind && keywordKindColors[item.kind] && <Tag color={keywordKindColors[item.kind]} style={{marginInlineEnd: 0}}>{item.kind}</Tag>}
                                {item.caution && <Tag color="orange" style={{marginInlineEnd: 0}}>{item.caution}</Tag>}
                                <TypographyLink href={item.url} target="_blank" rel="noopener noreferrer">{item.title}</TypographyLink>
                                {item.source && <Text type="secondary" style={{fontSize: 12}}>{item.source}</Text>}
                            </div>
                            <Text type="secondary" style={{fontSize: 12, whiteSpace: 'nowrap'}}>
                                {formatPublished(item.published, isMobile)}
                            </Text>
                        </div>
                        {item.summary && <Text type="secondary" style={{display: 'block', fontSize: 13, marginTop: 2}}>
                            {item.summary}
                        </Text>}
                    </List.Item>
                )}
            />}
        </Card>
    );
}

interface DashboardProps {
    data: ReportData | null;
}

function Dashboard({data}: DashboardProps) {
    // 创建 refs 来绑定每个组件
    const weatherRef = useRef<HTMLDivElement>(null);
    const bbcNewsRef = useRef<HTMLDivElement>(null);
    const nytNewsRef = useRef<HTMLDivElement>(null);
    const keywordNewsRef = useRef<HTMLDivElement>(null);

    // 管理是否显示导航
    const [showNav, setShowNav] = useState<boolean>(true);

    // 判断是否为手机端
    const isMobile = useIsMobile();

    if (!data) {
        return <Card bordered={false} loading={true}/>;
    }
    let {Weather, WeatherIndex, BbcNews, NytNews, digest} = data;

    // 按时间升序排序
    const digestBbcNews = BbcNews || [];
    const digestNytNews = NytNews || [];
    const keywordNews = keywordNewsOf(data);
    // 天气抓取失败时字段是空对象，不显示天气卡片
    const hasWeather = Boolean(Weather?.daily?.length && WeatherIndex?.daily);
    const sortedBbcNews = [...digestBbcNews].sort((a, b) => new Date(a.pubDate).getTime() - new Date(b.pubDate).getTime());
    const sortedNytNews = [...digestNytNews].sort((a, b) => new Date(a.pubDate).getTime() - new Date(b.pubDate).getTime());
    // 有新闻的关键词放前面，其余保持原顺序
    const keywordNewsCards = [
        ...keywordNews.filter(group => group.news.length > 0),
        ...keywordNews.filter(group => group.news.length === 0),
    ].map(group => <KeywordNewsCard key={`keyword-news-${group.keyword}`} group={group}/>);


    const toggleNav = () => {
        setShowNav(!showNav);
    };

    // 滚动到对应组件
    const scrollToRef = (ref: React.RefObject<HTMLDivElement>) => {
        if (ref.current) {
            ref.current.scrollIntoView({behavior: 'smooth', block: 'start'});
        }
    };

    // 通用导航菜单组件
    const renderNavMenu = () => (
        <Menu mode="vertical" style={{width: isMobile ? '100%' : '200px'}}>
            {hasWeather && <Menu.Item onClick={() => scrollToRef(weatherRef)}>天气</Menu.Item>}
            <Menu.Item onClick={() => scrollToRef(bbcNewsRef)}>BBC新闻</Menu.Item>
            <Menu.Item onClick={() => scrollToRef(nytNewsRef)}>纽约时报</Menu.Item>
            <Menu.Item onClick={() => scrollToRef(keywordNewsRef)}>关注新闻</Menu.Item>
        </Menu>
    );

    let right;
    if (!isMobile) {
        right = <div
            style={{
                position: 'fixed', // 滚动后固定导航
                top: '10px',
                right: '10px',
                width: '200px',
                padding: '10px',
                borderLeft: '1px solid var(--pf-border-2)',
                zIndex: 1000,
                transition: 'position 0.3s ease',
            }}
        >
            {renderNavMenu()}
        </div>;
    } else {
        if (showNav) {
            right = <div
                style={{
                    position: 'fixed',
                    top: '10px',
                    right: '10px',
                    backgroundColor: 'var(--pf-bg-elevated)',
                    boxShadow: 'var(--pf-shadow)',
                    zIndex: 1000,
                    padding: '10px',
                    width: '150px',
                }}
            >
                {renderNavMenu()}
                <Button
                    type="text"
                    onClick={toggleNav}
                    size={'small'}
                    style={{
                        position: 'absolute',
                        top: '5px',
                        right: '5px',
                        color: 'var(--pf-text)',
                        fontSize: '16px',
                    }}
                >
                    X
                </Button>
            </div>
        } else {
            right = <Button
                type="primary"
                shape="circle"
                icon={<MenuOutlined/>}
                onClick={toggleNav}
                style={{
                    position: 'fixed',
                    top: '10px',
                    right: '10px',
                    backgroundColor: 'rgba(0, 0, 0, 0.5)',
                    color: 'white',
                }}
            />
        }
    }

    return (
        <div style={{
            display: 'flex', flexDirection: 'column',
            padding: '16px',
        }}>
            {/* 左侧内容 */}
            <div style={{flex: 1}}>
                {digest
                    ? <DigestConsole digest={digest} bbcNews={digestBbcNews} nytNews={digestNytNews} keywordNews={keywordNews}/>
                    : data.Summary && <SummaryCard summary={data.Summary}/>}
                {hasWeather && Weather && WeatherIndex && <div ref={weatherRef}>
                    <WeatherCard weather={Weather} weatherIndex={WeatherIndex}/>
                </div>}
                <div ref={bbcNewsRef} style={{
                    marginBottom: '16px',
                }}>
                    <NewsCard title={"BBC新闻"} articles={sortedBbcNews}/>
                </div>
                <div ref={nytNewsRef} style={{
                    marginBottom: '16px',
                }}>
                    <NewsCard title={"纽约时报"} articles={sortedNytNews}/>
                </div>
                <div ref={keywordNewsRef}>
                    {keywordNewsCards}
                </div>
            </div>
            {right}
        </div>
    );
}

export default ReportShow;
