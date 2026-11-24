package mods

import (
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"testing"

	"github.com/intmian/platform/backend/services/auto/setting"
)

type fakeDigestChat struct {
	replies []string
	errs    []error
	calls   int
	prompts []string
}

func (f *fakeDigestChat) Chat(prompt string) (string, error) {
	f.prompts = append(f.prompts, prompt)
	idx := f.calls
	f.calls++
	if idx < len(f.errs) && f.errs[idx] != nil {
		return "", f.errs[idx]
	}
	if idx < len(f.replies) {
		return f.replies[idx], nil
	}
	return "", errors.New("unexpected chat call")
}

func validPublicDigestJSON() string {
	return `{
		"overview": "AI 正加速取代科技岗位，行业裁员仍在扩大；与此同时，中国正尝试用人工智能预测政治风险。",
		"news": [
			{"title":"AI 加速取代科技岗位","summary":"科技行业裁员加速。","refs":["nyt:0"]},
			{"title":"中国用 AI 预测政治风险","summary":"预测性监控技术受到关注。","refs":["nyt:1"]}
		]
	}`
}

func TestGenerateDayDigestParsesJSON(t *testing.T) {
	report := sampleDigestReport()
	chat := &fakeDigestChat{replies: []string{validPublicDigestJSON()}}
	got, err := generateDayDigest(report, chat)
	if err != nil {
		t.Fatalf("generateDayDigest error = %v", err)
	}
	if got.Overview == "" || got.PushBrief.Overview != got.Overview {
		t.Fatalf("page and push should share one overview: %q vs %q", got.Overview, got.PushBrief.Overview)
	}
	if len(got.ImportantNews) != 2 || len(got.PushBrief.ImportantNews) != 2 || got.ImportantNews[0].SourceRefs[0] != "nyt:0" {
		t.Fatalf("unexpected news: %#v / %#v", got.ImportantNews, got.PushBrief.ImportantNews)
	}
	if strings.Contains(strings.ToLower(chat.prompts[0]), "fsd") {
		t.Fatalf("public prompt should not include keyword news, got: %s", chat.prompts[0])
	}
	if chat.calls != 1 {
		t.Fatalf("keyword briefs should come from search results without extra chat calls, calls=%d", chat.calls)
	}
	if len(got.KeywordBriefs) != 1 || got.KeywordBriefs[0].Keyword != "fsd" || len(got.KeywordBriefs[0].SourceRefs) != 2 {
		t.Fatalf("unexpected keyword briefs: %#v", got.KeywordBriefs)
	}
	if len(got.PushBrief.KeywordBriefs) != 1 {
		t.Fatalf("push brief should carry keyword briefs: %#v", got.PushBrief.KeywordBriefs)
	}
}

func TestGenerateDayDigestPushTakesTopNews(t *testing.T) {
	report := sampleDigestReport()
	items := []string{}
	for i := 0; i < 8; i++ {
		items = append(items, fmt.Sprintf(`{"title":"新闻%d","summary":"细节","refs":["nyt:%d"]}`, i, i%2))
	}
	reply := `{"overview":"概要","news":[` + strings.Join(items, ",") + `]}`

	got, err := generateDayDigest(report, &fakeDigestChat{replies: []string{reply}})
	if err != nil {
		t.Fatalf("generateDayDigest error = %v", err)
	}
	if len(got.ImportantNews) != 8 || len(got.PushBrief.ImportantNews) != dayPushNewsCount || got.PushBrief.ImportantNews[0].Title != "新闻0" {
		t.Fatalf("push should take the first %d of %d news, got %d", dayPushNewsCount, len(got.ImportantNews), len(got.PushBrief.ImportantNews))
	}
}

func TestGenerateDayDigestWeatherLineFromReport(t *testing.T) {
	report := sampleDigestReport()
	if err := json.Unmarshal([]byte(`{"daily":[{"textDay":"多云","tempMin":"23","tempMax":"33"}]}`), &report.Weather); err != nil {
		t.Fatalf("json.Unmarshal weather error = %v", err)
	}
	chat := &fakeDigestChat{replies: []string{validPublicDigestJSON()}}

	got, err := generateDayDigest(report, chat)
	if err != nil {
		t.Fatalf("generateDayDigest error = %v", err)
	}
	if got.PushBrief.WeatherLine != "多云，23-33℃" {
		t.Fatalf("weather line should come from report, got %q", got.PushBrief.WeatherLine)
	}
	if strings.Contains(chat.prompts[0], "多云") {
		t.Fatalf("weather should not be sent to the AI, got: %s", chat.prompts[0])
	}
}

