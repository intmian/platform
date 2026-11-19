package mods

import (
	"context"
	"errors"
	"strings"
	"sync"
	"testing"

	backendshare "github.com/intmian/platform/backend/share"
)

type fakeKeywordAI struct {
	mu         sync.Mutex
	results    map[string][]backendshare.AIWebSearchResult
	searchErrs map[string]error
	replies    map[string]string
	modelErrs  map[string]error
	queries    []string
	prompts    []string
}

func (f *fakeKeywordAI) SearchWeb(_ context.Context, req backendshare.AIWebSearchRequest) ([]backendshare.AIWebSearchResult, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.queries = append(f.queries, req.Query)
	keyword, _, _ := strings.Cut(req.Query, " after:")
	if err := f.searchErrs[keyword]; err != nil {
		return nil, err
	}
	return f.results[keyword], nil
}

func (f *fakeKeywordAI) Request(_ context.Context, req backendshare.AITextQueueRequest) (backendshare.AITextQueueResponse, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.prompts = append(f.prompts, req.Input)
	var ret backendshare.AITextQueueResponse
	if req.JSONSchema == nil {
		return ret, errors.New("keyword filter must use a json schema")
	}
	for keyword, err := range f.modelErrs {
		if strings.Contains(req.Input, "「"+keyword+"」") {
			return ret, err
		}
	}
	for keyword, reply := range f.replies {
		if strings.Contains(req.Input, "「"+keyword+"」") {
			ret.Text = reply
			return ret, nil
		}
	}
	return ret, errors.New("unexpected keyword")
}

func TestFilterKeywordNews(t *testing.T) {
	day := "2026-11-17"
	items := []KeywordNewsItem{
		{Title: "正常", URL: "https://www.a.com/1/?utm=x", Published: day},
		{Title: "重复链接", URL: "https://a.com/1", Published: day},
		{Title: "日期太旧", URL: "https://b.com/2", Published: "2026-11-15"},
		{Title: "前一天报过", URL: "https://old.com/x", Published: day},
		{Title: "", URL: "https://c.com/3", Published: day},
	}
	got, dropped := filterKeywordNews(items, day, []KeywordNewsItem{{Title: "旧", URL: "https://old.com/x/"}})
	if len(got) != 1 || got[0].Title != "正常" || dropped != 4 {
		t.Fatalf("unexpected filter result: %+v dropped=%d", got, dropped)
	}
}

func TestBuildKeywordNewsQuery(t *testing.T) {
	got := buildKeywordNewsQuery("苹果眼镜", "2026-11-17")
	if got != "苹果眼镜 after:2026-11-16 before:2026-11-19" {
		t.Fatalf("unexpected query: %q", got)
	}
	long := buildKeywordNewsQuery(strings.Repeat("长", 200), "2026-11-17")
	if len([]rune(long)) > 128 {
		t.Fatalf("query is too long: %d", len([]rune(long)))
	}
}

func TestSelectKeywordCandidates(t *testing.T) {
	day := "2026-11-17"
	results := []backendshare.AIWebSearchResult{
		{Title: "UTC 前一天，北京时间在范围内", URL: "https://a.com/1", Date: "2026-11-15T17:00:00Z"},
		{Title: "太旧", URL: "https://a.com/2", Date: "2026-11-15T10:00:00Z"},
		{Title: "日期未知也保留", URL: "https://a.com/3"},
		{Title: "重复", URL: "https://www.a.com/1/?from=x", Date: "2026-11-17T00:00:00Z"},
		{Title: "前一天报过", URL: "https://old.com/x", Date: "2026-11-17T00:00:00Z"},
		{Title: "没有链接"},
	}
	got := selectKeywordCandidates(results, day, []KeywordNewsItem{{URL: "https://old.com/x"}})
	if len(got) != 2 || got[0].Published != "2026-11-16" || got[1].Title != "日期未知也保留" || got[1].Published != "" {
		t.Fatalf("unexpected candidates: %+v", got)
	}
}

