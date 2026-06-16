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

type digestPromptGoogleGroup struct {
	GroupIndex int                `json:"groupIndex"`
	Keyword    string             `json:"keyword"`
	News       []digestPromptNews `json:"news"`
}

type dayKeywordDigest struct {
	PushBrief     dayKeywordPushBrief `json:"pushBrief"`
	KeywordBriefs []KeywordBrief      `json:"keywordBriefs"`
	Coverage      []DigestCoverage    `json:"coverage"`
}

type dayKeywordPushBrief struct {
	KeywordBriefs []KeywordBrief `json:"keywordBriefs"`
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

func buildDayKeywordDigestPrompt(input []digestPromptGoogleGroup) string {
	payload, err := json.MarshalIndent(input, "", "  ")
	if err != nil {
		payload = []byte("[]")
	}
	return `请作为每日新闻整合器，基于下面 JSON Google 关键词新闻输入生成关键词摘要。

要求：
1. 只返回一个 JSON 对象，不要 Markdown、代码块、解释文字。
2. 输入只包含 Google 关键词新闻；只能生成 keywordBriefs 和 pushBrief.keywordBriefs。
3. 每个有新闻的关键词都应生成一条摘要，summary 简洁说明当天这个关键词下的主要变化。
4. sourceRefs 和 coverage.ref 只能使用输入里已有的 google:group:item。
5. coverage 必须列出输入中被识别的来源 ref。
6. 语言克制、准确，不做评价，不编造输入中没有的事实。

返回 JSON schema：
{
  "pushBrief": {
    "keywordBriefs": [{"keyword":"string","summary":"string","count":1,"sourceRefs":["google:0:0"]}]
  },
  "keywordBriefs": [{"keyword":"string","summary":"string","count":1,"sourceRefs":["google:0:0"]}],
  "coverage": [{"ref":"google:0:0","topic":"string","inPush":true,"importance":1}]
}

Google 关键词新闻输入：
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

func buildDayKeywordDigestRepairPrompt(originalPrompt, response string, validationErr error) string {
	return fmt.Sprintf(`请修复上一轮关键词 digest 输出，使其成为可解析且满足 schema 的 JSON 对象。

修复要求：
1. 只返回修复后的 JSON 对象，不要 Markdown、代码块、解释文字。
2. keywordBriefs、pushBrief.keywordBriefs、coverage 在规范化后都不能为空。
3. 所有 sourceRefs 和 coverage.ref 必须来自原始输入中的 google:group:item。
4. 不要生成 overview、importantNews、topicBriefs。

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
	if reportHasGoogleNews(report) && len(normalized.KeywordBriefs) == 0 {
		return nil, errors.New("day digest keywordBriefs is empty")
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
	if reportHasGoogleNews(report) && len(normalized.PushBrief.KeywordBriefs) == 0 {
		return nil, errors.New("day digest pushBrief keywordBriefs is empty")
	}
	if err := validateKeywordBriefs(normalized.PushBrief.KeywordBriefs, "day digest pushBrief keywordBriefs"); err != nil {
		return nil, err
	}
	if expectedWeatherLine := buildDayDigestWeatherLine(report); strings.TrimSpace(normalized.PushBrief.WeatherLine) != expectedWeatherLine {
		return nil, errors.New("day digest pushBrief weatherLine does not match input")
	}

	return normalized, nil
}

func parseAndValidateDayKeywordDigest(report *DayReport, raw string) (*dayKeywordDigest, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return nil, errors.New("empty keyword digest response")
	}
	raw = trimJSONEnvelope(raw)

	var digest dayKeywordDigest
	if err := json.Unmarshal([]byte(raw), &digest); err != nil {
		return nil, errors.Join(errors.New("keyword digest json unmarshal error"), err)
	}

	digest.KeywordBriefs = normalizeKeywordBriefs(report, digest.KeywordBriefs)
	digest.PushBrief.KeywordBriefs = normalizeKeywordBriefs(report, digest.PushBrief.KeywordBriefs)
	digest.Coverage = normalizeCoverage(report, digest.Coverage)
	if len(digest.KeywordBriefs) == 0 {
		return nil, errors.New("keyword digest keywordBriefs is empty")
	}
	if len(digest.PushBrief.KeywordBriefs) == 0 {
		return nil, errors.New("keyword digest pushBrief keywordBriefs is empty")
	}
	if len(digest.Coverage) == 0 {
		return nil, errors.New("keyword digest coverage is empty")
	}
	if err := validateKeywordBriefs(digest.KeywordBriefs, "keyword digest keywordBriefs"); err != nil {
		return nil, err
	}
	if err := validateKeywordBriefs(digest.PushBrief.KeywordBriefs, "keyword digest pushBrief keywordBriefs"); err != nil {
		return nil, err
	}
	if err := validateCoverageRefs(digest.Coverage, "keyword digest coverage", isGoogleSourceRef); err != nil {
		return nil, err
	}
	return &digest, nil
}

func validatePublicDigestItems(items []DigestItem, field string) error {
	for _, item := range items {
		for _, ref := range item.SourceRefs {
			if isGoogleSourceRef(ref) {
				return fmt.Errorf("%s contains google source ref %s", field, ref)
			}
		}
	}
	return nil
}

func validateTopicBriefs(briefs []TopicBrief, field string) error {
	for _, brief := range briefs {
		for _, ref := range brief.SourceRefs {
			if isGoogleSourceRef(ref) {
				return fmt.Errorf("%s contains google source ref %s", field, ref)
			}
		}
	}
	return nil
}

func validateKeywordBriefs(briefs []KeywordBrief, field string) error {
	for _, brief := range briefs {
		for _, ref := range brief.SourceRefs {
			if !isGoogleSourceRef(ref) {
				return fmt.Errorf("%s contains non-google source ref %s", field, ref)
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

func isGoogleSourceRef(ref string) bool {
	return strings.HasPrefix(ref, "google:")
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

	publicReport := *report
	publicReport.GoogleNews = nil
	digest, err := generatePublicDayDigest(&publicReport, chat)
	if err != nil {
		return nil, err
	}

	if reportHasGoogleNews(report) {
		keywordDigest, err := generateDayKeywordDigest(report, chat)
		if err != nil {
			return nil, err
		}
		digest.KeywordBriefs = keywordDigest.KeywordBriefs
		digest.PushBrief.KeywordBriefs = keywordDigest.PushBrief.KeywordBriefs
		digest.Coverage = append(digest.Coverage, keywordDigest.Coverage...)
	}

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

func generateDayKeywordDigest(report *DayReport, chat digestChat) (*dayKeywordDigest, error) {
	input := buildDayDigestPromptInput(report)
	prompt := buildDayKeywordDigestPrompt(input.Google)
	response, err := chat.Chat(prompt)
	if err == nil {
		digest, parseErr := parseAndValidateDayKeywordDigest(report, response)
		if parseErr == nil {
			return digest, nil
		}
		err = parseErr
	}

	repairPrompt := buildDayKeywordDigestRepairPrompt(prompt, response, err)
	repairedResponse, repairErr := chat.Chat(repairPrompt)
	if repairErr != nil {
		return nil, errors.Join(errors.New("keyword digest repair chat error"), err, repairErr)
	}
	digest, parseErr := parseAndValidateDayKeywordDigest(report, repairedResponse)
	if parseErr != nil {
		return nil, errors.Join(errors.New("keyword digest repair validation error"), err, parseErr)
	}

	return digest, nil
}
