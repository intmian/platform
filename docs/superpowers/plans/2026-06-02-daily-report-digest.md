# 日报摘要阅读流 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将每日新闻从单一长 `Summary` 改成结构化 `DayDigest`，让推送成为 500-800 字中等密度晨报，让页面顶部成为主题地图和关键词雷达，同时保留原始新闻列表。

**Architecture:** 后端 `auto/mods` 仍拥有日报生成、AI 摘要、存储和推送；新增聚焦的 digest 类型、校验、prompt、Markdown 渲染函数。前端只增量替换 `/day-report/:date` 顶部摘要区，旧日报继续走 `SummaryCard` fallback，原始 BBC/NYT/Google 列表不变。

**Tech Stack:** Go, `xstorage`, existing `tool/ai.OpenAI`, existing `misc.MarkdownTool`, React 18, TypeScript, Ant Design, Vite.

---

## Scope Check

本 spec 覆盖一个完整垂直切片：后端生成结构化摘要、推送使用结构化摘要、前端展示结构化阅读控制台。它跨后端和前端，但不是多个独立子系统；每个任务都能独立测试并提交。

## File Structure

- Modify: `backend/services/auto/mods/day.go`
  - 在 `DayReport` 增加可选 `Digest`。
  - 将 `summary(report)` 改为结构化 digest 生成入口。
  - 将 `Do()` 推送改为调用 digest Markdown 渲染函数。
- Create: `backend/services/auto/mods/day_digest.go`
  - 保存 `DayDigest` 数据结构、source ref 校验、digest 规范化、fallback 文本、推送 Markdown 生成。
- Create: `backend/services/auto/mods/day_digest_ai.go`
  - 保存 AI 输入模型、prompt 构造、JSON 解析、一次修复重试。
- Create: `backend/services/auto/mods/day_digest_test.go`
  - 覆盖 digest 校验、source ref、fallback summary、推送渲染。
- Create: `backend/services/auto/mods/day_digest_ai_test.go`
  - 使用 fake chat 覆盖 AI JSON 成功、首轮失败后修复成功、两轮失败。
- Modify: `frontend/src/common/newSendHttp.ts`
  - 增加 `DayDigest`、`DailyPushBrief`、`DigestItem`、`KeywordBrief`、`TopicBrief`、`DigestCoverage` 类型。
  - 在 `DayReport` 增加 `Summary?: string` 和 `digest?: DayDigest`。
- Create: `frontend/src/report/reportDigest.tsx`
  - 新增 `DigestConsole`，负责今日主线、重要主题、关键词雷达和 source ref 展开。
- Modify: `frontend/src/report/reportShow.tsx`
  - 引入 `DigestConsole`。
  - 有 digest 时渲染阅读控制台；没有 digest 时保持 `SummaryCard`。
- Modify: `ai-doc/backend/auto.md`
  - 记录新稳定事实：日报新增可选结构化 digest，推送成功时使用 `PushBrief`，旧 `Summary` 仍为 fallback。

---

### Task 1: 后端 Digest 类型、source ref 和纯函数校验

**Files:**
- Modify: `backend/services/auto/mods/day.go`
- Create: `backend/services/auto/mods/day_digest.go`
- Create: `backend/services/auto/mods/day_digest_test.go`

- [ ] **Step 1: 写失败测试**

Create `backend/services/auto/mods/day_digest_test.go`:

```go
package mods

import (
	"strings"
	"testing"

	"github.com/intmian/mian_go_lib/tool/spider"
)

func sampleDigestReport() *DayReport {
	return &DayReport{
		BbcNews: []spider.BBCRssItem{
			{Title: "澳门十岁男童致命交通意外", Description: "社会公愤与集体哀悼", Link: "https://bbc.example/0", PubDate: "2026-06-01T07:51:14Z"},
		},
		NytNews: []spider.NYTimesRssItem{
			{Title: "AI 正在取代科技从业者", Description: "科技行业裁员加速", Link: "https://nyt.example/0", PubDate: "2026-06-01T14:14:27Z"},
			{Title: "中国瞄准人工智能预测政治风险", Description: "预测性监控技术", Link: "https://nyt.example/1", PubDate: "2026-06-01T14:13:40Z"},
		},
		GoogleNews: []struct {
			KeyWord string
			News    []spider.GoogleRssItem
		}{
			{
				KeyWord: "fsd",
				News: []spider.GoogleRssItem{
					{Title: "特斯拉 FSD 在中国面临诉讼", Link: "https://google.example/fsd/0", PubDate: "2026-06-01T14:46:28Z"},
					{Title: "特斯拉继续招聘智驾测试岗位", Link: "https://google.example/fsd/1", PubDate: "2026-06-01T08:51:07Z"},
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
```

