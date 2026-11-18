package mods

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/url"
	"regexp"
	"strings"
	"sync"
	"time"

	ai "github.com/intmian/mian_go_lib/tool/ai/v2"
	"github.com/intmian/platform/backend/services/auto/tool"
	backendshare "github.com/intmian/platform/backend/share"
)

// KeywordNewsGroup 是一个关键词当天的搜索结果，取代旧的 GoogleNews（RSS）。
type KeywordNewsGroup struct {
	Keyword string `json:"keyword"`
	// Summary 是当天动态的一句话概括；为空表示没有新动态。
	Summary string            `json:"summary"`
	News    []KeywordNewsItem `json:"news"`
	// Error 非空表示这个关键词搜索失败（其他关键词不受影响）。
	Error string `json:"error,omitempty"`
}

type KeywordNewsItem struct {
	Title     string `json:"title"`
	URL       string `json:"url"`
	Source    string `json:"source"`
	Published string `json:"published"` // YYYY-MM-DD；拿不准时为空
	Summary   string `json:"summary"`
	// Kind 是内容类型：新闻、爆料、前瞻、讨论。
	Kind string `json:"kind,omitempty"`
	// Caution 是模型对来源可靠性的提醒，例如"内宣媒体"，可靠时为空。
	Caution string `json:"caution,omitempty"`
}

const (
	keywordNewsMaxItems    = 8
	keywordNewsConcurrency = 3
	keywordNewsTimeout     = 4 * time.Minute
	// keywordNewsSearchCount 取接口上限：按请求次数计费，多取结果不加搜索费。
	keywordNewsSearchCount = 50
	// 搜索语法也算在查询长度里，接口上限是 128 个字符。
	keywordNewsMaxKeywordRunes = 90
	keywordNewsCandidateRunes  = 300
)

// keywordNewsAI 是关键词新闻依赖的两步：搜索网页、用模型筛选。
type keywordNewsAI interface {
	SearchWeb(ctx context.Context, req backendshare.AIWebSearchRequest) ([]backendshare.AIWebSearchResult, error)
	Request(ctx context.Context, req backendshare.AITextQueueRequest) (backendshare.AITextQueueResponse, error)
}

type platformKeywordNewsAI struct {
	config backendshare.AIPlatformConfig
}

func (a platformKeywordNewsAI) SearchWeb(ctx context.Context, req backendshare.AIWebSearchRequest) ([]backendshare.AIWebSearchResult, error) {
	ret, err := a.config.RunWebSearchScene(ctx, backendshare.AISceneWebSearch, req)
	return ret.Results, err
}

func (a platformKeywordNewsAI) Request(ctx context.Context, req backendshare.AITextQueueRequest) (backendshare.AITextQueueResponse, error) {
	queueID, err := a.config.QueueIDForScene(backendshare.AISceneKeywordNews, ai.ModelTypeText)
	if err != nil {
		return backendshare.AITextQueueResponse{}, err
	}
	return a.config.RunTextQueueRequest(ctx, queueID, req)
}

// keywordNewsCandidate 是一条送去筛选的搜索结果，Published 已换算成北京时间的日期。
type keywordNewsCandidate struct {
	backendshare.AIWebSearchResult
	Published string
}

// keywordNewsSelection 是模型对一条候选的处理结果，Ref 是候选编号，链接由代码按编号取，模型编不出来。
type keywordNewsSelection struct {
	Ref       int    `json:"ref"`
	Title     string `json:"title"`
	Source    string `json:"source"`
	Published string `json:"published"`
	Kind      string `json:"kind"`
	Caution   string `json:"caution"`
	Summary   string `json:"summary"`
}

func keywordNewsSchema() *ai.ChatJSONSchema {
	str := map[string]any{"type": "string"}
	item := map[string]any{
		"type":                 "object",
		"additionalProperties": false,
		"required":             []string{"ref", "title", "source", "published", "kind", "caution", "summary"},
		"properties": map[string]any{
			"ref":   map[string]any{"type": "integer"},
			"title": str, "source": str, "published": str, "caution": str, "summary": str,
			"kind": map[string]any{"type": "string", "enum": []string{"新闻", "爆料", "前瞻", "讨论"}},
		},
	}
	return &ai.ChatJSONSchema{
		Name:   "keyword_news",
		Strict: true,
		Schema: map[string]any{
			"type":                 "object",
			"additionalProperties": false,
			"required":             []string{"summary", "items"},
			"properties": map[string]any{
				"summary": str,
				"items":   map[string]any{"type": "array", "items": item},
			},
		},
	}
}

