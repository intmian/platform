import type {KeywordNewsGroup, RssItem} from "../common/newSendHttp";

// 摘要里的 sourceRefs 是指向原始新闻的编号：bbc:3、nyt:0、kw:组:条（旧日报是 google:组:条）。
// 这里把编号翻译成能展示的标题和链接。

export type ResolvedSource = {
    ref: string;
    label: string;   // 来源名，例如 BBC、纽约时报、关键词名
    title: string;
    link?: string;
    pubDate?: string;
};

export type ReportSources = {
    bbcNews: RssItem[];
    nytNews: RssItem[];
    keywordNews: KeywordNewsGroup[];
};

// RSS 字段有大写、小写两种写法（新旧数据不同），都兼容
export function rssField(item: RssItem | undefined, lower: keyof RssItem, upper: keyof RssItem): string {
    const value = item?.[lower] ?? item?.[upper];
    return typeof value === "string" ? value : "";
}

export function cleanRssText(value: string | undefined): string {
    if (!value) return "";
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

function fromRss(ref: string, label: string, item: RssItem | undefined): ResolvedSource | null {
    if (!item) return null;
    return {
        ref,
        label,
        title: cleanRssText(rssField(item, "title", "Title")),
        link: rssField(item, "link", "Link"),
        pubDate: rssField(item, "pubDate", "PubDate"),
    };
}

export function resolveSourceRef(ref: string, sources: ReportSources): ResolvedSource | null {
    const parts = ref.split(":");
    if ((parts[0] === "bbc" || parts[0] === "nyt") && parts.length === 2) {
        const index = Number(parts[1]);
        if (!Number.isInteger(index)) return null;
        return parts[0] === "bbc"
            ? fromRss(ref, "BBC", sources.bbcNews[index])
            : fromRss(ref, "纽约时报", sources.nytNews[index]);
    }
    if ((parts[0] === "kw" || parts[0] === "google") && parts.length === 3) {
        const group = sources.keywordNews[Number(parts[1])];
        const item = group?.news?.[Number(parts[2])];
        if (!group || !item) return null;
        return {ref, label: group.keyword, title: cleanRssText(item.title), link: item.url, pubDate: item.published};
    }
    return null;
}

export function resolveSourceRefs(refs: string[] | undefined, sources: ReportSources): ResolvedSource[] {
    return (refs || [])
        .map(ref => resolveSourceRef(ref, sources))
        .filter((source): source is ResolvedSource => source !== null);
}
