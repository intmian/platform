package mods

import (
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"
)

type digestChat interface {
	Chat(prompt string) (string, error)
}

const dayDigestFailureSummary = "今日摘要生成失败，原始日报已保存，请打开完整日报查看。"

type dayDigestPromptInput struct {
	WeatherLine string                    `json:"weatherLine,omitempty"`
	BBC         []digestPromptNews        `json:"bbc"`
	NYT         []digestPromptNews        `json:"nyt"`
	Google      []digestPromptGoogleGroup `json:"google"`
}

type digestPromptNews struct {
	Ref         string `json:"ref"`
	Title       string `json:"title"`
	Description string `json:"description,omitempty"`
	PubDate     string `json:"pubDate,omitempty"`
}

type digestPromptGoogleGroup struct {
	GroupIndex int                `json:"groupIndex"`
	Keyword    string             `json:"keyword"`
	News       []digestPromptNews `json:"news"`
}

func buildDayDigestPromptInput(report *DayReport) dayDigestPromptInput {
	input := dayDigestPromptInput{}
	if report == nil {
		return input
	}

	input.WeatherLine = buildDayDigestWeatherLine(report)
	input.BBC = make([]digestPromptNews, 0, len(report.BbcNews))
	for i, item := range report.BbcNews {
		input.BBC = append(input.BBC, digestPromptNews{
			Ref:         fmt.Sprintf("bbc:%d", i),
			Title:       item.Title,
			Description: item.Description,
			PubDate:     formatDigestPromptTime(item.PubDate),
		})
	}

	input.NYT = make([]digestPromptNews, 0, len(report.NytNews))
	for i, item := range report.NytNews {
		input.NYT = append(input.NYT, digestPromptNews{
			Ref:         fmt.Sprintf("nyt:%d", i),
			Title:       item.Title,
			Description: item.Description,
			PubDate:     formatDigestPromptTime(item.PubDate),
		})
	}

	input.Google = make([]digestPromptGoogleGroup, 0, len(report.GoogleNews))
	for groupIndex, group := range report.GoogleNews {
		promptGroup := digestPromptGoogleGroup{
			GroupIndex: groupIndex,
			Keyword:    group.KeyWord,
			News:       make([]digestPromptNews, 0, len(group.News)),
		}
		for itemIndex, item := range group.News {
			promptGroup.News = append(promptGroup.News, digestPromptNews{
				Ref:         fmt.Sprintf("google:%d:%d", groupIndex, itemIndex),
				Title:       item.Title,
				Description: item.Description,
				PubDate:     formatDigestPromptTime(item.PubDate),
			})
		}
		input.Google = append(input.Google, promptGroup)
	}

	return input
}

func buildDayDigestWeatherLine(report *DayReport) string {
	if report == nil || len(report.Weather.Daily) == 0 {
		return ""
	}

	weather := report.Weather.Daily[0]
	textDay := strings.TrimSpace(weather.TextDay)
	tempMin := strings.TrimSpace(weather.TempMin)
	tempMax := strings.TrimSpace(weather.TempMax)
	if textDay == "" && tempMin == "" && tempMax == "" {
		return ""
	}
	if textDay != "" && tempMin != "" && tempMax != "" {
		return fmt.Sprintf("%s，%s-%s℃", textDay, tempMin, tempMax)
	}
	if textDay != "" {
		return textDay
	}
	if tempMin != "" && tempMax != "" {
		return fmt.Sprintf("%s-%s℃", tempMin, tempMax)
	}
	return ""
}

func formatDigestPromptTime(t time.Time) string {
	if t.IsZero() {
		return ""
	}
	return t.Format(time.RFC3339)
}

func buildDayDigestPrompt(input dayDigestPromptInput) string {
	payload, err := json.MarshalIndent(input, "", "  ")
	if err != nil {
		payload = []byte("{}")
	}
	return `请作为每日新闻整合器，基于下面 JSON 新闻输入生成结构化日报 digest。

要求：
1. 只返回一个 JSON 对象，不要 Markdown、代码块、解释文字。
2. 推送 brief 面向中国普通读者，整体信息密度为 500-800 字；主 digest 可以更完整。
3. importantNews 聚合最重要的 BBC/NYT/Google 事实，keywordBriefs 覆盖有新闻的 Google 关键词；没有 Google 新闻时 keywordBriefs 可以为空。
4. coverage 必须列出输入中被识别的来源 ref，ref 只能使用输入里已有的 bbc:n、nyt:n、google:group:item。
5. pushBrief.weatherLine 必须复用输入 weatherLine；输入没有 weatherLine 时留空，不要编造天气。
6. 语言克制、准确，不做评价，不编造输入中没有的事实。

返回 JSON schema：
{
  "pushBrief": {
    "weatherLine": "",
    "overview": "string",
    "importantNews": [{"title":"string","summary":"string","topic":"string","importance":1,"sourceRefs":["nyt:0"]}],
    "keywordBriefs": [{"keyword":"string","summary":"string","count":1,"sourceRefs":["google:0:0"]}]
  },
  "overview": "string",
  "importantNews": [{"title":"string","summary":"string","topic":"string","importance":1,"sourceRefs":["bbc:0"]}],
  "keywordBriefs": [{"keyword":"string","summary":"string","count":1,"sourceRefs":["google:0:0"]}],
  "topicBriefs": [{"topic":"string","summary":"string","sourceRefs":["nyt:0"]}],
  "coverage": [{"ref":"bbc:0","topic":"string","inPush":true,"importance":1}]
}

新闻输入：
` + string(payload)
}

