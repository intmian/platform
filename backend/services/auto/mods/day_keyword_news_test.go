package mods

import (
	"context"
	"errors"
	"strings"
	"sync"
	"testing"

	ai "github.com/intmian/mian_go_lib/tool/ai/v2"
	backendshare "github.com/intmian/platform/backend/share"
)

type fakeKeywordSearcher struct {
	mu      sync.Mutex
	replies map[string]backendshare.AITextQueueResponse
	errs    map[string]error
	prompts []string
}

func (f *fakeKeywordSearcher) Request(_ context.Context, req backendshare.AITextQueueRequest) (backendshare.AITextQueueResponse, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.prompts = append(f.prompts, req.Input)
	if !req.RequireWebSearch || req.JSONSchema == nil {
		return backendshare.AITextQueueResponse{}, errors.New("keyword search must require web search and json schema")
	}
	for keyword, err := range f.errs {
		if strings.Contains(req.Input, "「"+keyword+"」") {
			return backendshare.AITextQueueResponse{}, err
		}
	}
	for keyword, reply := range f.replies {
		if strings.Contains(req.Input, "「"+keyword+"」") {
			return reply, nil
		}
	}
	return backendshare.AITextQueueResponse{}, errors.New("unexpected keyword")
}

func searchReply(text string, sources ...string) backendshare.AITextQueueResponse {
	var ret backendshare.AITextQueueResponse
	ret.Text = text
	ret.Response = ai.ChatResponse{WebSearches: []ai.ChatWebSearch{{Action: "search", Sources: sources}}}
	return ret
}

func TestFilterKeywordNews(t *testing.T) {
	day := "2026-11-17"
	searched := map[string]bool{
		normalizeNewsURL("https://a.com/1"):   true,
		normalizeNewsURL("https://b.com/2"):   true,
		normalizeNewsURL("https://c.com/3"):   true,
		normalizeNewsURL("https://old.com/x"): true,
	}
	items := []KeywordNewsItem{
		{Title: "正常", URL: "https://www.a.com/1/?utm=x", Published: day},
		{Title: "重复链接", URL: "https://a.com/1", Published: day},
		{Title: "日期太旧", URL: "https://b.com/2", Published: "2026-11-15"},
		{Title: "没被搜到", URL: "https://fake.com/9", Published: day},
		{Title: "前一天报过", URL: "https://old.com/x", Published: day},
		{Title: "", URL: "https://c.com/3", Published: day},
	}
	got, dropped := filterKeywordNews(items, day, searched, []KeywordNewsItem{{Title: "旧", URL: "https://old.com/x/"}})
	if len(got) != 1 || got[0].Title != "正常" || dropped != 5 {
		t.Fatalf("unexpected filter result: %+v dropped=%d", got, dropped)
	}

	// 拿不到搜索来源时（例如中转不返回）不做"是否被搜到"的校验
	got, _ = filterKeywordNews([]KeywordNewsItem{{Title: "x", URL: "https://fake.com/9", Published: day}}, day, map[string]bool{}, nil)
	if len(got) != 1 {
		t.Fatalf("expected item kept without source info, got %+v", got)
	}
}

