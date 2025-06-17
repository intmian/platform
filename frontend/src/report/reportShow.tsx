import {DayReport, sendGetReport, sendGetWholeReport, WholeReport} from "../common/newSendHttp";
import React, {useEffect, useRef, useState} from "react";
import {Button, Card, Col, Collapse, List, Menu, Row, Tag, Typography} from 'antd';
import {CloudOutlined, MenuOutlined, WindowsOutlined} from '@ant-design/icons';
import {Link} from "react-router-dom";
import {useIsMobile} from "../common/hooksv2";

const {Title, Text} = Typography;


function ReportShow({selected}: {
    selected: string,
}) {
    const [data, setData] = useState<DayReport | WholeReport | null>(null);

    // 发送请求
    useEffect(() => {
        if (selected === "") {
            return;
        }
        // 多天聚合
        if (selected.includes("_")) {
            const days = selected.split("_");
            let reports: DayReport[] = [];
            let loaded = 0;
            let summary = "";
            let weather: any = null;
            let weatherIndex: any = null;
            let bbcNews: any[] = [];
            let nytNews: any[] = [];
            let googleNews: any[] = [];
            // 并发请求
            days.forEach(day => {
                sendGetReport({DayString: day}, (ret) => {
                    if (ret.ok) {
                        reports.push(ret.data.Report);
                    }
                    loaded++;
                    if (loaded === days.length) {
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
                            if (rep.GoogleNews) googleNews = googleNews.concat(rep.GoogleNews || []);
                            dayI++;
                        }
                        setData({
                            Summary: summary,
                            Weather: weather,
                            WeatherIndex: weatherIndex,
                            BbcNews: bbcNews,
                            NytNews: nytNews,
                            GoogleNews: googleNews,
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
                }
            });
        } else {
            sendGetReport({DayString: selected}, (ret) => {
                if (ret.ok) {
                    setData(ret.data.Report);
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
        <Dashboard data={data}/>
    </div>;
}


// 天气数据接口
interface WeatherData {
    daily: Array<{
        tempMax: number;
        tempMin: number;
        textDay: string;
        textNight: string;
        windDirDay: string;
        windScaleDay: string;
        windSpeedDay: number;
        humidity: number;
        cloud: number;
    }>;
}

// 天气指数数据接口
interface WeatherIndexData {
    daily: Array<{
        name: string;
        category: string;
        text: string;
        level: number;
    }>;
}

// 新闻数据接口
interface NewsArticle {
    title: string;
    link: string;
    description: string;
    pubDate: string;
}

// 谷歌新闻组
interface GoogleNewsGroup {
    KeyWord: string;
    News: NewsArticle[];
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
            boxShadow: '0 4px 10px rgba(0, 0, 0, 0.15)', /* 阴影效果 */
            backgroundColor: '#fff',           /* 背景色 */
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
                    backgroundColor: "white",
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
                                            color={item.level > 3 ? "red" : item.level > 2 ? "orange" : item.level > 1 ? "yellow" : "green"}>
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
        boxShadow: '0 4px 10px rgba(0, 0, 0, 0.15)', /* 阴影效果 */
        backgroundColor: '#fff',           /* 背景色 */
    }}>
        {paragraphs.map((p, i) => (
            <Typography.Paragraph key={i}>{p}<br/></Typography.Paragraph>
        ))}
    </Card>;
}

function NewsCard({title, articles}: { title: string, articles?: NewsArticle[] }) {
    const isMobile = useIsMobile();

    if (!articles) {
        return <Card title={title} style={{
            marginBottom: '16px',
            borderRadius: '10px',               /* 圆角 */
            boxShadow: '0 4px 10px rgba(0, 0, 0, 0.15)', /* 阴影效果 */
            backgroundColor: '#fff',           /* 背景色 */
            padding: '16px',                     /* 内边距 */
        }}>
            <Text type="secondary">暂无新闻</Text>
        </Card>;
    }

    return <Card title={title} style={{
        marginBottom: '16px',
        borderRadius: '10px',               /* 圆角 */
        boxShadow: '0 4px 10px rgba(0, 0, 0, 0.15)', /* 阴影效果 */
        backgroundColor: '#fff',           /* 背景色 */
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
                            <Link to={item.link} target="_blank" rel="noopener noreferrer"
                                  style={{color: "black", fontWeight: 'normal'}}>{item.title}
                            </Link>
                            <Text type="secondary" style={{fontSize: '12px', fontWeight: 'normal'}}>
                                {isMobile ? new Date(item.pubDate).toLocaleDateString('zh-CN', {timeZone: 'Asia/Shanghai'}) : new Date(item.pubDate).toLocaleString('zh-CN', {timeZone: 'Asia/Shanghai'})}
                            </Text>
                        </div>}
                        description={item.description}
                    />
                </List.Item>
            )}
        />
    </Card>
}

function GoogleNewsCard({title, articles}: { title: string, articles?: NewsArticle[] }) {
    const isMobile = useIsMobile();
    const fakeNews = ["- 风闻", "- 观察者网", "- 环球网", "- 环球时报"];
    const boughtNews = ["- 汽车之家", "- 车家号"];

    if (!articles) {
        return <Card title={title} style={{
            marginBottom: '16px',
            borderRadius: '10px',
            boxShadow: '0 4px 10px rgba(0, 0, 0, 0.15)',
            backgroundColor: '#fff',
            padding: '16px',
        }}>
            <Text type="secondary">暂无新闻</Text>
        </Card>;
    }
    return (
        <Card title={title} style={{
            marginBottom: '16px',
            borderRadius: '10px',
            boxShadow: '0 4px 10px rgba(0, 0, 0, 0.15)',
            backgroundColor: '#fff',
            padding: '16px',
        }}>
            <List
                itemLayout="horizontal"
                dataSource={articles}
                renderItem={item => {
                    let tag: React.ReactNode = null;
                    if (fakeNews.some(domain => item.title.includes(domain))) {
                        tag = <Tag color="red" style={{marginRight: 4}}>谣媒</Tag>;
                    } else if (boughtNews.some(domain => item.title.includes(domain))) {
                        tag = <Tag color="orange" style={{marginRight: 4}}>枪媒</Tag>;
                    }
                    return (
                        <List.Item key={item.title} style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                        }}>
                            <div style={{display: 'flex', alignItems: 'center'}}>
                                {tag}
                                <Link to={item.link} target="_blank" rel="noopener noreferrer">{item.title}</Link>
                            </div>
                            <Text type="secondary" style={{
                                width: "20ch",
                                textAlign: 'right',
                            }}>
                                {isMobile
                                    ? new Date(item.pubDate).toLocaleDateString('zh-CN', {timeZone: 'Asia/Shanghai'})
                                    : new Date(item.pubDate).toLocaleString('zh-CN', {timeZone: 'Asia/Shanghai'})}
                            </Text>
                        </List.Item>
                    );
                }}
            />
        </Card>
    );
}

interface DashboardProps {
    data: {
        Weather?: WeatherData;
        WeatherIndex?: WeatherIndexData;
        Summary?: string;
        BbcNews: NewsArticle[];
        NytNews: NewsArticle[];
        GoogleNews: GoogleNewsGroup[];
    };
}

function Dashboard({data}: DashboardProps) {
    // 创建 refs 来绑定每个组件
    const weatherRef = useRef<HTMLDivElement>(null);
    const bbcNewsRef = useRef<HTMLDivElement>(null);
    const nytNewsRef = useRef<HTMLDivElement>(null);
    const googleNewsRef = useRef<HTMLDivElement>(null);

    // 管理是否显示导航
    const [showNav, setShowNav] = useState<boolean>(true);

    // 判断是否为手机端
    const isMobile = useIsMobile();

    if (!data) {
        return <Card title="Loading..." bordered={false} loading={true}/>;
    }
    const {Weather, WeatherIndex, BbcNews, NytNews, GoogleNews} = data;

    // 生成谷歌新闻组件，有数据的放在前面，没有数据的放在后面
    const GoogleNewsCards: React.ReactNode[] = [];
    for (const group of GoogleNews) {
        if (group.News && group.News.length > 0) {
            GoogleNewsCards.push(<GoogleNewsCard title={group.KeyWord} articles={group.News}/>);
        }
    }
    for (const group of GoogleNews) {
        if (!group.News || group.News.length === 0) {
            GoogleNewsCards.push(<GoogleNewsCard title={group.KeyWord}/>);
        }
    }


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
            {Weather && <Menu.Item onClick={() => scrollToRef(weatherRef)}>天气</Menu.Item>}
            <Menu.Item onClick={() => scrollToRef(bbcNewsRef)}>BBC新闻</Menu.Item>
            <Menu.Item onClick={() => scrollToRef(nytNewsRef)}>纽约时报</Menu.Item>
            <Menu.Item onClick={() => scrollToRef(googleNewsRef)}>关注新闻</Menu.Item>
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
                borderLeft: '1px solid #ddd',
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
                    backgroundColor: 'white',
                    boxShadow: '0 2px 5px rgba(0, 0, 0, 0.1)',
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
                        color: '#333',
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
                {data.Summary && <SummaryCard summary={data.Summary}/>}
                {Weather && <div ref={weatherRef}>
                    <WeatherCard weather={Weather} weatherIndex={WeatherIndex}/>
                </div>}
                <div ref={bbcNewsRef} style={{
                    marginBottom: '16px',
                }}>
                    <NewsCard title={"BBC新闻"} articles={BbcNews}/>
                </div>
                <div ref={nytNewsRef} style={{
                    marginBottom: '16px',
                }}>
                    <NewsCard title={"纽约时报"} articles={NytNews}/>
                </div>
                <div ref={googleNewsRef}>
                    {GoogleNewsCards}
                </div>
            </div>
            {right}
        </div>
    );
}

export default ReportShow;