- [ ] **Step 2: 运行测试确认失败**

Run:

```powershell
Set-Location C:\GITHUB\platform\backend
go test ./services/auto/mods -run "TestSourceRefExists|TestNormalizeDayDigestDropsInvalidRefsAndCoverage|TestBuildSummaryFromDigest" -count=1
```

Expected: FAIL because `DayDigest`, `sourceRefExists`, `normalizeDayDigest`, and `buildSummaryFromDigest` are not defined.

- [ ] **Step 3: 增加后端 digest 类型和纯函数**

Modify `backend/services/auto/mods/day.go`:

```go
// DayReport 用于存储一天的日报.
type DayReport struct {
	Weather      spider.WeatherReturn
	WeatherIndex spider.IndexReturn
	Summary      string
	Digest       *DayDigest `json:"digest,omitempty"`
	BbcNews      []spider.BBCRssItem
	NytNews      []spider.NYTimesRssItem
	GoogleNews   []struct {
		KeyWord string
		News    []spider.GoogleRssItem
	}
}
```

Create `backend/services/auto/mods/day_digest.go`:

```go
package mods

import (
	"fmt"
	"strconv"
	"strings"
)

type DayDigest struct {
	PushBrief     DailyPushBrief  `json:"pushBrief"`
	Overview      string          `json:"overview"`
	ImportantNews []DigestItem    `json:"importantNews"`
	KeywordBriefs []KeywordBrief  `json:"keywordBriefs"`
	TopicBriefs   []TopicBrief    `json:"topicBriefs"`
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
	parts := strings.Split(ref, ":")
	if report == nil || len(parts) < 2 {
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
	case "google":
		if len(parts) != 3 {
			return false
		}
		groupIdx, err1 := strconv.Atoi(parts[1])
		itemIdx, err2 := strconv.Atoi(parts[2])
		return err1 == nil &&
			err2 == nil &&
			groupIdx >= 0 &&
			groupIdx < len(report.GoogleNews) &&
			itemIdx >= 0 &&
			itemIdx < len(report.GoogleNews[groupIdx].News)
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
	if strings.TrimSpace(digest.Overview) != "" {
		parts = append(parts, "今日概览\n"+strings.TrimSpace(digest.Overview))
	}
	if len(digest.ImportantNews) > 0 {
		lines := []string{"重要新闻"}
		for _, item := range digest.ImportantNews {
			title := strings.TrimSpace(item.Title)
			summary := strings.TrimSpace(item.Summary)
			if title == "" {
				lines = append(lines, summary)
			} else if summary == "" {
				lines = append(lines, title)
			} else {
				lines = append(lines, fmt.Sprintf("%s：%s", title, summary))
			}
		}
		parts = append(parts, strings.Join(lines, "\n"))
	}
	if len(digest.KeywordBriefs) > 0 {
		lines := []string{"关注关键词"}
		for _, brief := range digest.KeywordBriefs {
			lines = append(lines, fmt.Sprintf("%s：%s", brief.Keyword, brief.Summary))
		}
		parts = append(parts, strings.Join(lines, "\n"))
	}
	return strings.Join(parts, "\n")
}

```

- [ ] **Step 4: 运行测试确认通过**

Run:

```powershell
Set-Location C:\GITHUB\platform\backend
go test ./services/auto/mods -run "TestSourceRefExists|TestNormalizeDayDigestDropsInvalidRefsAndCoverage|TestBuildSummaryFromDigest" -count=1
```

Expected: PASS.

- [ ] **Step 5: 提交 Task 1**

```powershell
Set-Location C:\GITHUB\platform
git add -- backend/services/auto/mods/day.go backend/services/auto/mods/day_digest.go backend/services/auto/mods/day_digest_test.go
git commit -m "feat auto: add daily digest model"
```

---

### Task 2: AI 结构化摘要生成和失败重试

**Files:**
- Create: `backend/services/auto/mods/day_digest_ai.go`
- Create: `backend/services/auto/mods/day_digest_ai_test.go`
- Modify: `backend/services/auto/mods/day.go`

- [ ] **Step 1: 写失败测试**

Create `backend/services/auto/mods/day_digest_ai_test.go`:

```go
package mods

import (
	"errors"
	"strings"
	"testing"
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
			"weatherLine": "杭州：多云，23-33℃；明天有雨。",
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
```

- [ ] **Step 2: 运行测试确认失败**

```powershell
Set-Location C:\GITHUB\platform\backend
go test ./services/auto/mods -run "TestGenerateDayDigest" -count=1
```

Expected: FAIL because `generateDayDigest` is not defined.

- [ ] **Step 3: 新增 AI digest 生成文件**

Create `backend/services/auto/mods/day_digest_ai.go`:

