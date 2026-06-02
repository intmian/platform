import {Card, Collapse, Space, Tag, Typography} from "antd";
import type {DayDigest, KeywordBrief, RssItem, TopicBrief} from "../common/newSendHttp";

const {Text, Paragraph, Link} = Typography;

type GoogleNewsGroup = {
    KeyWord: string;
    News: RssItem[];
};

type ResolvedSource = {
    ref: string;
    label: string;
    title: string;
    link?: string;
    pubDate?: string;
};

type DigestConsoleProps = {
    digest: DayDigest;
    bbcNews: RssItem[];
    nytNews: RssItem[];
    googleNews: GoogleNewsGroup[];
};

function rssField(item: RssItem | undefined, lower: keyof RssItem, upper: keyof RssItem): string {
    const value = item?.[lower] ?? item?.[upper];
    return typeof value === "string" ? value : "";
}

function cleanRssText(value: string): string {
    return value
        .replace(/<[^>]*>/g, " ")
        .replace(/&nbsp;/gi, " ")
        .replace(/&amp;/gi, "&")
        .replace(/&lt;/gi, "<")
        .replace(/&gt;/gi, ">")
        .replace(/&quot;/gi, "\"")
        .replace(/&#39;/gi, "'")
        .replace(/\s+/g, " ")
        .trim();
}

function resolveSourceRef(ref: string, bbcNews: RssItem[], nytNews: RssItem[], googleNews: GoogleNewsGroup[]): ResolvedSource | null {
    const parts = ref.split(":");
    if (parts.length < 2) {
        return null;
    }

    if (parts[0] === "bbc" && parts.length === 2) {
        const index = Number(parts[1]);
        const item = bbcNews[index];
        if (!Number.isInteger(index) || !item) {
            return null;
        }
        return {
            ref,
            label: `BBC #${index + 1}`,
            title: cleanRssText(rssField(item, "title", "Title")),
            link: rssField(item, "link", "Link"),
            pubDate: rssField(item, "pubDate", "PubDate"),
        };
    }

    if (parts[0] === "nyt" && parts.length === 2) {
        const index = Number(parts[1]);
        const item = nytNews[index];
        if (!Number.isInteger(index) || !item) {
            return null;
        }
        return {
            ref,
            label: `NYT #${index + 1}`,
            title: cleanRssText(rssField(item, "title", "Title")),
            link: rssField(item, "link", "Link"),
            pubDate: rssField(item, "pubDate", "PubDate"),
        };
    }

    if (parts[0] === "google" && parts.length === 3) {
        const groupIndex = Number(parts[1]);
        const itemIndex = Number(parts[2]);
        const group = googleNews[groupIndex];
        const item = group?.News?.[itemIndex];
        if (!Number.isInteger(groupIndex) || !Number.isInteger(itemIndex) || !group || !item) {
            return null;
        }
        return {
            ref,
            label: `${group.KeyWord} #${itemIndex + 1}`,
            title: cleanRssText(rssField(item, "title", "Title")),
            link: rssField(item, "link", "Link"),
            pubDate: rssField(item, "pubDate", "PubDate"),
        };
    }

    return null;
}

function sourceCountText(count: number): string {
    return count > 0 ? `查看来源 ${count} 条` : "暂无来源";
}

function SourceList({refs, bbcNews, nytNews, googleNews}: {
    refs: string[];
    bbcNews: RssItem[];
    nytNews: RssItem[];
    googleNews: GoogleNewsGroup[];
}) {
    const sources = refs
        .map(ref => resolveSourceRef(ref, bbcNews, nytNews, googleNews))
        .filter((source): source is ResolvedSource => source !== null);

    if (sources.length === 0) {
        return <Text type="secondary">无可展开来源</Text>;
    }

    return (
        <Space direction="vertical" size={0} style={{width: "100%"}}>
            {sources.map(source => {
                return (
                    <div key={source.ref} style={{
                        padding: "8px 0",
                        borderTop: "1px solid #f0f0f0",
                    }}>
                        <Space size={6} wrap style={{width: "100%"}}>
                            <Tag style={{marginInlineEnd: 0}}>{source.label}</Tag>
                            {source.link
                                ? <Link href={source.link} target="_blank" rel="noopener noreferrer">{source.title || source.ref}</Link>
                                : <Text>{source.title || source.ref}</Text>}
                        </Space>
                        {source.pubDate && <Text type="secondary" style={{display: "block", fontSize: 12, marginTop: 4}}>
                            {new Date(source.pubDate).toLocaleString("zh-CN", {timeZone: "Asia/Shanghai"})}
                        </Text>}
                    </div>
                );
            })}
        </Space>
    );
}

function FocusSection({digest, bbcNews, nytNews, googleNews}: DigestConsoleProps) {
    const items = digest.pushBrief?.importantNews?.length > 0 ? digest.pushBrief.importantNews : digest.importantNews || [];
    if (!items || items.length === 0) {
        return <Text type="secondary">暂无今日重点</Text>;
    }

    return (
        <Collapse
            bordered={false}
            ghost
            size="small"
            items={items.map((item, index) => {
                const refs = item.sourceRefs || [];
                return {
                    key: `${item.title}-${index}`,
                    label: (
                        <Space direction="vertical" size={4} style={{width: "100%"}}>
                            <Space size={8} wrap>
                                <Text strong>{item.title || "未命名重点"}</Text>
                                <Text type="secondary">{sourceCountText(refs.length)}</Text>
                            </Space>
                            {item.summary && <Text>{item.summary}</Text>}
                        </Space>
                    ),
                    children: (
                        <SourceList refs={refs} bbcNews={bbcNews} nytNews={nytNews} googleNews={googleNews}/>
                    ),
                    style: {borderBottom: "1px solid #f0f0f0"},
                };
            })}
        />
    );
}

function TopicSection({topics, bbcNews, nytNews, googleNews}: {
    topics: TopicBrief[];
    bbcNews: RssItem[];
    nytNews: RssItem[];
    googleNews: GoogleNewsGroup[];
}) {
    if (!topics || topics.length === 0) {
        return <Text type="secondary">暂无重要主题</Text>;
    }

    return (
        <Collapse
            bordered={false}
            ghost
            size="small"
            items={topics.map((topic, index) => ({
                key: `${topic.topic}-${index}`,
                label: (
                    <Space direction="vertical" size={4} style={{width: "100%"}}>
                        <Space size={8} wrap>
                            <Text strong>{topic.topic || "未命名主题"}</Text>
                            <Text type="secondary">{sourceCountText(topic.sourceRefs?.length || 0)}</Text>
                        </Space>
                        {topic.summary && <Text type="secondary">{topic.summary}</Text>}
                    </Space>
                ),
                children: (
                    <SourceList refs={topic.sourceRefs || []} bbcNews={bbcNews} nytNews={nytNews} googleNews={googleNews}/>
                ),
                style: {borderBottom: "1px solid #f0f0f0"},
            }))}
        />
    );
}

function KeywordSection({keywords, bbcNews, nytNews, googleNews}: {
    keywords: KeywordBrief[];
    bbcNews: RssItem[];
    nytNews: RssItem[];
    googleNews: GoogleNewsGroup[];
}) {
    if (!keywords || keywords.length === 0) {
        return <Text type="secondary">暂无关键词</Text>;
    }

    return (
        <Collapse
            bordered={false}
            ghost
            size="small"
            items={keywords.map((keyword, index) => ({
                key: `${keyword.keyword}-${index}`,
                label: (
                    <Space direction="vertical" size={4} style={{width: "100%"}}>
                        <Space size={8} wrap>
                            <Text strong>{keyword.keyword || "未命名关键词"}</Text>
                            <Text type="secondary">{sourceCountText(keyword.sourceRefs?.length || keyword.count || 0)}</Text>
                        </Space>
                        {keyword.summary && <Text type="secondary">{keyword.summary}</Text>}
                    </Space>
                ),
                children: (
                    <SourceList refs={keyword.sourceRefs || []} bbcNews={bbcNews} nytNews={nytNews} googleNews={googleNews}/>
                ),
                style: {borderBottom: "1px solid #f0f0f0"},
            }))}
        />
    );
}

export function DigestConsole({digest, bbcNews, nytNews, googleNews}: DigestConsoleProps) {
    return (
        <Card title="日报导航" style={{
            marginBottom: "16px",
            borderRadius: "8px",
            boxShadow: "0 2px 8px rgba(0, 0, 0, 0.08)",
            backgroundColor: "#fff",
        }}>
            <Space direction="vertical" size={16} style={{width: "100%"}}>
                <section>
                    <Text strong>今日重点</Text>
                    <FocusSection digest={digest} bbcNews={bbcNews} nytNews={nytNews} googleNews={googleNews}/>
                </section>

                <section>
                    <Text strong>主题地图</Text>
                    <TopicSection topics={digest.topicBriefs || []} bbcNews={bbcNews} nytNews={nytNews} googleNews={googleNews}/>
                </section>

                <section>
                    <Text strong>关注新闻</Text>
                    <KeywordSection keywords={digest.keywordBriefs || []} bbcNews={bbcNews} nytNews={nytNews} googleNews={googleNews}/>
                </section>
            </Space>
        </Card>
    );
}
