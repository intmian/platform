package mods

import (
	"strings"
	"testing"
	"time"

	"github.com/intmian/mian_go_lib/tool/spider"
)

func sampleDigestReport() *DayReport {
	pubDate := time.Date(2026, 6, 1, 8, 0, 0, 0, time.UTC)
	return &DayReport{
		BbcNews: []spider.BBCRssItem{
			{Title: "澳门十岁男童致命交通意外", Description: "社会公愤与集体哀悼", Link: "https://bbc.example/0", PubDate: pubDate},
		},
		NytNews: []spider.NYTimesRssItem{
			{Title: "AI 正在取代科技从业者", Description: "科技行业裁员加速", Link: "https://nyt.example/0", PubDate: pubDate},
			{Title: "中国瞄准人工智能预测政治风险", Description: "预测性监控技术", Link: "https://nyt.example/1", PubDate: pubDate},
		},
		KeywordNews: []KeywordNewsGroup{
			{
				Keyword: "fsd",
				Summary: "特斯拉 FSD 在中国同时面对诉讼和本地化测试推进。",
				News: []KeywordNewsItem{
					{Title: "特斯拉 FSD 在中国面临诉讼", URL: "https://news.example/fsd/0", Published: "2026-06-01"},
					{Title: "特斯拉继续招聘智驾测试岗位", URL: "https://news.example/fsd/1", Published: "2026-06-01"},
				},
			},
		},
	}
}

func TestSourceRefExists(t *testing.T) {
	report := sampleDigestReport()
	validRefs := []string{"bbc:0", "nyt:1", "kw:0:1"}
	for _, ref := range validRefs {
		if !sourceRefExists(report, ref) {
			t.Fatalf("expected ref %s to exist", ref)
		}
	}
	invalidRefs := []string{"bbc:9", "nyt:x", "kw:0:9", "kw:9:0", "kw:fsd:0", "bad:0"}
	for _, ref := range invalidRefs {
		if sourceRefExists(report, ref) {
			t.Fatalf("expected ref %s to be invalid", ref)
		}
	}
}

func TestNormalizeDayDigestDropsInvalidRefsAndCoverage(t *testing.T) {
	report := sampleDigestReport()
	digest := &DayDigest{
		Overview: "今天的主线是国际安全和科技竞争。",
		ImportantNews: []DigestItem{{
			Title:      "科技竞争",
			Summary:    "AI、芯片和产业竞争成为重点。",
			Topic:      "科技",
			Importance: 5,
			SourceRefs: []string{"nyt:1", "nyt:99", "kw:0:1"},
		}},
		KeywordBriefs: []KeywordBrief{{
			Keyword:    "fsd",
			Summary:    "FSD 在中国同时面对诉讼和本地化测试推进。",
			Count:      2,
			SourceRefs: []string{"kw:0:0", "kw:0:9"},
		}},
		TopicBriefs: []TopicBrief{{
			Topic:      "科技",
			Summary:    "科技竞争相关报道集中。",
			SourceRefs: []string{"nyt:1", "kw:0:0", "missing:0"},
		}},
		Coverage: []DigestCoverage{
			{Ref: "nyt:1", Topic: "科技", InPush: true, Importance: 5},
			{Ref: "kw:0:99", Topic: "科技", InPush: false, Importance: 1},
		},
	}

	got := normalizeDayDigest(report, digest)
	if got == nil {
		t.Fatal("expected normalized digest")
	}
	if strings.Join(got.ImportantNews[0].SourceRefs, ",") != "nyt:1,kw:0:1" {
		t.Fatalf("unexpected important refs: %#v", got.ImportantNews[0].SourceRefs)
	}
	if strings.Join(got.KeywordBriefs[0].SourceRefs, ",") != "kw:0:0" {
		t.Fatalf("unexpected keyword refs: %#v", got.KeywordBriefs[0].SourceRefs)
	}
	if len(got.Coverage) != 1 || got.Coverage[0].Ref != "nyt:1" {
		t.Fatalf("unexpected coverage: %#v", got.Coverage)
	}
}

func TestBuildSummaryFromDigest(t *testing.T) {
	digest := &DayDigest{
		Overview: "今天的主线是国际安全升温和科技竞争。",
		ImportantNews: []DigestItem{{
			Title:   "国际安全",
			Summary: "中东和非洲安全新闻占比较高。",
		}},
		KeywordBriefs: []KeywordBrief{{
			Keyword: "FSD",
			Summary: "特斯拉在中国同时面对诉讼和本地化测试推进。",
		}},
	}

	got := buildSummaryFromDigest(digest)
	if !strings.Contains(got, "今日概览") {
		t.Fatalf("summary should include overview title: %s", got)
	}
	if !strings.Contains(got, "国际安全：中东和非洲安全新闻占比较高。") {
		t.Fatalf("summary should include important item: %s", got)
	}
	if !strings.Contains(got, "FSD：特斯拉在中国同时面对诉讼和本地化测试推进。") {
		t.Fatalf("summary should include keyword item: %s", got)
	}
}

