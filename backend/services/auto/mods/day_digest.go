package mods

import (
	"fmt"
	"strconv"
	"strings"
	"time"

	"github.com/intmian/mian_go_lib/tool/misc"
)

type DayDigest struct {
	PushBrief     DailyPushBrief   `json:"pushBrief"`
	Overview      string           `json:"overview"`
	ImportantNews []DigestItem     `json:"importantNews"`
	KeywordBriefs []KeywordBrief   `json:"keywordBriefs"`
	TopicBriefs   []TopicBrief     `json:"topicBriefs"`
	Coverage      []DigestCoverage `json:"coverage"`
}

type DailyPushBrief struct {
	WeatherLine   string         `json:"weatherLine"`
	Overview      string         `json:"overview"`
	ImportantNews []DigestItem   `json:"importantNews"`
	KeywordBriefs []KeywordBrief `json:"keywordBriefs"`
}

type DigestItem struct {
	Title      string   `json:"title"`
	Summary    string   `json:"summary"`
	Topic      string   `json:"topic"`
	Importance int      `json:"importance"`
	SourceRefs []string `json:"sourceRefs"`
}

type KeywordBrief struct {
	Keyword    string   `json:"keyword"`
	Summary    string   `json:"summary"`
	Count      int      `json:"count"`
	SourceRefs []string `json:"sourceRefs"`
}

type TopicBrief struct {
	Topic      string   `json:"topic"`
	Summary    string   `json:"summary"`
	SourceRefs []string `json:"sourceRefs"`
}

type DigestCoverage struct {
	Ref        string `json:"ref"`
	Topic      string `json:"topic"`
	InPush     bool   `json:"inPush"`
	Importance int    `json:"importance"`
}

func sourceRefExists(report *DayReport, ref string) bool {
	if report == nil {
		return false
	}
	parts := strings.Split(ref, ":")
	if len(parts) < 2 {
		return false
	}

	switch parts[0] {
	case "bbc":
		if len(parts) != 2 {
			return false
		}
		idx, err := strconv.Atoi(parts[1])
		return err == nil && idx >= 0 && idx < len(report.BbcNews)
	case "nyt":
		if len(parts) != 2 {
			return false
		}
		idx, err := strconv.Atoi(parts[1])
		return err == nil && idx >= 0 && idx < len(report.NytNews)
	case "kw":
		// kw:<关键词序号>:<新闻序号>，指向 KeywordNews。旧日报里的 google:x:y 只在前端兼容展示。
		if len(parts) != 3 {
			return false
		}
		groupIdx, groupErr := strconv.Atoi(parts[1])
		itemIdx, itemErr := strconv.Atoi(parts[2])
		return groupErr == nil &&
			itemErr == nil &&
			groupIdx >= 0 &&
			groupIdx < len(report.KeywordNews) &&
			itemIdx >= 0 &&
			itemIdx < len(report.KeywordNews[groupIdx].News)
	default:
		return false
	}
}

func normalizeDayDigest(report *DayReport, digest *DayDigest) *DayDigest {
	if digest == nil {
		return nil
	}

	digest.Overview = strings.TrimSpace(digest.Overview)
	digest.ImportantNews = normalizeDigestItems(report, digest.ImportantNews)
	digest.KeywordBriefs = normalizeKeywordBriefs(report, digest.KeywordBriefs)
	digest.TopicBriefs = normalizeTopicBriefs(report, digest.TopicBriefs)
	digest.Coverage = normalizeCoverage(report, digest.Coverage)
	digest.PushBrief.WeatherLine = strings.TrimSpace(digest.PushBrief.WeatherLine)
	digest.PushBrief.Overview = strings.TrimSpace(digest.PushBrief.Overview)
	digest.PushBrief.ImportantNews = normalizeDigestItems(report, digest.PushBrief.ImportantNews)
	digest.PushBrief.KeywordBriefs = normalizeKeywordBriefs(report, digest.PushBrief.KeywordBriefs)

	return digest
}

func normalizeDigestItems(report *DayReport, items []DigestItem) []DigestItem {
	result := make([]DigestItem, 0, len(items))
	for _, item := range items {
		item.Title = strings.TrimSpace(item.Title)
		item.Summary = strings.TrimSpace(item.Summary)
		item.Topic = strings.TrimSpace(item.Topic)
		item.SourceRefs = normalizeSourceRefs(report, item.SourceRefs)
		if item.Title == "" && item.Summary == "" {
			continue
		}
		result = append(result, item)
	}
	return result
}

func normalizeKeywordBriefs(report *DayReport, briefs []KeywordBrief) []KeywordBrief {
	result := make([]KeywordBrief, 0, len(briefs))
	for _, brief := range briefs {
		brief.Keyword = strings.TrimSpace(brief.Keyword)
		brief.Summary = strings.TrimSpace(brief.Summary)
		brief.SourceRefs = normalizeSourceRefs(report, brief.SourceRefs)
		if brief.Keyword == "" || brief.Summary == "" {
			continue
		}
		result = append(result, brief)
	}
	return result
}

func normalizeTopicBriefs(report *DayReport, briefs []TopicBrief) []TopicBrief {
	result := make([]TopicBrief, 0, len(briefs))
	for _, brief := range briefs {
		brief.Topic = strings.TrimSpace(brief.Topic)
		brief.Summary = strings.TrimSpace(brief.Summary)
		brief.SourceRefs = normalizeSourceRefs(report, brief.SourceRefs)
		if brief.Topic == "" || brief.Summary == "" {
			continue
		}
		result = append(result, brief)
	}
	return result
}