```go
package mods

import (
	"encoding/json"
	"errors"
	"fmt"
	"strings"
)

type digestChat interface {
	Chat(prompt string) (string, error)
}

type dayDigestPromptInput struct {
	BBC    []digestPromptNews        `json:"bbc"`
	NYT    []digestPromptNews        `json:"nyt"`
	Google []digestPromptGoogleGroup `json:"google"`
}

type digestPromptNews struct {
	Ref         string `json:"ref"`
	Title       string `json:"title"`
	Description string `json:"description,omitempty"`
	PubDate     string `json:"pubDate"`
}

type digestPromptGoogleGroup struct {
	GroupIndex int                `json:"groupIndex"`
	Keyword    string             `json:"keyword"`
	News       []digestPromptNews `json:"news"`
}

func generateDayDigest(report *DayReport, chat digestChat) (*DayDigest, error) {
	if report == nil {
		return nil, errors.New("report is nil")
	}
	if chat == nil {
		return nil, errors.New("chat is nil")
	}
	input, err := buildDayDigestPromptInput(report)
	if err != nil {
		return nil, err
	}
	prompt := buildDayDigestPrompt(input)
	ans, err := chat.Chat(prompt)
	if err == nil {
		digest, parseErr := parseAndValidateDayDigest(report, ans)
		if parseErr == nil {
			return digest, nil
		}
		err = parseErr
	}
	repairPrompt := buildDayDigestRepairPrompt(input, ans, err)
	ans, retryErr := chat.Chat(repairPrompt)
	if retryErr != nil {
		return nil, retryErr
	}
	return parseAndValidateDayDigest(report, ans)
}

func buildDayDigestPromptInput(report *DayReport) (dayDigestPromptInput, error) {
	input := dayDigestPromptInput{
		BBC:    make([]digestPromptNews, 0, len(report.BbcNews)),
		NYT:    make([]digestPromptNews, 0, len(report.NytNews)),
		Google: make([]digestPromptGoogleGroup, 0, len(report.GoogleNews)),
	}
	for i, news := range report.BbcNews {
		input.BBC = append(input.BBC, digestPromptNews{
			Ref:         fmt.Sprintf("bbc:%d", i),
			Title:       news.Title,
			Description: news.Description,
			PubDate:     news.PubDate,
		})
	}
	for i, news := range report.NytNews {
		input.NYT = append(input.NYT, digestPromptNews{
			Ref:         fmt.Sprintf("nyt:%d", i),
			Title:       news.Title,
			Description: news.Description,
			PubDate:     news.PubDate,
		})
	}
	for groupIdx, group := range report.GoogleNews {
		promptGroup := digestPromptGoogleGroup{
			GroupIndex: groupIdx,
			Keyword:    group.KeyWord,
			News:       make([]digestPromptNews, 0, len(group.News)),
		}
		for itemIdx, news := range group.News {
			promptGroup.News = append(promptGroup.News, digestPromptNews{
				Ref:     fmt.Sprintf("google:%d:%d", groupIdx, itemIdx),
				Title:   news.Title,
				PubDate: news.PubDate,
			})
		}
		input.Google = append(input.Google, promptGroup)
	}
	return input, nil
}

func buildDayDigestPrompt(input dayDigestPromptInput) string {
	body, _ := json.Marshal(input)
	return `请作为每日新闻编辑，基于下面 JSON 生成结构化 DayDigest。

硬性要求：
1. 只输出合法 JSON，不要 Markdown，不要解释。
2. pushBrief 是飞书晨报，目标 500-800 个中文字符。
3. pushBrief.overview 控制在 120-220 个中文字符。
4. pushBrief.importantNews 包含 3-6 条，每条 45-90 个中文字符。
5. pushBrief.keywordBriefs 只包含有新闻的活跃关键词组，限制 3-6 个，每个关键词一句话。
6. 页面用 overview、topicBriefs、keywordBriefs、coverage 做阅读控制台，不能复刻推送正文。
7. 每条 bbc、nyt、google 新闻都必须出现在 coverage 中。
8. 高数量 Google 关键词组必须去重聚合成一句趋势描述。
9. 低信号或单条离散关键词新闻可以只进入 coverage，不必进入 pushBrief。
10. 对可信度较低的 Google 来源，涉及判断或立场时写成“据报道/报道称”，不能直接采纳为事实。

JSON 字段：
{
  "pushBrief": {"weatherLine":"","overview":"","importantNews":[],"keywordBriefs":[]},
  "overview":"",
  "importantNews": [],
  "keywordBriefs": [],
  "topicBriefs": [],
  "coverage": []
}

新闻数据：
` + string(body)
}

func buildDayDigestRepairPrompt(input dayDigestPromptInput, previous string, err error) string {
	body, _ := json.Marshal(input)
	return fmt.Sprintf(`修复上一轮 DayDigest 输出。上一轮输出无法通过后端校验。