func TestSearchAllKeywordNews(t *testing.T) {
	day := "2026-11-17"
	newsAI := &fakeKeywordAI{
		results: map[string][]backendshare.AIWebSearchResult{
			"gta6": {
				{Title: "GTA 6 preorders", URL: "https://a.com/gta", SiteName: "A", Date: "2026-11-17T02:00:00Z"},
				{Title: "no date", URL: "https://a.com/nodate", SiteName: "B"},
			},
			"ps6":  {{Title: "太旧", URL: "https://a.com/ps6", Date: "2026-11-10T00:00:00Z"}},
			"fail": {{Title: "x", URL: "https://a.com/fail", Date: "2026-11-17T00:00:00Z"}},
		},
		searchErrs: map[string]error{"fsd": errors.New("quota exceeded")},
		modelErrs:  map[string]error{"fail": errors.New("model down")},
		replies: map[string]string{"gta6": `{"summary":"GTA6 发售前热度持续。","items":[
			{"ref":0,"title":"GTA6 预售破纪录","source":"","published":"2020-01-01","kind":"新闻","caution":"","summary":"预售。"},
			{"ref":1,"title":"日期由模型补","source":"B 站","published":"2026-11-16","kind":"讨论","caution":"","summary":"讨论。"},
			{"ref":99,"title":"编造的编号","source":"F","published":"2026-11-17","kind":"新闻","caution":"","summary":"假。"}
		]}`},
	}
	previous := map[string][]KeywordNewsItem{"gta6": {{Title: "GTA6 昨天的新闻", URL: "https://a.com/old"}}}

	groups := searchAllKeywordNews(context.Background(), newsAI, []string{"gta6", "ps6", "fsd", "fail"}, day, previous)
	if len(groups) != 4 || groups[0].Keyword != "gta6" || groups[3].Keyword != "fail" {
		t.Fatalf("groups should keep keyword order: %+v", groups)
	}
	news := groups[0].News
	if len(news) != 2 || groups[0].Summary == "" {
		t.Fatalf("gta6 should keep two real items: %+v", groups[0])
	}
	if news[0].URL != "https://a.com/gta" || news[0].Published != "2026-11-17" || news[0].Source != "A" {
		t.Fatalf("url, date and source should come from the search result: %+v", news[0])
	}
	if news[1].Published != "2026-11-16" {
		t.Fatalf("model date should fill a missing search date: %+v", news[1])
	}
	if len(groups[1].News) != 0 || groups[1].Summary != "" || groups[1].Error != "" {
		t.Fatalf("ps6 should have no news and no error: %+v", groups[1])
	}
	if groups[2].Error == "" || groups[2].News == nil || groups[3].Error == "" {
		t.Fatalf("failures should be recorded per keyword: %+v %+v", groups[2], groups[3])
	}
	if len(newsAI.queries) != 4 {
		t.Fatalf("each keyword should search exactly once: %v", newsAI.queries)
	}
	if len(newsAI.prompts) != 2 {
		t.Fatalf("keywords without candidates should skip the model: %d prompts", len(newsAI.prompts))
	}
	foundPrevious := false
	for _, prompt := range newsAI.prompts {
		if strings.Contains(prompt, "「gta6」") && strings.Contains(prompt, "GTA6 昨天的新闻") && strings.Contains(prompt, day) {
			foundPrevious = true
		}
	}
	if !foundPrevious {
		t.Fatalf("gta6 prompt should include previous day titles and target day")
	}
}

func TestActiveNewsKeywords(t *testing.T) {
	got := activeNewsKeywords([]string{"gta6", " ", "iphone16#废弃", "xbox #已废弃", "need input", " ps6 "})
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

func TestCleanNewsText(t *testing.T) {
	got := cleanNewsText("黑客认罪。([ithome.com](https://www.ithome.com/1/028/285.htm?utm_source=openai)) 详见[原文](https://a.com)")
	if got != "黑客认罪。 详见原文" {
		t.Fatalf("unexpected cleaned text: %q", got)
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