// buildKeywordNewsQuery 只搜一次，不限语言：实测限定中文会明显漏掉海外来源。
func buildKeywordNewsQuery(keyword string, day string) string {
	runes := []rune(keyword)
	if len(runes) > keywordNewsMaxKeywordRunes {
		runes = runes[:keywordNewsMaxKeywordRunes]
	}
	target, err := time.Parse("2006-01-02", day)
	if err != nil {
		return string(runes)
	}
	return fmt.Sprintf("%s after:%s before:%s", string(runes), target.AddDate(0, 0, -1).Format("2006-01-02"), target.AddDate(0, 0, 2).Format("2006-01-02"))
}

// publishedInBeijing 把接口返回的 UTC 时间换算成北京时间的日期，无法解析时返回空。
func publishedInBeijing(raw string) string {
	parsed, err := time.Parse(time.RFC3339, strings.TrimSpace(raw))
	if err != nil {
		return ""
	}
	return parsed.In(beijingLocation()).Format("2006-01-02")
}

// selectKeywordCandidates 在调用模型前去掉日期不符、前一天报过和重复的结果，省下模型费用。
func selectKeywordCandidates(results []backendshare.AIWebSearchResult, day string, previous []KeywordNewsItem) []keywordNewsCandidate {
	seen := map[string]bool{}
	for _, item := range previous {
		if key := normalizeNewsURL(item.URL); key != "" {
			seen[key] = true
		}
	}
	candidates := make([]keywordNewsCandidate, 0, len(results))
	for _, result := range results {
		key := normalizeNewsURL(result.URL)
		if key == "" || seen[key] || !strings.HasPrefix(result.URL, "http") {
			continue
		}
		published, inWindow := normalizeNewsPublished(publishedInBeijing(result.Date), day)
		if !inWindow {
			continue
		}
		seen[key] = true
		candidates = append(candidates, keywordNewsCandidate{AIWebSearchResult: result, Published: published})
	}
	return candidates
}

func buildKeywordNewsPrompt(keyword string, day string, candidates []keywordNewsCandidate, previous []KeywordNewsItem) string {
	var b strings.Builder
	fmt.Fprintf(&b, `你是一名资讯编辑，替读者盯着他关注的关键词：有什么风吹草动都要告诉他，宁可多收，不要漏掉。
下面是「%s」的搜索结果，请挑出 %s（北京时间）这一天的动态，前后一天内发布的也算。

收录范围（kind 字段）：
- 新闻：产品发布与更新、官方公告、监管与诉讼、行业动态、重要数据。
- 爆料：内部消息、供应链传闻、泄露内容、爆料人的说法，没有证实也要收。
- 前瞻：对未发布产品或后续走向的预测和分析。
- 讨论：论坛、Reddit、社交媒体上有信息量的帖子。
不收：导购、促销降价、选购指南、使用教程、SEO 拼凑稿，以及只是字面上碰到关键词的内容。

来源不设黑名单，都可以收，但要判断来源是否可靠，有问题时写在 caution 字段（12 字以内），可靠就留空：
- 内宣媒体：官方宣传口径、立场先行，涉及政治、中美关系、外国公司时尤其要留意，例如观察者网、风闻、环球网、环球时报。
- 收钱发稿：平台号或自媒体收钱写黑稿、软文，例如汽车之家、车家号。针对某个品牌的负面内容要特别留意。
- 以上只是举例，请按来源性质自行判断同类来源。caution 只用于这两类来源问题，写成"内宣媒体"或"疑似收钱发稿"这样的短语；爆料未证实、论坛个人说法、厂商宣传、报道角度都不写。

要求：
- 关键词可能是缩写或有歧义，按它最常见的含义理解。
- 同一事件只保留一条，优先官方或更可靠来源的原文。
- 最多 %d 条；确实没有就返回空数组。
`, keyword, day, keywordNewsMaxItems)
	if len(previous) > 0 {
		b.WriteString("\n前一天已经报道过以下内容，除非有新进展，否则不要重复收录：\n")
		for _, item := range previous {
			fmt.Fprintf(&b, "- %s\n", item.Title)
		}
	}
	b.WriteString(`
输出字段：
- summary：用一句中文（不超过 60 字）直接概括这个关键词的最新动态，传闻要写明是传闻；只写动态本身，不要提筛选过程或没收录什么；没有收录任何内容时为空字符串。
- items：每条包含 ref（候选编号，只能从下面的候选里选）、title（中文标题，非中文原文要翻译）、source（媒体或平台名）、published（原文发布日期，YYYY-MM-DD；拿不准就填空字符串，不要因此丢弃）、kind、caution、summary（一句中文概要）。
- 所有文字字段里不要附加链接、网址或引用标记。

候选（编号 | 标题 | 来源 | 发布日期 | 来源权威等级，-1 表示未知 | 摘要）：
`)
	for i, candidate := range candidates {
		summary := candidate.Summary
		if strings.TrimSpace(summary) == "" {
			summary = candidate.Snippet
		}
		if runes := []rune(summary); len(runes) > keywordNewsCandidateRunes {
			summary = string(runes[:keywordNewsCandidateRunes])
		}
		fmt.Fprintf(&b, "[%d] %s | %s | %s | %d | %s\n", i, candidate.Title, candidate.SiteName, candidate.Published, candidate.Authority, summary)
	}
	return b.String()
}