错误：%v

上一轮输出：
%s

请重新输出合法 JSON。要求：
1. 只输出 JSON。
2. overview、importantNews、keywordBriefs 必须存在。
3. coverage 只能引用新闻数据中存在的 ref。
4. 每条来源新闻都需要 coverage。
5. pushBrief 仍保持 500-800 个中文字符的晨报密度。

新闻数据：
%s`, err, previous, string(body))
}

func parseAndValidateDayDigest(report *DayReport, raw string) (*DayDigest, error) {
	raw = strings.TrimSpace(raw)
	var digest DayDigest
	if err := json.Unmarshal([]byte(raw), &digest); err != nil {
		return nil, err
	}
	normalized := normalizeDayDigest(report, &digest)
	if normalized == nil {
		return nil, errors.New("digest is nil")
	}
	if normalized.Overview == "" {
		return nil, errors.New("overview is empty")
	}
	if len(normalized.ImportantNews) == 0 {
		return nil, errors.New("importantNews is empty")
	}
	if len(normalized.KeywordBriefs) == 0 {
		return nil, errors.New("keywordBriefs is empty")
	}
	if len(normalized.Coverage) == 0 {
		return nil, errors.New("coverage is empty")
	}
	return normalized, nil
}
```

- [ ] **Step 4: 将 `summary(report)` 接到新 digest 流程**

Modify `backend/services/auto/mods/day.go`, replace the body of `summary(report *DayReport) error` after `chat` creation:

```go
	digest, err := generateDayDigest(report, chat)
	if err != nil {
		report.Summary = "今日摘要生成失败，原始新闻列表已保存，请打开完整日报查看。"
		report.Digest = nil
		return err
	}
	report.Digest = digest
	report.Summary = buildSummaryFromDigest(digest)
	return nil
```

Remove the old free-form prompt block and the call to `summaryGoogleNews` from `summary(report)`. Keep `summaryGoogleNews` only if another caller remains; otherwise remove it in this task after confirming `rg "summaryGoogleNews" backend/services/auto/mods` returns no call sites.

- [ ] **Step 5: 运行测试确认通过**

```powershell
Set-Location C:\GITHUB\platform\backend
go test ./services/auto/mods -run "TestGenerateDayDigest|TestSourceRefExists|TestNormalizeDayDigestDropsInvalidRefsAndCoverage|TestBuildSummaryFromDigest" -count=1
```

Expected: PASS.

- [ ] **Step 6: 提交 Task 2**

```powershell
Set-Location C:\GITHUB\platform
git add -- backend/services/auto/mods/day.go backend/services/auto/mods/day_digest_ai.go backend/services/auto/mods/day_digest_ai_test.go
git commit -m "feat auto: generate structured daily digest"
```

---

### Task 3: 推送使用 PushBrief，失败时给确定性短消息

**Files:**
- Modify: `backend/services/auto/mods/day.go`
- Modify: `backend/services/auto/mods/day_digest.go`
- Modify: `backend/services/auto/mods/day_digest_test.go`

- [ ] **Step 1: 写失败测试**

Append to `backend/services/auto/mods/day_digest_test.go`:

```go
func TestBuildDailyPushMarkdownUsesDigestBrief(t *testing.T) {
	report := sampleDigestReport()
	report.Summary = strings.Repeat("旧摘要", 100)
	report.Digest = &DayDigest{
		PushBrief: DailyPushBrief{
			WeatherLine: "杭州：多云，23-33℃；明天有雨。",
			Overview:    "今天的主线是国际安全升温和科技竞争。",
			ImportantNews: []DigestItem{{
				Title:   "科技竞争",
				Summary: "AI、芯片和生物医药竞争成为重点。",
			}},
			KeywordBriefs: []KeywordBrief{{
				Keyword: "FSD",
				Summary: "特斯拉在中国同时面对诉讼和本地化测试推进。",
			}},
		},
	}

	got := buildDailyPushMarkdown(report, "06月02日", "[点击查看日报](https://plat.intmian.com/day-report/2026-06-02)")
	for _, expected := range []string{"今日概览", "重要新闻", "关注关键词", "FSD：特斯拉在中国"} {
		if !strings.Contains(got, expected) {
			t.Fatalf("push markdown missing %s: %s", expected, got)
		}
	}
	if strings.Contains(got, "旧摘要旧摘要") {
		t.Fatalf("push markdown should not include legacy Summary: %s", got)
	}
}

func TestBuildDailyPushMarkdownFallsBackWhenDigestMissing(t *testing.T) {
	got := buildDailyPushMarkdown(&DayReport{}, "06月02日", "[点击查看日报](https://plat.intmian.com/day-report/2026-06-02)")
	if !strings.Contains(got, "今日摘要生成失败") {
		t.Fatalf("expected deterministic fallback: %s", got)
	}
	if !strings.Contains(got, "点击查看日报") {
		t.Fatalf("expected report link: %s", got)
	}
}
```