func buildDayDigestRepairPrompt(originalPrompt, response string, validationErr error) string {
	return fmt.Sprintf(`请修复上一轮日报 digest 输出，使其成为可解析且满足 schema 的 JSON 对象。

修复要求：
1. 只返回修复后的 JSON 对象，不要 Markdown、代码块、解释文字。
2. overview、importantNews、coverage 在规范化后都不能为空；仅当 Google 输入有实际新闻时 keywordBriefs 才必须非空。
3. pushBrief.overview 和 pushBrief.importantNews 在规范化后不能为空；仅当 Google 输入有实际新闻时 pushBrief.keywordBriefs 才必须非空。
4. pushBrief.weatherLine 必须复用原始输入 weatherLine；输入为空时留空。
5. 所有 sourceRefs 和 coverage.ref 必须来自原始输入中的 ref。

校验错误：
%v

上一轮输出：
%s

原始任务：
%s`, validationErr, response, originalPrompt)
}

func parseAndValidateDayDigest(report *DayReport, raw string) (*DayDigest, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return nil, errors.New("empty digest response")
	}
	raw = trimJSONEnvelope(raw)

	var digest DayDigest
	if err := json.Unmarshal([]byte(raw), &digest); err != nil {
		return nil, errors.Join(errors.New("day digest json unmarshal error"), err)
	}

	normalized := normalizeDayDigest(report, &digest)
	if normalized == nil {
		return nil, errors.New("day digest is nil")
	}
	if strings.TrimSpace(normalized.Overview) == "" {
		return nil, errors.New("day digest overview is empty")
	}
	if len(normalized.ImportantNews) == 0 {
		return nil, errors.New("day digest importantNews is empty")
	}
	if reportHasGoogleNews(report) && len(normalized.KeywordBriefs) == 0 {
		return nil, errors.New("day digest keywordBriefs is empty")
	}
	if len(normalized.Coverage) == 0 {
		return nil, errors.New("day digest coverage is empty")
	}
	if strings.TrimSpace(normalized.PushBrief.Overview) == "" {
		return nil, errors.New("day digest pushBrief overview is empty")
	}
	if len(normalized.PushBrief.ImportantNews) == 0 {
		return nil, errors.New("day digest pushBrief importantNews is empty")
	}
	if reportHasGoogleNews(report) && len(normalized.PushBrief.KeywordBriefs) == 0 {
		return nil, errors.New("day digest pushBrief keywordBriefs is empty")
	}
	if expectedWeatherLine := buildDayDigestWeatherLine(report); strings.TrimSpace(normalized.PushBrief.WeatherLine) != expectedWeatherLine {
		return nil, errors.New("day digest pushBrief weatherLine does not match input")
	}

	return normalized, nil
}

func reportHasGoogleNews(report *DayReport) bool {
	if report == nil {
		return false
	}
	for _, group := range report.GoogleNews {
		if len(group.News) > 0 {
			return true
		}
	}
	return false
}

func trimJSONEnvelope(raw string) string {
	raw = strings.TrimSpace(raw)
	if strings.HasPrefix(raw, "```") {
		raw = strings.TrimPrefix(raw, "```json")
		raw = strings.TrimPrefix(raw, "```JSON")
		raw = strings.TrimPrefix(raw, "```")
		raw = strings.TrimSuffix(raw, "```")
		raw = strings.TrimSpace(raw)
	}
	start := strings.Index(raw, "{")
	end := strings.LastIndex(raw, "}")
	if start >= 0 && end >= start {
		return raw[start : end+1]
	}
	return raw
}

func generateDayDigest(report *DayReport, chat digestChat) (*DayDigest, error) {
	if report == nil {
		return nil, errors.New("day report is nil")
	}
	if chat == nil {
		return nil, errors.New("digest chat is nil")
	}

	prompt := buildDayDigestPrompt(buildDayDigestPromptInput(report))
	response, err := chat.Chat(prompt)
	if err == nil {
		digest, parseErr := parseAndValidateDayDigest(report, response)
		if parseErr == nil {
			return digest, nil
		}
		err = parseErr
	}

	repairPrompt := buildDayDigestRepairPrompt(prompt, response, err)
	repairedResponse, repairErr := chat.Chat(repairPrompt)
	if repairErr != nil {
		return nil, errors.Join(errors.New("day digest repair chat error"), err, repairErr)
	}
	digest, parseErr := parseAndValidateDayDigest(report, repairedResponse)
	if parseErr != nil {
		return nil, errors.Join(errors.New("day digest repair validation error"), err, parseErr)
	}

	return digest, nil
}