var (
	// 模型常在文字里夹带 "([ithome.com](https://...))" 这样的引用标记
	citationPattern     = regexp.MustCompile(`\s*\(\[[^\]]*\]\([^)]*\)\)`)
	markdownLinkPattern = regexp.MustCompile(`\[([^\]]+)\]\([^)]*\)`)
)

func cleanNewsText(text string) string {
	text = citationPattern.ReplaceAllString(text, "")
	text = markdownLinkPattern.ReplaceAllString(text, "$1")
	return strings.TrimSpace(text)
}

// normalizeNewsURL 用于比较链接是否相同：忽略协议、www、查询参数和末尾斜杠。
func normalizeNewsURL(raw string) string {
	parsed, err := url.Parse(strings.TrimSpace(raw))
	if err != nil || parsed.Host == "" {
		return ""
	}
	host := strings.TrimPrefix(strings.ToLower(parsed.Hostname()), "www.")
	return host + strings.TrimRight(parsed.EscapedPath(), "/")
}

// normalizeNewsPublished 判断发布日期是否可以收录，目标日前后各放宽一天：海外媒体的日期和北京时间常差一天，
// 放宽带来的重复由前一天日报的链接去重挡住。日期缺失或无法解析时保留（论坛帖子常见），宁可多收不漏。
func normalizeNewsPublished(published string, day string) (string, bool) {
	published = strings.TrimSpace(published)
	if len(published) > 10 {
		published = published[:10]
	}
	date, err := time.Parse("2006-01-02", published)
	if err != nil {
		return "", true
	}
	target, err := time.Parse("2006-01-02", day)
	if err != nil {
		return published, true
	}
	if date.Before(target.AddDate(0, 0, -1)) || date.After(target.AddDate(0, 0, 1)) {
		return published, false
	}
	return published, true
}

// buildKeywordNewsItems 把模型的选择还原成新闻条目：链接和已知日期都以搜索结果为准。
func buildKeywordNewsItems(selections []keywordNewsSelection, candidates []keywordNewsCandidate) ([]KeywordNewsItem, int) {
	items := make([]KeywordNewsItem, 0, len(selections))
	dropped := 0
	for _, selection := range selections {
		if selection.Ref < 0 || selection.Ref >= len(candidates) {
			dropped++
			continue
		}
		candidate := candidates[selection.Ref]
		item := KeywordNewsItem{
			Title:     selection.Title,
			URL:       candidate.URL,
			Source:    selection.Source,
			Published: candidate.Published,
			Summary:   selection.Summary,
			Kind:      selection.Kind,
			Caution:   selection.Caution,
		}
		if strings.TrimSpace(item.Title) == "" {
			item.Title = candidate.Title
		}
		if strings.TrimSpace(item.Source) == "" {
			item.Source = candidate.SiteName
		}
		if item.Published == "" {
			item.Published = selection.Published
		}
		items = append(items, item)
	}
	return items, dropped
}

// filterKeywordNews 是模型输出之后的代码兜底：日期在收录范围内、不和前一天重复、同一链接只留一条。
func filterKeywordNews(items []KeywordNewsItem, day string, previous []KeywordNewsItem) ([]KeywordNewsItem, int) {
	excluded := map[string]bool{}
	for _, item := range previous {
		if key := normalizeNewsURL(item.URL); key != "" {
			excluded[key] = true
		}
	}
	result := make([]KeywordNewsItem, 0, len(items))
	dropped := 0
	for _, item := range items {
		item.Title = cleanNewsText(item.Title)
		item.URL = strings.TrimSpace(item.URL)
		item.Source = cleanNewsText(item.Source)
		item.Summary = cleanNewsText(item.Summary)
		item.Caution = cleanNewsText(item.Caution)
		published, inWindow := normalizeNewsPublished(item.Published, day)
		item.Published = published
		key := normalizeNewsURL(item.URL)
		switch {
		case item.Title == "" || key == "" || !strings.HasPrefix(item.URL, "http"):
		case !inWindow:
		case excluded[key]:
		case len(result) >= keywordNewsMaxItems:
		default:
			excluded[key] = true
			result = append(result, item)
			continue
		}
		dropped++
	}
	return result, dropped
}