- [ ] **Step 2: 运行测试**

```powershell
Set-Location C:\GITHUB\platform\backend
go test ./services/auto/mods -run "TestBuildDailyPushMarkdown" -count=1
```

Expected: FAIL because `buildDailyPushMarkdown` is not defined.

- [ ] **Step 3: 新增推送 Markdown 渲染函数**

Modify imports in `backend/services/auto/mods/day_digest.go`:

```go
import (
	"fmt"
	"strconv"
	"strings"

	"github.com/intmian/mian_go_lib/tool/misc"
)
```

Append to `backend/services/auto/mods/day_digest.go`:

```go
func buildDailyPushMarkdown(report *DayReport, nowTitle string, reportLink string) string {
	md := misc.MarkdownTool{}
	md.AddTitle(fmt.Sprintf("日安，%s的播报", nowTitle), 2)
	if report == nil || report.Digest == nil {
		md.AddContent("今日摘要生成失败，原始日报已保存，请打开完整日报查看。")
		md.AddTitle(reportLink, 3)
		return md.ToStr()
	}
	brief := report.Digest.PushBrief
	if brief.WeatherLine != "" {
		md.AddContent(brief.WeatherLine)
	}
	if brief.Overview != "" {
		md.AddTitle("今日概览", 3)
		md.AddContent(brief.Overview)
	}
	if len(brief.ImportantNews) > 0 {
		md.AddTitle("重要新闻", 3)
		for i, item := range brief.ImportantNews {
			line := item.Summary
			if item.Title != "" {
				line = fmt.Sprintf("%s：%s", item.Title, item.Summary)
			}
			md.AddContent(fmt.Sprintf("%d. %s", i+1, line))
		}
	}
	if len(brief.KeywordBriefs) > 0 {
		md.AddTitle("关注关键词", 3)
		for _, item := range brief.KeywordBriefs {
			md.AddContent(fmt.Sprintf("%s：%s", item.Keyword, item.Summary))
		}
	}
	md.AddTitle(reportLink, 3)
	return md.ToStr()
}
```

- [ ] **Step 4: 运行推送渲染测试确认通过**

```powershell
Set-Location C:\GITHUB\platform\backend
go test ./services/auto/mods -run "TestBuildDailyPushMarkdown" -count=1
```

Expected: PASS.

- [ ] **Step 5: 修改 `Do()` 使用新渲染函数**

Modify `backend/services/auto/mods/day.go`, replace the push construction inside `func (d *Day) Do()` after successful `GenerateDayReport()`:

```go
	todayStr := time.Now().Format("01月02日")
	reportLink := fmt.Sprintf("[点击查看日报](https://plat.intmian.com/day-report/%s)", time.Now().Format("2006-01-02"))
	pushContent := buildDailyPushMarkdown(report, todayStr, reportLink)
	err = tool.GPush.Push("日报", pushContent, true)
	if err != nil {
		tool.GLog.WarningErr("auto.Day", errors.Join(errors.New("func Do() Push error"), err))
	}
```

Remove the old `Do()` blocks that add keyword names, BBC/NYT counts, and full `report.Summary` to the push.

- [ ] **Step 6: 运行相关后端测试**

```powershell
Set-Location C:\GITHUB\platform\backend
go test ./services/auto/mods -run "TestBuildDailyPushMarkdown|TestGenerateDayDigest|TestBuildSummaryFromDigest" -count=1
```

Expected: PASS.

- [ ] **Step 7: 提交 Task 3**

```powershell
Set-Location C:\GITHUB\platform
git add -- backend/services/auto/mods/day.go backend/services/auto/mods/day_digest.go backend/services/auto/mods/day_digest_test.go
git commit -m "feat auto: render digest push brief"
```

---

### Task 4: 前端类型和阅读控制台组件

**Files:**
- Modify: `frontend/src/common/newSendHttp.ts`
- Create: `frontend/src/report/reportDigest.tsx`
- Modify: `frontend/src/report/reportShow.tsx`

- [ ] **Step 1: 更新前端类型**

Modify the auto-report type area in `frontend/src/common/newSendHttp.ts`:

```ts
type RssItem = {
    title: string;
    description?: string;
    link: string;
    pubDate: string;
};

export interface DigestItem {
    title: string
    summary: string
    topic: string
    importance: number
    sourceRefs: string[]
}

export interface KeywordBrief {
    keyword: string
    summary: string
    count: number
    sourceRefs: string[]
}

export interface TopicBrief {
    topic: string
    summary: string
    sourceRefs: string[]
}

export interface DigestCoverage {
    ref: string
    topic: string
    inPush: boolean
    importance: number
}

export interface DailyPushBrief {
    weatherLine: string
    overview: string
    importantNews: DigestItem[]
    keywordBriefs: KeywordBrief[]
}

export interface DayDigest {
    pushBrief: DailyPushBrief
    overview: string
    importantNews: DigestItem[]
    keywordBriefs: KeywordBrief[]
    topicBriefs: TopicBrief[]
    coverage: DigestCoverage[]
}

export interface DayReport {
    Weather: WeatherPtl
    WeatherIndex: WeatherIndexPtl;
    Summary?: string
    digest?: DayDigest
    BbcNews: RssItem[]
    NytNews: RssItem[]
    GoogleNews: {
        KeyWord: string;
        News: RssItem[];
    }[];
}
```

Keep `WholeReport` unchanged except it should use the same lower-case `RssItem`.

- [ ] **Step 2: 新建阅读控制台组件**

Create `frontend/src/report/reportDigest.tsx`:

```tsx
import React, {useMemo, useState} from "react";
import {Button, Card, Collapse, List, Space, Tag, Typography} from "antd";
import {Link} from "react-router-dom";
import {DayDigest, DigestItem, KeywordBrief, TopicBrief} from "../common/newSendHttp";

const {Text, Title} = Typography;

export interface DigestNewsArticle {
    title: string;
    link: string;
    description?: string;
    pubDate: string;
}

export interface DigestGoogleNewsGroup {
    KeyWord: string;
    News: DigestNewsArticle[];
}

interface DigestConsoleProps {
    digest: DayDigest;
    bbcNews: DigestNewsArticle[];
    nytNews: DigestNewsArticle[];
    googleNews: DigestGoogleNewsGroup[];
}

type SourceArticle = {
    ref: string;
    title: string;
    link: string;
    source: string;
}

function importanceTag(importance: number) {
    if (importance >= 5) return <Tag color="red">高</Tag>;
    if (importance >= 3) return <Tag color="orange">中</Tag>;
    return <Tag color="blue">低</Tag>;
}

function keywordHeat(brief: KeywordBrief) {
    if (brief.count >= 8 || brief.sourceRefs.length >= 8) return <Tag color="red">高热度</Tag>;
    if (brief.count >= 3 || brief.sourceRefs.length >= 3) return <Tag color="orange">中热度</Tag>;
    return <Tag color="blue">低热度</Tag>;
}

function sourceMap(bbcNews: DigestNewsArticle[], nytNews: DigestNewsArticle[], googleNews: DigestGoogleNewsGroup[]) {
    const map = new Map<string, SourceArticle>();
    bbcNews.forEach((item, index) => map.set(`bbc:${index}`, {
        ref: `bbc:${index}`,
        title: item.title,
        link: item.link,
        source: "BBC",
    }));
    nytNews.forEach((item, index) => map.set(`nyt:${index}`, {
        ref: `nyt:${index}`,
        title: item.title,
        link: item.link,
        source: "NYT",
    }));
    googleNews.forEach((group, groupIndex) => {
        (group.News || []).forEach((item, itemIndex) => map.set(`google:${groupIndex}:${itemIndex}`, {
            ref: `google:${groupIndex}:${itemIndex}`,
            title: item.title,
            link: item.link,
            source: group.KeyWord,
        }));
    });
    return map;
}

function linkedSources(refs: string[], sources: Map<string, SourceArticle>) {
    const items = refs.map(ref => sources.get(ref)).filter((item): item is SourceArticle => Boolean(item));
    if (!items.length) return <Text type="secondary">暂无关联来源</Text>;
    return <List
        size="small"
        dataSource={items}
        renderItem={item => <List.Item key={item.ref}>
            <Space direction="vertical" size={0}>
                <Tag>{item.source}</Tag>
                <Link to={item.link} target="_blank" rel="noopener noreferrer">{item.title}</Link>
            </Space>
        </List.Item>}
    />;
}

function MainLines({digest}: { digest: DayDigest }) {
    const lines = digest.topicBriefs.slice(0, 4).map(item => item.topic).filter(Boolean);
    if (!lines.length && digest.overview) {
        return <Typography.Paragraph>{digest.overview}</Typography.Paragraph>;
    }
    return <Space wrap>
        {lines.map(line => <Tag key={line} color="geekblue">{line}</Tag>)}
    </Space>;
}

function TopicPanel({topic, sources}: { topic: TopicBrief, sources: Map<string, SourceArticle> }) {
    return <Collapse.Panel
        key={topic.topic}
        header={<Space wrap>
            <Text strong>{topic.topic}</Text>
            <Tag>{topic.sourceRefs.length} 条来源</Tag>
        </Space>}
    >
        <Typography.Paragraph>{topic.summary}</Typography.Paragraph>
        {linkedSources(topic.sourceRefs, sources)}
    </Collapse.Panel>;
}

function ImportantItem({item, sources}: { item: DigestItem, sources: Map<string, SourceArticle> }) {
    const [open, setOpen] = useState(false);
    return <List.Item>
        <Space direction="vertical" style={{width: "100%"}}>
            <Space wrap>
                <Text strong>{item.title || item.topic}</Text>
                {importanceTag(item.importance)}
                <Tag>{item.sourceRefs.length} 条来源</Tag>
            </Space>
            <Typography.Paragraph style={{marginBottom: 0}}>{item.summary}</Typography.Paragraph>
            <Button size="small" type="link" onClick={() => setOpen(!open)}>
                {open ? "收起来源" : "展开来源"}
            </Button>
            {open && linkedSources(item.sourceRefs, sources)}
        </Space>
    </List.Item>;
}

function KeywordItem({brief, sources}: { brief: KeywordBrief, sources: Map<string, SourceArticle> }) {
    const [open, setOpen] = useState(false);
    return <List.Item>
        <Space direction="vertical" style={{width: "100%"}}>
            <Space wrap>
                <Text strong>{brief.keyword}</Text>
                {keywordHeat(brief)}
                <Tag>{brief.count || brief.sourceRefs.length} 条</Tag>
            </Space>
            <Typography.Paragraph style={{marginBottom: 0}}>{brief.summary}</Typography.Paragraph>
            <Button size="small" type="link" onClick={() => setOpen(!open)}>
                {open ? "收起来源" : "展开来源"}
            </Button>
            {open && linkedSources(brief.sourceRefs, sources)}
        </Space>
    </List.Item>;
}

export function DigestConsole({digest, bbcNews, nytNews, googleNews}: DigestConsoleProps) {
    const sources = useMemo(() => sourceMap(bbcNews || [], nytNews || [], googleNews || []), [bbcNews, nytNews, googleNews]);
    return <Card title="日报导航" style={{marginBottom: "16px", borderRadius: "10px", boxShadow: "0 4px 10px rgba(0, 0, 0, 0.15)"}}>
        <Space direction="vertical" size="large" style={{width: "100%"}}>
            <section>
                <Title level={4}>今日主线</Title>
                <MainLines digest={digest}/>
            </section>
            <section>
                <Title level={4}>重要主题</Title>
                <List
                    dataSource={digest.importantNews || []}
                    renderItem={item => <ImportantItem key={`${item.topic}-${item.title}`} item={item} sources={sources}/>}
                />
                {!!digest.topicBriefs?.length && <Collapse bordered={false}>
                    {digest.topicBriefs.map(topic => <TopicPanel key={topic.topic} topic={topic} sources={sources}/>)}
                </Collapse>}
            </section>
            <section>
                <Title level={4}>关键词雷达</Title>
                <List
                    dataSource={[...(digest.keywordBriefs || [])].sort((a, b) => (b.count || b.sourceRefs.length) - (a.count || a.sourceRefs.length))}
                    renderItem={item => <KeywordItem key={item.keyword} brief={item} sources={sources}/>}
                />
            </section>
        </Space>
    </Card>;
}
```

