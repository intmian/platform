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
		GoogleNews: []struct {
			KeyWord string
			News    []spider.GoogleRssItem
		}{
			{
				KeyWord: "fsd",
				News: []spider.GoogleRssItem{
					{Title: "特斯拉 FSD 在中国面临诉讼", Link: "https://google.example/fsd/0", PubDate: pubDate},
					{Title: "特斯拉继续招聘智驾测试岗位", Link: "https://google.example/fsd/1", PubDate: pubDate},
				},
			},
		},
	}
}

func TestSourceRefExists(t *testing.T) {
	report := sampleDigestReport()
	validRefs := []string{"bbc:0", "nyt:1", "google:0:1"}
	for _, ref := range validRefs {
		if !sourceRefExists(report, ref) {
			t.Fatalf("expected ref %s to exist", ref)
		}
	}
	invalidRefs := []string{"bbc:9", "nyt:x", "google:0:9", "google:9:0", "google:fsd:0", "bad:0"}
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
			SourceRefs: []string{"nyt:1", "nyt:99", "google:0:1"},
		}},
		KeywordBriefs: []KeywordBrief{{
			Keyword:    "fsd",
			Summary:    "FSD 在中国同时面对诉讼和本地化测试推进。",
			Count:      2,
			SourceRefs: []string{"google:0:0", "google:0:9"},
		}},
		TopicBriefs: []TopicBrief{{
			Topic:      "科技",
			Summary:    "科技竞争相关报道集中。",
			SourceRefs: []string{"nyt:1", "google:0:0", "missing:0"},
		}},
		Coverage: []DigestCoverage{
			{Ref: "nyt:1", Topic: "科技", InPush: true, Importance: 5},
			{Ref: "google:0:99", Topic: "科技", InPush: false, Importance: 1},
		},
	}

	got := normalizeDayDigest(report, digest)
	if got == nil {
		t.Fatal("expected normalized digest")
	}
	if strings.Join(got.ImportantNews[0].SourceRefs, ",") != "nyt:1,google:0:1" {
		t.Fatalf("unexpected important refs: %#v", got.ImportantNews[0].SourceRefs)
	}
	if strings.Join(got.KeywordBriefs[0].SourceRefs, ",") != "google:0:0" {
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

	got := buildDailyPushMarkdown(report, "06月02日", "[点击查看日报](https://plat.intmian.com/day-report/2026-06-02)")
	if !strings.Contains(got, "日安，06月02日的播报") {
		t.Fatalf("push markdown should include title: %s", got)
	}
	if !strings.Contains(got, "多云，23-33℃") {
		t.Fatalf("push markdown should include push weather line: %s", got)
	}
	if !strings.Contains(got, "今日概览") || !strings.Contains(got, "推送短概览聚焦今日最重要变化。") {
		t.Fatalf("push markdown should include push overview: %s", got)
	}
	if !strings.Contains(got, "推送重要新闻：短摘要只保留推送需要的信息。") {
		t.Fatalf("push markdown should include push important news: %s", got)
	}
	if !strings.Contains(got, "FSD：推送关键词短摘要。") {
		t.Fatalf("push markdown should include push keyword brief: %s", got)
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

	got := buildDailyPushMarkdown(report, "06月02日", reportLink)
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
