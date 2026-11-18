import type {DayDigest, KeywordNewsGroup, LegacyGoogleNewsGroup, RssItem} from "../common/newSendHttp";

// 日报里关注关键词的数据有两种来源：
// - 新日报：KeywordNews（模型联网搜索），直接用；
// - 旧日报：GoogleNews（RSS），在这里转成同样的结构，界面只需要处理一种格式。
// 转换时保持分组和条目的顺序，所以旧 digest 里的 google:组:条 引用也能按下标找到对应新闻。
export function keywordNewsOf(report: {
    KeywordNews?: KeywordNewsGroup[];
    GoogleNews?: LegacyGoogleNewsGroup[];
    digest?: DayDigest;
}): KeywordNewsGroup[] {
    if (report.KeywordNews) {
        return report.KeywordNews.map(group => ({...group, news: group.news || []}));
    }
    const briefs = report.digest?.keywordBriefs || [];
    return (report.GoogleNews || []).map(group => ({
        keyword: group.KeyWord,
        summary: briefs.find(brief => brief.keyword === group.KeyWord)?.summary || "",
        news: (group.News || []).map(legacyItem),
    }));
}

// 旧日报没有模型给的来源提醒，沿用当时的固定名单
const legacyPropagandaSources = ["风闻", "观察者网", "环球网", "环球时报"];
const legacyPaidSources = ["汽车之家", "车家号"];

function legacyCaution(source: string): string | undefined {
    if (legacyPropagandaSources.some(name => source.includes(name))) {
        return "谣媒";
    }
    if (legacyPaidSources.some(name => source.includes(name))) {
        return "枪媒";
    }
    return undefined;
}

function legacyItem(item: RssItem) {
    const rawTitle = item.title ?? item.Title ?? "";
    // Google News 的标题是 "标题 - 媒体名"，拆出媒体名
    const splitAt = rawTitle.lastIndexOf(" - ");
    const source = splitAt > 0 ? rawTitle.slice(splitAt + 3) : "";
    return {
        title: splitAt > 0 ? rawTitle.slice(0, splitAt) : rawTitle,
        source,
        caution: legacyCaution(source),
        url: item.link ?? item.Link ?? "",
        published: item.pubDate ?? item.PubDate ?? "",
        summary: "",
    };
}

// 多天区间日报：同一个关键词的新闻和摘要合并到一起
export function mergeKeywordNews(lists: KeywordNewsGroup[][]): KeywordNewsGroup[] {
    const merged: KeywordNewsGroup[] = [];
    for (const list of lists) {
        for (const group of list) {
            const existing = merged.find(item => item.keyword === group.keyword);
            if (!existing) {
                merged.push({...group, news: [...group.news]});
                continue;
            }
            existing.news.push(...group.news);
            if (group.summary) {
                existing.summary = existing.summary ? `${existing.summary}\n${group.summary}` : group.summary;
            }
            if (existing.error && !group.error) {
                existing.error = undefined;
            }
        }
    }
    return merged;
}

// 新数据只有日期（YYYY-MM-DD），旧数据是完整时间
export function formatPublished(published: string, isMobile: boolean): string {
    if (!published) {
        return "";
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(published)) {
        return published.slice(5);
    }
    const date = new Date(published);
    if (Number.isNaN(date.getTime())) {
        return published;
    }
    return isMobile
        ? date.toLocaleDateString("zh-CN", {timeZone: "Asia/Shanghai"})
        : date.toLocaleString("zh-CN", {timeZone: "Asia/Shanghai"});
}