- [ ] **Step 3: 接入 `ReportShow`**

Modify `frontend/src/report/reportShow.tsx` imports:

```tsx
import {DigestConsole} from "./reportDigest";
```

Modify `DashboardProps`:

```tsx
interface DashboardProps {
    data: {
        Weather?: WeatherData;
        WeatherIndex?: WeatherIndexData;
        Summary?: string;
        digest?: DayDigest;
        BbcNews: NewsArticle[];
        NytNews: NewsArticle[];
        GoogleNews: GoogleNewsGroup[];
    };
}
```

Import `DayDigest` from `newSendHttp`:

```tsx
import {DayDigest, DayReport, sendGetReport, sendGetWholeReport, WholeReport} from "../common/newSendHttp";
```

Replace the summary render line in `Dashboard`:

```tsx
                {data.digest
                    ? <DigestConsole digest={data.digest} bbcNews={BbcNews} nytNews={NytNews} googleNews={GoogleNews}/>
                    : data.Summary && <SummaryCard summary={data.Summary}/>}
```

When building multi-day aggregate data, do not merge digest in the first slice. Keep `Summary` aggregation unchanged and do not set `digest` on aggregate reports.

- [ ] **Step 4: 运行前端构建**

```powershell
Set-Location C:\GITHUB\platform\frontend
npm run build
```

Expected: PASS with Vite build output and no TypeScript or JSX syntax errors.

- [ ] **Step 5: 提交 Task 4**

