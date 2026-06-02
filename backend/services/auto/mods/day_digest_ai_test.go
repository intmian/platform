package mods

import (
	"encoding/json"
	"errors"
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

func validDigestJSON() string {
	return `{
		"pushBrief": {
			"weatherLine": "",
			"overview": "今天的主线是国际安全升温、中国相关科技竞争、美国制度争议。",
			"importantNews": [
				{"title":"科技竞争","summary":"AI、芯片和生物医药竞争成为重点。","topic":"科技","importance":5,"sourceRefs":["nyt:1"]}
			],
			"keywordBriefs": [
				{"keyword":"FSD","summary":"特斯拉在中国同时面对诉讼和本地化测试推进。","count":2,"sourceRefs":["google:0:0","google:0:1"]}
			]
		},
		"overview": "今天的主线是国际安全升温、中国相关科技竞争、美国制度争议。",
		"importantNews": [
			{"title":"科技竞争","summary":"AI、芯片和生物医药竞争成为重点。","topic":"科技","importance":5,"sourceRefs":["nyt:1"]}
		],
		"keywordBriefs": [
			{"keyword":"FSD","summary":"特斯拉在中国同时面对诉讼和本地化测试推进。","count":2,"sourceRefs":["google:0:0","google:0:1"]}
		],
		"topicBriefs": [
			{"topic":"科技","summary":"科技竞争相关报道集中。","sourceRefs":["nyt:1","google:0:0"]}
		],
		"coverage": [
			{"ref":"bbc:0","topic":"社会","inPush":false,"importance":3},
			{"ref":"nyt:0","topic":"美国","inPush":false,"importance":3},
			{"ref":"nyt:1","topic":"科技","inPush":true,"importance":5},
			{"ref":"google:0:0","topic":"FSD","inPush":true,"importance":4},
			{"ref":"google:0:1","topic":"FSD","inPush":true,"importance":3}
		]
	}`
}

func TestGenerateDayDigestParsesJSON(t *testing.T) {
	report := sampleDigestReport()
	chat := &fakeDigestChat{replies: []string{validDigestJSON()}}
	got, err := generateDayDigest(report, chat)
	if err != nil {
		t.Fatalf("generateDayDigest error = %v", err)
	}
	if got == nil || got.Overview == "" {
		t.Fatalf("expected digest overview")
	}
	if got.KeywordBriefs[0].Keyword != "FSD" {
		t.Fatalf("unexpected keyword brief: %#v", got.KeywordBriefs)
	}
	if !strings.Contains(chat.prompts[0], "500-800") {
		t.Fatalf("prompt should include push budget, got: %s", chat.prompts[0])
	}
}

func TestGenerateDayDigestPromptIncludesWeatherLine(t *testing.T) {
	report := sampleDigestReport()
	setDigestTestWeather(t, report)
	chat := &fakeDigestChat{replies: []string{validDigestJSONWithWeatherLine("多云，23-33℃")}}

	if _, err := generateDayDigest(report, chat); err != nil {
		t.Fatalf("generateDayDigest error = %v", err)
	}
	if !strings.Contains(chat.prompts[0], `"weatherLine": "多云，23-33℃"`) {
		t.Fatalf("prompt should include deterministic weather line, got: %s", chat.prompts[0])
	}
	if strings.Contains(chat.prompts[0], "杭州") {
		t.Fatalf("prompt weather line should not invent city, got: %s", chat.prompts[0])
	}
}

func TestGenerateDayDigestAllowsEmptyKeywordBriefsWithoutGoogleNews(t *testing.T) {
	report := sampleDigestReport()
	report.GoogleNews = nil

	got, err := parseAndValidateDayDigest(report, `{
		"pushBrief": {
			"overview": "今天的主线是社会事件和科技竞争。",
			"importantNews": [
				{"title":"社会事件","summary":"BBC 报道社会事件后续。","topic":"社会","importance":4,"sourceRefs":["bbc:0"]}
			],
			"keywordBriefs": []
		},
		"overview": "今天的主线是社会事件和科技竞争。",
		"importantNews": [
			{"title":"社会事件","summary":"BBC 报道社会事件后续。","topic":"社会","importance":4,"sourceRefs":["bbc:0"]},
			{"title":"科技竞争","summary":"NYT 报道科技行业趋势。","topic":"科技","importance":5,"sourceRefs":["nyt:1"]}
		],
		"keywordBriefs": [],
		"topicBriefs": [
			{"topic":"社会","summary":"社会事件相关报道。","sourceRefs":["bbc:0"]},
			{"topic":"科技","summary":"科技竞争相关报道。","sourceRefs":["nyt:1"]}
		],
		"coverage": [
			{"ref":"bbc:0","topic":"社会","inPush":true,"importance":4},
			{"ref":"nyt:1","topic":"科技","inPush":true,"importance":5}
		]
	}`)
	if err != nil {
		t.Fatalf("parseAndValidateDayDigest error = %v", err)
	}
	if got == nil || len(got.KeywordBriefs) != 0 {
		t.Fatalf("expected digest with empty keyword briefs, got %#v", got)
	}
}

func TestGenerateDayDigestRepairsInvalidFirstReply(t *testing.T) {
	report := sampleDigestReport()
	chat := &fakeDigestChat{replies: []string{"not-json", validDigestJSON()}}
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

func TestGenerateDayDigestRepairsEmptyPushBrief(t *testing.T) {
	report := sampleDigestReport()
	chat := &fakeDigestChat{replies: []string{validDigestJSONWithEmptyPushBrief(), validDigestJSON()}}

	got, err := generateDayDigest(report, chat)
	if err != nil {
		t.Fatalf("generateDayDigest error = %v", err)
	}
	if got == nil {
		t.Fatal("expected repaired digest")
	}
	if chat.calls != 2 {
		t.Fatalf("expected empty push brief to trigger repair, calls=%d", chat.calls)
	}
	if got.PushBrief.Overview == "" || len(got.PushBrief.ImportantNews) == 0 {
		t.Fatalf("expected repaired push brief, got %#v", got.PushBrief)
	}
}

func TestGenerateDayDigestRepairsInventedWeatherLineWhenInputEmpty(t *testing.T) {
	report := sampleDigestReport()
	chat := &fakeDigestChat{replies: []string{validDigestJSONWithWeatherLine("多云，23-33℃"), validDigestJSON()}}

	got, err := generateDayDigest(report, chat)
	if err != nil {
		t.Fatalf("generateDayDigest error = %v", err)
	}
	if got == nil {
		t.Fatal("expected repaired digest")
	}
	if chat.calls != 2 {
		t.Fatalf("expected invented weather line to trigger repair, calls=%d", chat.calls)
	}
	if got.PushBrief.WeatherLine != "" {
		t.Fatalf("expected repaired weather line to stay empty, got %q", got.PushBrief.WeatherLine)
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

func setDigestTestWeather(t *testing.T, report *DayReport) {
	t.Helper()
	if err := json.Unmarshal([]byte(`{"daily":[{"textDay":"多云","tempMin":"23","tempMax":"33"}]}`), &report.Weather); err != nil {
		t.Fatalf("json.Unmarshal weather error = %v", err)
	}
}

func validDigestJSONWithEmptyPushBrief() string {
	return strings.Replace(validDigestJSON(), `"pushBrief": {
			"weatherLine": "",
			"overview": "今天的主线是国际安全升温、中国相关科技竞争、美国制度争议。",
			"importantNews": [
				{"title":"科技竞争","summary":"AI、芯片和生物医药竞争成为重点。","topic":"科技","importance":5,"sourceRefs":["nyt:1"]}
			],
			"keywordBriefs": [
				{"keyword":"FSD","summary":"特斯拉在中国同时面对诉讼和本地化测试推进。","count":2,"sourceRefs":["google:0:0","google:0:1"]}
			]
		}`, `"pushBrief": {
			"weatherLine": "",
			"overview": "",
			"importantNews": [],
			"keywordBriefs": []
		}`, 1)
}

func validDigestJSONWithWeatherLine(weatherLine string) string {
	return strings.Replace(validDigestJSON(), `"weatherLine": ""`, `"weatherLine": "`+weatherLine+`"`, 1)
}
