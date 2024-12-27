import {DayReport, sendGetReport, sendGetWholeReport, WholeReport} from "../common/newSendHttp";
import React, {useEffect, useState} from "react";
import {Card, Col, Divider, List, Row, Tabs, Tag, Typography} from 'antd';
import {CloudOutlined, WindowsOutlined} from '@ant-design/icons';

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
        <Row>
            <Col>
                <Title level={2}>{selected === "whole" ? "整体" : selected} 日报</Title>
            </Col>
        </Row>
        {data ? Dashboard({data}) : <Card loading={true}/>}
    </div>;
}


// 天气数据接口
interface WeatherData {
    daily: Array<{
        tempMax: number;
        tempMin: number;
        textDay: string;
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
        <Card title="今日天气" bordered={false}>
            <Row gutter={16}>
                <Col span={8}>
                    <Title level={4}>温度</Title>
                    <Text>最高: {today.tempMax}°C</Text><br/>
                    <Text>最低: {today.tempMin}°C</Text><br/>
                    <Text>{today.textDay}</Text>
                </Col>
                <Col span={8}>
                    <Title level={4}>风</Title>
                    <Text>{today.windDirDay} {today.windScaleDay}</Text><br/>
                    <Text><WindowsOutlined/> {today.windSpeedDay} km/h</Text>
                </Col>
                <Col span={8}>
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

interface NewsCardProps {
    articles: NewsArticle[];
}

function NewsCard({articles}: NewsCardProps) {
    return <Card bordered={false}>
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


function GoogleNewsCard({title, articles}: { title: string, articles: NewsArticle[] }) {
    return (
        <Card title={title} bordered={false}>
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
    const {Weather, WeatherIndex, BbcNews, NytNews, GoogleNews} = data;

    // 生成谷歌新闻
    const GoogleNewsCards: JSX.Element[] = [];
    for (let i = 0; i < GoogleNews.length; i++) {
        GoogleNewsCards.push(<GoogleNewsCard key={i} title={GoogleNews[i].KeyWord} articles={GoogleNews[i].News}/>);
    }

    return (
        <div>
            <Row gutter={16}>
                <Col span={12}>
                    <WeatherCard weather={Weather} weatherIndex={WeatherIndex}/>
                </Col>
                <Col span={12}>
                    <Tabs defaultActiveKey="1">
                        <Tabs.TabPane tab="BBC 新闻" key="1">
                            <NewsCard articles={BbcNews}/>
                        </Tabs.TabPane>
                        <Tabs.TabPane tab="NYT 新闻" key="2">
                            <NewsCard articles={NytNews}/>
                        </Tabs.TabPane>
                        <Tabs.TabPane tab="关注新闻" key="3">
                            {GoogleNewsCards}
                        </Tabs.TabPane>
                    </Tabs>
                </Col>
            </Row>
        </div>
    );
}

export default ReportShow;