func TestSearchAllKeywordNews(t *testing.T) {
	day := "2026-11-17"
	searcher := &fakeKeywordSearcher{
		replies: map[string]backendshare.AITextQueueResponse{
			"gta6": searchReply(`{"summary":"GTA6 发售前热度持续。","items":[
				{"title":"GTA6 预售破纪录","url":"https://a.com/gta","source":"A","published":"2026-11-17","summary":"预售。"},
				{"title":"编造的","url":"https://fake.com/x","source":"F","published":"2026-11-17","summary":"假。"}
			]}`, "https://a.com/gta"),
			"ps6": searchReply(`{"summary":"只有不合格的条目。","items":[
				{"title":"旧闻","url":"https://a.com/ps6","source":"A","published":"2026-11-10","summary":"旧。"}
			]}`, "https://a.com/ps6"),
		},
		errs: map[string]error{"fsd": errors.New("quota exceeded")},
	}
	previous := map[string][]KeywordNewsItem{"gta6": {{Title: "GTA6 昨天的新闻", URL: "https://a.com/old"}}}

	groups := searchAllKeywordNews(context.Background(), searcher, []string{"gta6", "ps6", "fsd"}, day, previous)
	if len(groups) != 3 || groups[0].Keyword != "gta6" || groups[1].Keyword != "ps6" || groups[2].Keyword != "fsd" {
		t.Fatalf("groups should keep keyword order: %+v", groups)
	}
	if len(groups[0].News) != 1 || groups[0].Summary == "" {
		t.Fatalf("gta6 should keep one real item with summary: %+v", groups[0])
	}
	if len(groups[1].News) != 0 || groups[1].Summary != "" {
		t.Fatalf("ps6 summary should be cleared when no item survives: %+v", groups[1])
	}
	if groups[2].Error == "" || groups[2].News == nil {
		t.Fatalf("fsd failure should be recorded without affecting others: %+v", groups[2])
	}
	foundPrevious := false
	for _, prompt := range searcher.prompts {
		if strings.Contains(prompt, "「gta6」") && strings.Contains(prompt, "GTA6 昨天的新闻") && strings.Contains(prompt, day) {
			foundPrevious = true
		}
	}
	if !foundPrevious {
		t.Fatalf("gta6 prompt should include previous day titles and target day")
	}
}

func TestActiveNewsKeywords(t *testing.T) {
	got := activeNewsKeywords([]string{"gta6", " ", "iphone16#废弃", "need input", " ps6 "})
	if strings.Join(got, ",") != "gta6,ps6" {
		t.Fatalf("unexpected keywords: %v", got)
	}
}

func TestKeywordPushFallback(t *testing.T) {
	report := &DayReport{KeywordNews: []KeywordNewsGroup{{Keyword: "a", Error: "x"}, {Keyword: "b", Error: "y"}}}
	if got := keywordPushFallback(report); !strings.Contains(got, "失败") {
		t.Fatalf("all failed should say failed: %s", got)
	}
	report.KeywordNews[1].Error = ""
	if got := keywordPushFallback(report); !strings.Contains(got, "无新动态") {
		t.Fatalf("partial results should say no news: %s", got)
	}
}

func TestCleanNewsTextAndURL(t *testing.T) {
	got := cleanNewsText("黑客认罪。([ithome.com](https://www.ithome.com/1/028/285.htm?utm_source=openai)) 详见[原文](https://a.com)")
	if got != "黑客认罪。 详见原文" {
		t.Fatalf("unexpected cleaned text: %q", got)
	}
	if got := cleanNewsURL("https://a.com/x?id=1&utm_source=openai"); got != "https://a.com/x?id=1" {
		t.Fatalf("unexpected cleaned url: %q", got)
	}
	if got := cleanNewsURL("https://a.com/x?utm_source=rss"); got != "https://a.com/x?utm_source=rss" {
		t.Fatalf("non-openai utm should be kept: %q", got)
	}
}

func TestNormalizeNewsPublished(t *testing.T) {
	day := "2026-11-17"
	cases := []struct {
		input string
		want  string
		keep  bool
	}{
		{"2026-11-17", "2026-11-17", true},
		{"2026-11-16", "2026-11-16", true},
		{"2026-11-18T01:00:00Z", "2026-11-18", true},
		{"", "", true},
		{"昨天", "", true},
		{"2026-11-15", "2026-11-15", false},
		{"2026-11-19", "2026-11-19", false},
	}
	for _, c := range cases {
		got, keep := normalizeNewsPublished(c.input, day)
		if got != c.want || keep != c.keep {
			t.Errorf("normalizeNewsPublished(%q) = %q, %v; want %q, %v", c.input, got, keep, c.want, c.keep)
		}
	}
}