func TestBuildDailyPushMarkdownUsesDigestPushBrief(t *testing.T) {
	report := sampleDigestReport()
	report.Summary = "这是一段旧版长摘要，推送不应包含它。"
	report.Digest = &DayDigest{
		PushBrief: DailyPushBrief{
			WeatherLine: "多云，23-33℃",
			Overview:    "推送短概览聚焦今日最重要变化。",
			ImportantNews: []DigestItem{{
				Title:   "推送重要新闻",
				Summary: "短摘要只保留推送需要的信息。",
			}},
			KeywordBriefs: []KeywordBrief{{
				Keyword: "FSD",
				Summary: "推送关键词短摘要。",
			}},
		},
		Overview: "完整 digest 概览不应进入推送。",
	}

	got := buildDailyPushMarkdown(report, "[查看完整日报 →](https://plat.intmian.com/day-report/2026-06-02?t=x)")
	if !strings.HasSuffix(got, "\n\n[查看完整日报 →](https://plat.intmian.com/day-report/2026-06-02?t=x)\n") {
		t.Fatalf("push markdown should end with the report link after a blank line: %q", got)
	}
	if !strings.Contains(got, "多云，23-33℃") {
		t.Fatalf("push markdown should include push weather line: %s", got)
	}
	if !strings.Contains(got, "今日概览") || !strings.Contains(got, "推送短概览聚焦今日最重要变化。") {
		t.Fatalf("push markdown should include push overview: %s", got)
	}
	if !strings.Contains(got, "- 推送重要新闻：短摘要只保留推送需要的信息。") {
		t.Fatalf("push markdown should include push important news: %s", got)
	}
	if !strings.Contains(got, "- FSD：推送关键词短摘要。") {
		t.Fatalf("push markdown should include push keyword brief: %s", got)
	}
	if strings.Contains(got, "\n推送重要新闻：") || strings.Contains(got, "\nFSD：") {
		t.Fatalf("push markdown list items should use markdown list syntax: %s", got)
	}
	if strings.Contains(got, report.Summary) {
		t.Fatalf("push markdown should not include legacy summary: %s", got)
	}
	if strings.Contains(got, "完整 digest 概览不应进入推送。") {
		t.Fatalf("push markdown should not include full digest overview: %s", got)
	}
}

func TestBuildDailyPushMarkdownMissingDigestUsesFallback(t *testing.T) {
	report := sampleDigestReport()
	report.Summary = "旧版长摘要不能作为缺失 digest 时的推送内容。"
	reportLink := "[点击查看日报](https://plat.intmian.com/day-report/2026-06-02)"

	got := buildDailyPushMarkdown(report, reportLink)
	if !strings.Contains(got, dayDigestFailureSummary) {
		t.Fatalf("push markdown should include deterministic digest failure text: %s", got)
	}
	if !strings.Contains(got, reportLink) {
		t.Fatalf("push markdown should include report link: %s", got)
	}
	if strings.Contains(got, report.Summary) {
		t.Fatalf("push markdown should not include legacy summary fallback: %s", got)
	}
}

func TestDailyPushTitle(t *testing.T) {
	got := dailyPushTitle(&DayReport{}, time.Date(2026, 11, 24, 6, 0, 0, 0, time.Local))
	if got != "日安～ 11月24日 周二" {
		t.Fatalf("unexpected title: %s", got)
	}
}

func TestGreetingTip(t *testing.T) {
	tue := time.Date(2026, 11, 24, 6, 0, 0, 0, time.Local)
	sat := time.Date(2026, 11, 28, 6, 0, 0, 0, time.Local)
	if got := greetingTip(nil, sat); got != "周末愉快～" {
		t.Fatalf("weekend tip: %s", got)
	}
	if got := greetingTip(nil, tue); got != "今天也要元气满满" {
		t.Fatalf("weekday tip: %s", got)
	}
	if got := weatherEmoji("小雨"); got != "🌧️" {
		t.Fatalf("rain emoji: %s", got)
	}
	if got := weatherEmoji("晴"); got != "☀️" {
		t.Fatalf("sunny emoji: %s", got)
	}
}

func TestReportShareToken(t *testing.T) {
	a := signReportDay("secret", "2026-11-24")
	if len(a) != reportShareTokenLen {
		t.Fatalf("token length %d", len(a))
	}
	if a == signReportDay("secret", "2026-11-25") || a == signReportDay("other", "2026-11-24") {
		t.Fatal("token should depend on day and secret")
	}
}