func searchKeywordNews(ctx context.Context, newsAI keywordNewsAI, keyword string, day string, previous []KeywordNewsItem) KeywordNewsGroup {
	group := KeywordNewsGroup{Keyword: keyword, News: []KeywordNewsItem{}}
	results, err := newsAI.SearchWeb(ctx, backendshare.AIWebSearchRequest{
		Query:    buildKeywordNewsQuery(keyword, day),
		Count:    keywordNewsSearchCount,
		Question: keyword + " 的最新新闻、爆料、前瞻和论坛讨论",
	})
	if err != nil {
		group.Error = err.Error()
		keywordNewsWarn(errors.Join(fmt.Errorf("keyword news search %q failed", keyword), err))
		return group
	}
	candidates := selectKeywordCandidates(results, day, previous)
	if len(candidates) == 0 {
		keywordNewsInfo("keyword news %q: results=%d candidates=0", keyword, len(results))
		return group
	}

	ret, err := newsAI.Request(ctx, backendshare.AITextQueueRequest{
		Input:      buildKeywordNewsPrompt(keyword, day, candidates, previous),
		JSONSchema: keywordNewsSchema(),
	})
	if err != nil {
		group.Error = err.Error()
		keywordNewsWarn(errors.Join(fmt.Errorf("keyword news filter %q failed", keyword), err))
		return group
	}
	var parsed struct {
		Summary string                 `json:"summary"`
		Items   []keywordNewsSelection `json:"items"`
	}
	if err := json.Unmarshal([]byte(trimJSONEnvelope(ret.Text)), &parsed); err != nil {
		group.Error = "模型输出不是合法 JSON"
		keywordNewsWarn(errors.Join(fmt.Errorf("keyword news %q json error", keyword), err))
		return group
	}
	items, invalid := buildKeywordNewsItems(parsed.Items, candidates)
	news, dropped := filterKeywordNews(items, day, previous)
	group.News = news
	if len(news) > 0 {
		group.Summary = cleanNewsText(parsed.Summary)
	}

	usage := ret.Response.Usage
	keywordNewsInfo("keyword news %q: model=%s/%s results=%d candidates=%d input=%d(cached %d) output=%d items=%d dropped=%d",
		keyword, ret.ProviderID, ret.ModelID, len(results), len(candidates), usage.InputTokens, usage.CachedInputTokens, usage.OutputTokens, len(news), invalid+dropped)
	return group
}

// searchAllKeywordNews 并发搜索所有关键词，结果顺序与 keywords 一致；单个失败只影响它自己。
func searchAllKeywordNews(ctx context.Context, newsAI keywordNewsAI, keywords []string, day string, previous map[string][]KeywordNewsItem) []KeywordNewsGroup {
	groups := make([]KeywordNewsGroup, len(keywords))
	sem := make(chan struct{}, keywordNewsConcurrency)
	var wg sync.WaitGroup
	for i, keyword := range keywords {
		wg.Add(1)
		go func(i int, keyword string) {
			defer wg.Done()
			sem <- struct{}{}
			defer func() { <-sem }()
			callCtx, cancel := context.WithTimeout(ctx, keywordNewsTimeout)
			defer cancel()
			groups[i] = searchKeywordNews(callCtx, newsAI, keyword, day, previous[keyword])
		}(i, keyword)
	}
	wg.Wait()
	return groups
}

// activeNewsKeywords 去掉空白和以 #废弃 结尾的关键词。
func activeNewsKeywords(keywords []string) []string {
	result := make([]string, 0, len(keywords))
	for _, keyword := range keywords {
		keyword = strings.TrimSpace(keyword)
		if keyword == "" || keyword == "need input" || strings.HasSuffix(keyword, "#废弃") {
			continue
		}
		result = append(result, keyword)
	}
	return result
}

// buildKeywordBriefs 直接用搜索结果生成摘要里的关键词部分，不再额外调用 AI。
func buildKeywordBriefs(report *DayReport) []KeywordBrief {
	briefs := []KeywordBrief{}
	if report == nil {
		return briefs
	}
	for groupIndex, group := range report.KeywordNews {
		if strings.TrimSpace(group.Summary) == "" || len(group.News) == 0 {
			continue
		}
		refs := make([]string, 0, len(group.News))
		for itemIndex := range group.News {
			refs = append(refs, fmt.Sprintf("kw:%d:%d", groupIndex, itemIndex))
		}
		briefs = append(briefs, KeywordBrief{
			Keyword:    group.Keyword,
			Summary:    group.Summary,
			Count:      len(group.News),
			SourceRefs: refs,
		})
	}
	return briefs
}

func beijingLocation() *time.Location {
	loc, err := time.LoadLocation("Asia/Shanghai")
	if err != nil {
		return time.FixedZone("CST", 8*3600)
	}
	return loc
}

// 日志在单元测试里没有初始化，这里判空，避免测试 panic。
func keywordNewsWarn(err error) {
	if tool.GLog != nil {
		tool.GLog.WarningErr("auto.Day", err)
	}
}

func keywordNewsInfo(format string, args ...any) {
	if tool.GLog != nil {
		tool.GLog.Info("auto.Day", format, args...)
	}
}