```powershell
Set-Location C:\GITHUB\platform
git add -- frontend/src/common/newSendHttp.ts frontend/src/report/reportDigest.tsx frontend/src/report/reportShow.tsx
git commit -m "feat report: show daily digest console"
```

---

### Task 5: 文档、运行验证和相邻回归

**Files:**
- Modify: `ai-doc/backend/auto.md`

- [ ] **Step 1: 更新后端 auto 文档**

Modify `ai-doc/backend/auto.md`:

```markdown
Last verified: 2026-06-02
```

Replace the current Day report generation flow bullets for summary/push with:

```markdown
6. Generate optional structured `DayDigest` through AI scene `summary`.
7. New reports keep `Summary` as a plain-text fallback derived from digest when generation succeeds; old reports without `Digest` remain readable.
8. Persist report and update `report_list`.
9. Scheduled `Do()` path renders push markdown from `DayDigest.PushBrief` when digest generation succeeds; if digest is missing, it pushes a short deterministic fallback with the report link instead of the old full `Summary`.
```

- [ ] **Step 2: 运行后端目标测试**

```powershell
Set-Location C:\GITHUB\platform\backend
go test ./services/auto/mods -run "TestSourceRefExists|TestNormalizeDayDigestDropsInvalidRefsAndCoverage|TestBuildSummaryFromDigest|TestGenerateDayDigest|TestBuildDailyPushMarkdown" -count=1
```

Expected: PASS.

- [ ] **Step 3: 运行后端相邻回归测试**

```powershell
Set-Location C:\GITHUB\platform\backend
go test ./services/auto -run Test -count=1
```

Expected: PASS or "no tests to run" with package success. If it fails because an existing unrelated test depends on local external credentials, record the exact failure and run:

```powershell
Set-Location C:\GITHUB\platform\backend
go test ./services/auto/mods -run "TestBuildDailyPushMarkdownFallsBackWhenDigestMissing" -count=1
```

Expected fallback check: PASS.

- [ ] **Step 4: 运行前端构建回归**

```powershell
Set-Location C:\GITHUB\platform\frontend
npm run build
```

Expected: PASS.

- [ ] **Step 5: 浏览器交互验证**

Start or reuse runtimes:

```powershell
Set-Location C:\GITHUB\platform\backend\test
go run ..\main\main.go
```

```powershell
Set-Location C:\GITHUB\platform\frontend
npm run dev
```

Browser checks:

1. Open `/day-report/<date-with-digest>`.
2. Confirm top card title is `日报导航`.
3. Confirm it shows `今日主线`, `重要主题`, and `关键词雷达`.
4. Expand one important item and confirm linked source items appear.
5. Scroll to BBC, NYT, and Google sections and confirm raw lists still render.
6. Open an older date without `digest` and confirm the old `概要` card still renders.

- [ ] **Step 6: 数据变更记录**

If `generateReport` is invoked during runtime verification, record:

```text
Changed storage: backend/test/auto_report.db
Changed report key: <YYYY-MM-DD>
Cleanup: keep generated report unless user requests deletion; it is normal test/report data.
```

If only unit/build/browser display against existing data is used, record:

```text
Data mutation: none
```

- [ ] **Step 7: 提交 Task 5**

```powershell
Set-Location C:\GITHUB\platform
git add -- ai-doc/backend/auto.md
git commit -m "doc auto: document structured daily digest"
```

---

## Final Verification Gate

- [ ] **Step 1: Check clean target diff**

```powershell
Set-Location C:\GITHUB\platform
git status --short
```

Expected: only unrelated pre-existing files may remain. Do not stage unrelated files such as another spec unless the user requested it.

- [ ] **Step 2: Run combined backend checks**

```powershell
Set-Location C:\GITHUB\platform\backend
go test ./services/auto/mods -run "TestSourceRefExists|TestNormalizeDayDigestDropsInvalidRefsAndCoverage|TestBuildSummaryFromDigest|TestGenerateDayDigest|TestBuildDailyPushMarkdown" -count=1
```

Expected: PASS.

- [ ] **Step 3: Run frontend build**

```powershell
Set-Location C:\GITHUB\platform\frontend
npm run build
```

Expected: PASS.

- [ ] **Step 4: Report completion**

Final report must include:

```text
Baseline: current push used full Summary and page used long SummaryCard.
Patch: DayDigest model/generation/push + DigestConsole page summary.
Post-state: push uses PushBrief when digest exists; page shows reading console; old Summary fallback remains.
Regression: raw BBC/NYT/Google lists still render; old reports without digest still show SummaryCard.
Residual risk: live AI output quality depends on configured provider and model.
AI-doc: ai-doc/backend/auto.md updated.
Data mutation: <none or report key>.
```