func normalizeCoverage(report *DayReport, coverage []DigestCoverage) []DigestCoverage {
	result := make([]DigestCoverage, 0, len(coverage))
	seen := map[string]bool{}
	for _, item := range coverage {
		item.Ref = strings.TrimSpace(item.Ref)
		item.Topic = strings.TrimSpace(item.Topic)
		if item.Ref == "" || seen[item.Ref] || !sourceRefExists(report, item.Ref) {
			continue
		}
		seen[item.Ref] = true
		result = append(result, item)
	}
	return result
}

func normalizeSourceRefs(report *DayReport, refs []string) []string {
	result := make([]string, 0, len(refs))
	seen := map[string]bool{}
	for _, ref := range refs {
		ref = strings.TrimSpace(ref)
		if ref == "" || seen[ref] || !sourceRefExists(report, ref) {
			continue
		}
		seen[ref] = true
		result = append(result, ref)
	}
	return result
}

func buildSummaryFromDigest(digest *DayDigest) string {
	if digest == nil {
		return ""
	}

	parts := []string{}
	if overview := strings.TrimSpace(digest.Overview); overview != "" {
		parts = append(parts, "今日概览\n"+overview)
	}
	if len(digest.ImportantNews) > 0 {
		lines := []string{"重要新闻"}
		for _, item := range digest.ImportantNews {
			title := strings.TrimSpace(item.Title)
			summary := strings.TrimSpace(item.Summary)
			switch {
			case title == "" && summary == "":
				continue
			case title == "":
				lines = append(lines, summary)
			case summary == "":
				lines = append(lines, title)
			default:
				lines = append(lines, fmt.Sprintf("%s：%s", title, summary))
			}
		}
		if len(lines) > 1 {
			parts = append(parts, strings.Join(lines, "\n"))
		}
	}
	if len(digest.KeywordBriefs) > 0 {
		lines := []string{"关注关键词"}
		for _, brief := range digest.KeywordBriefs {
			keyword := strings.TrimSpace(brief.Keyword)
			summary := strings.TrimSpace(brief.Summary)
			if keyword == "" || summary == "" {
				continue
			}
			lines = append(lines, fmt.Sprintf("%s：%s", keyword, summary))
		}
		if len(lines) > 1 {
			parts = append(parts, strings.Join(lines, "\n"))
		}
	}
	return strings.Join(parts, "\n")
}

func buildDailyPushMarkdown(report *DayReport, reportLink string) string {
	md := misc.MarkdownTool{}

	if report == nil || report.Digest == nil {
		md.AddContent(dayDigestFailureSummary)
		md.AddContent(reportLink)
		return md.ToStr()
	}

	pushBrief := report.Digest.PushBrief
	md.AddContent(pushWeatherLine(report, pushBrief.WeatherLine, greetingTip(report, time.Now())))

	md.AddTitle("今日概览", 3)
	if overview := strings.TrimSpace(pushBrief.Overview); overview != "" {
		md.AddContent(overview)
	} else {
		md.AddContent("今日概览生成失败，请打开完整日报查看。")
	}

	md.AddTitle("重要新闻", 3)
	importantNewsDone := false
	for _, item := range pushBrief.ImportantNews {
		line := formatDigestItemLine(item.Title, item.Summary)
		if line == "" {
			continue
		}
		md.AddList(line, 1)
		importantNewsDone = true
	}
	if !importantNewsDone {
		md.AddList("重要新闻生成失败，请打开完整日报查看。", 1)
	}

	md.AddTitle("关注关键词", 3)
	keywordBriefsDone := false
	for _, brief := range pushBrief.KeywordBriefs {
		keyword := strings.TrimSpace(brief.Keyword)
		summary := strings.TrimSpace(brief.Summary)
		if keyword == "" || summary == "" {
			continue
		}
		md.AddList(fmt.Sprintf("%s：%s", keyword, summary), 1)
		keywordBriefsDone = true
	}
	if !keywordBriefsDone {
		md.AddList(keywordPushFallback(report), 1)
	}

	// 空一行把链接和上面的列表隔开（列表后面直接跟文字会被当成列表的延续）
	md.AddMd("\n" + reportLink + "\n")
	return md.ToStr()
}

func formatDigestItemLine(title, summary string) string {
	title = strings.TrimSpace(title)
	summary = strings.TrimSpace(summary)
	switch {
	case title == "" && summary == "":
		return ""
	case title == "":
		return summary
	case summary == "":
		return title
	default:
		return fmt.Sprintf("%s：%s", title, summary)
	}
}

// keywordPushFallback 区分"搜索失败"和"确实没有新动态"。
func keywordPushFallback(report *DayReport) string {
	if report == nil || len(report.KeywordNews) == 0 {
		return "关注关键词暂无结果，请打开完整日报查看。"
	}
	failed := 0
	for _, group := range report.KeywordNews {
		if group.Error != "" {
			failed++
		}
	}
	if failed == len(report.KeywordNews) {
		return "关注关键词搜索失败，请打开完整日报查看。"
	}
	return "关注关键词今日无新动态。"
}

// pushWeatherLine 是推送正文第一行：天气图标 + 天气 + 问候，例如"☀️ 晴，4-14℃ · 早晚温差大，带件外套"。
func pushWeatherLine(report *DayReport, weatherLine, tip string) string {
	weatherLine = strings.TrimSpace(weatherLine)
	if weatherLine == "" {
		return tip
	}
	line := weatherLine
	if len(report.Weather.Daily) > 0 {
		line = weatherEmoji(report.Weather.Daily[0].TextDay) + " " + line
	}
	if tip != "" {
		line += " · " + tip
	}
	return line
}
