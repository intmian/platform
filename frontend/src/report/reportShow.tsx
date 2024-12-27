import {DayReport, sendGetReport, sendGetWholeReport, WholeReport} from "../common/newSendHttp";
import React, {useEffect, useRef, useState} from "react";
import {Button, Card, Col, Divider, List, Menu, Row, Tag, Typography} from 'antd';
import {CloudOutlined, MenuOutlined, WindowsOutlined} from '@ant-design/icons';
import {useMediaQuery} from "react-responsive";

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
            <Title level={2}>{selected === "whole" ? "整体" : selected} 日报</Title>
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
            padding: '16px',                     /* 内边距 */
        }}>
            <Row gutter={16}>
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
                    <Title level={4}>湿度</Title>
                    <Text>{today.humidity}%</Text><br/>
                    <Text><CloudOutlined/> {today.cloud}%</Text>
                </Col>
            </Row>
            <Divider/>
            <Title level={4}>天气指数</Title>
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
        </Card>
    );
}

function NewsCard({title, articles}: { title: string, articles: NewsArticle[] }) {
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
                        title={<a href={item.link} target="_blank" rel="noopener noreferrer">{item.title}</a>}
                        description={item.description}
                    />
                </List.Item>
            )}
        />
    </Card>
}


function GoogleNewsCard({title, articles}: { title: string, articles?: NewsArticle[] }) {
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
    return (
        <Card title={title} style={{
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
                            title={<a href={item.link} target="_blank" rel="noopener noreferrer">{item.title}</a>}
                        />
                    </List.Item>
                )}
            />
        </Card>
    );
}

interface DashboardProps {
    data: {
        Weather: WeatherData;
        WeatherIndex: WeatherIndexData;
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
    const isMobile = useMediaQuery({query: '(max-width: 768px)'});

    if (!data) {
        return <Card title="Loading..." bordered={false} loading={true}/>;
    }
    const {Weather, WeatherIndex, BbcNews, NytNews, GoogleNews} = data;

    // 生成谷歌新闻组件
    const GoogleNewsCards = GoogleNews
        .sort((a, b) => (a.News?.length === 0 ? 1 : b.News?.length === 0 ? -1 : 0))
        .map((newsItem, index) => (
            <GoogleNewsCard key={index} title={newsItem.KeyWord} articles={newsItem.News}/>
        ));

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
            <Menu.Item onClick={() => scrollToRef(weatherRef)}>天气</Menu.Item>
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
                <div ref={weatherRef}>
                    <WeatherCard weather={Weather} weatherIndex={WeatherIndex}/>
                </div>
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