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
	WeatherLine string             `json:"weatherLine,omitempty"`
	BBC         []digestPromptNews `json:"bbc"`
	NYT         []digestPromptNews `json:"nyt"`
}

type dayPublicDigestPromptInput struct {
	WeatherLine string             `json:"weatherLine,omitempty"`
	BBC         []digestPromptNews `json:"bbc"`
	NYT         []digestPromptNews `json:"nyt"`
}

type digestPromptNews struct {
	Ref         string `json:"ref"`
	Title       string `json:"title"`
	Description string `json:"description,omitempty"`
	PubDate     string `json:"pubDate,omitempty"`
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

	return input
}

func buildDayPublicDigestPromptInput(report *DayReport) dayPublicDigestPromptInput {
	input := buildDayDigestPromptInput(report)
	return dayPublicDigestPromptInput{
		WeatherLine: input.WeatherLine,
		BBC:         input.BBC,
		NYT:         input.NYT,
	}
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

func buildDayDigestPrompt(input dayPublicDigestPromptInput) string {
	payload, err := json.MarshalIndent(input, "", "  ")
	if err != nil {
		payload = []byte("{}")
	}
	return `请作为每日新闻整合器，基于下面 JSON 新闻输入生成结构化日报公共 digest。

要求：
1. 只返回一个 JSON 对象，不要 Markdown、代码块、解释文字。
2. 输入为 BBC/NYT 公共新闻；overview、importantNews、topicBriefs 都只能基于本输入。
3. 推送 brief 面向中国普通读者，整体信息密度为 500-800 字；主 digest 可以更完整。
4. importantNews 聚合最重要的 BBC/NYT 事实，sourceRefs 只能使用输入里已有的 bbc:n 或 nyt:n。
5. topicBriefs 梳理 BBC/NYT 的公共主题，sourceRefs 只能使用输入里已有的 bbc:n 或 nyt:n。
6. keywordBriefs 和 pushBrief.keywordBriefs 必须返回空数组。
7. coverage 必须列出输入中被识别的来源 ref，ref 只能使用输入里已有的 bbc:n 或 nyt:n。
8. pushBrief.weatherLine 必须复用输入 weatherLine；输入没有 weatherLine 时留空，不要编造天气。
9. 语言克制、准确，不做评价，不编造输入中没有的事实。
10. 字数上限（手机上阅读，宁短勿长）：importantNews 的 title 不超过 18 字、summary 不超过 60 字；overview 不超过 150 字，pushBrief.overview 不超过 100 字；topicBriefs 的 topic 不超过 8 字、summary 不超过 40 字。title 直接说事实，不加"重磅""突发"之类的修饰。

返回 JSON schema：
{
  "pushBrief": {
    "weatherLine": "",
    "overview": "string",
    "importantNews": [{"title":"string","summary":"string","topic":"string","importance":1,"sourceRefs":["nyt:0"]}],
    "keywordBriefs": []
  },
  "overview": "string",
  "importantNews": [{"title":"string","summary":"string","topic":"string","importance":1,"sourceRefs":["bbc:0"]}],
  "keywordBriefs": [],
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
2. overview、importantNews、coverage 在规范化后都不能为空；keywordBriefs 必须为空数组。
3. pushBrief.overview 和 pushBrief.importantNews 在规范化后不能为空；pushBrief.keywordBriefs 必须为空数组。
4. pushBrief.weatherLine 必须复用原始输入 weatherLine；输入为空时留空。
5. keywordBriefs 和 pushBrief.keywordBriefs 必须返回空数组。
6. importantNews 和 topicBriefs 的 sourceRefs 只能使用 bbc:n 或 nyt:n。
7. 所有 sourceRefs 和 coverage.ref 必须来自原始输入中的 ref。

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

	return validateDayDigest(report, &digest)
}

func validateDayDigest(report *DayReport, digest *DayDigest) (*DayDigest, error) {
	normalized := normalizeDayDigest(report, digest)
	if normalized == nil {
		return nil, errors.New("day digest is nil")
	}
	if strings.TrimSpace(normalized.Overview) == "" {
		return nil, errors.New("day digest overview is empty")
	}
	if len(normalized.ImportantNews) == 0 {
		return nil, errors.New("day digest importantNews is empty")
	}
	if err := validatePublicDigestItems(normalized.ImportantNews, "day digest importantNews"); err != nil {
		return nil, err
	}
	if err := validateKeywordBriefs(normalized.KeywordBriefs, "day digest keywordBriefs"); err != nil {
		return nil, err
	}
	if err := validateTopicBriefs(normalized.TopicBriefs, "day digest topicBriefs"); err != nil {
		return nil, err
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
	if err := validatePublicDigestItems(normalized.PushBrief.ImportantNews, "day digest pushBrief importantNews"); err != nil {
		return nil, err
	}
	if err := validateKeywordBriefs(normalized.PushBrief.KeywordBriefs, "day digest pushBrief keywordBriefs"); err != nil {
		return nil, err
	}
	if expectedWeatherLine := buildDayDigestWeatherLine(report); strings.TrimSpace(normalized.PushBrief.WeatherLine) != expectedWeatherLine {
		return nil, errors.New("day digest pushBrief weatherLine does not match input")
	}

	return normalized, nil
}

func validatePublicDigestItems(items []DigestItem, field string) error {
	for _, item := range items {
		for _, ref := range item.SourceRefs {
			if isKeywordSourceRef(ref) {
				return fmt.Errorf("%s contains keyword source ref %s", field, ref)
			}
		}
	}
	return nil
}

func validateTopicBriefs(briefs []TopicBrief, field string) error {
	for _, brief := range briefs {
		for _, ref := range brief.SourceRefs {
			if isKeywordSourceRef(ref) {
				return fmt.Errorf("%s contains keyword source ref %s", field, ref)
			}
		}
	}
	return nil
}

func validateKeywordBriefs(briefs []KeywordBrief, field string) error {
	for _, brief := range briefs {
		for _, ref := range brief.SourceRefs {
			if !isKeywordSourceRef(ref) {
				return fmt.Errorf("%s contains non-keyword source ref %s", field, ref)
			}
		}
	}
	return nil
}

func validateCoverageRefs(coverage []DigestCoverage, field string, valid func(string) bool) error {
	for _, item := range coverage {
		if !valid(item.Ref) {
			return fmt.Errorf("%s contains invalid source ref %s", field, item.Ref)
		}
	}
	return nil
}

func isKeywordSourceRef(ref string) bool {
	return strings.HasPrefix(ref, "kw:")
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

	digest, err := generatePublicDayDigest(report, chat)
	if err != nil {
		return nil, err
	}

	// 关键词部分直接来自联网搜索的结果（搜索时模型已经概括过），不再额外调用 AI。
	keywordBriefs := buildKeywordBriefs(report)
	digest.KeywordBriefs = keywordBriefs
	digest.PushBrief.KeywordBriefs = append([]KeywordBrief(nil), keywordBriefs...)

	return validateDayDigest(report, digest)
}

func generatePublicDayDigest(report *DayReport, chat digestChat) (*DayDigest, error) {
	prompt := buildDayDigestPrompt(buildDayPublicDigestPromptInput(report))
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