func TestGenerateDayDigestDropsInvalidRefs(t *testing.T) {
	report := sampleDigestReport()
	got, err := parseAndValidateDayDigest(report, `{"overview":"概要","news":[{"title":"t","summary":"s","refs":["nyt:1","nyt:9","bbc:0"]}]}`)
	if err != nil {
		t.Fatalf("parseAndValidateDayDigest error = %v", err)
	}
	refs := got.ImportantNews[0].SourceRefs
	if len(refs) != 2 || refs[0] != "nyt:1" || refs[1] != "bbc:0" {
		t.Fatalf("unexpected refs: %#v", refs)
	}
}

func TestGenerateDayDigestRepairsInvalidFirstReply(t *testing.T) {
	report := sampleDigestReport()
	chat := &fakeDigestChat{replies: []string{"not-json", validPublicDigestJSON()}}
	got, err := generateDayDigest(report, chat)
	if err != nil {
		t.Fatalf("generateDayDigest error = %v", err)
	}
	if got == nil || chat.calls != 2 {
		t.Fatalf("expected repaired digest after two calls, calls=%d", chat.calls)
	}
	if !strings.Contains(chat.prompts[1], "修复") {
		t.Fatalf("second prompt should be repair prompt: %s", chat.prompts[1])
	}
}

func TestGenerateDayDigestRepairsKeywordRefsInNews(t *testing.T) {
	report := sampleDigestReport()
	bad := strings.Replace(validPublicDigestJSON(), `"refs":["nyt:0"]`, `"refs":["nyt:0","kw:0:0"]`, 1)
	chat := &fakeDigestChat{replies: []string{bad, validPublicDigestJSON()}}

	if _, err := generateDayDigest(report, chat); err != nil {
		t.Fatalf("generateDayDigest error = %v", err)
	}
	if chat.calls != 2 {
		t.Fatalf("expected keyword ref in news to trigger repair, calls=%d", chat.calls)
	}
}

func TestGenerateDayDigestRepairsEmptyOverview(t *testing.T) {
	report := sampleDigestReport()
	empty := `{"overview":"","news":[{"title":"t","summary":"s","refs":["nyt:0"]}]}`
	chat := &fakeDigestChat{replies: []string{empty, validPublicDigestJSON()}}

	got, err := generateDayDigest(report, chat)
	if err != nil {
		t.Fatalf("generateDayDigest error = %v", err)
	}
	if chat.calls != 2 || got.PushBrief.Overview == "" {
		t.Fatalf("expected empty overview to trigger repair, calls=%d", chat.calls)
	}
}

func TestGenerateDayDigestFailsAfterTwoInvalidReplies(t *testing.T) {
	report := sampleDigestReport()
	chat := &fakeDigestChat{replies: []string{"not-json", "{}"}}
	got, err := generateDayDigest(report, chat)
	if err == nil {
		t.Fatalf("expected error")
	}
	if got != nil {
		t.Fatalf("expected nil digest on failed generation")
	}
}

func TestGenerateDayDigestSummarySetupFailureSetsFallback(t *testing.T) {
	oldCfg := setting.GCfg
	setting.GCfg = nil
	defer func() {
		setting.GCfg = oldCfg
	}()

	report := sampleDigestReport()
	report.Digest = &DayDigest{Overview: "stale digest"}
	report.Summary = "stale summary"

	err := summary(report)
	if err == nil {
		t.Fatalf("expected summary setup error")
	}
	if report.Digest != nil {
		t.Fatalf("expected digest fallback nil, got %#v", report.Digest)
	}
	if report.Summary != dayDigestFailureSummary {
		t.Fatalf("expected deterministic failure summary, got %q", report.Summary)
	}
}
