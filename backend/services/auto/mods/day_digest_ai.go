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

const dayDigestFailureSummary = "今日摘要生成失败，原始日报已保存，请打开完整日报查看。"

// dayPushNewsCount 是推送里放几条重要新闻：AI 只给一份按重要性排好的列表，推送取前几条。
const dayPushNewsCount = 5

type dayDigestPromptInput struct {
	BBC []digestPromptNews `json:"bbc"`
	NYT []digestPromptNews `json:"nyt"`
}

type digestPromptNews struct {
	Ref         string `json:"ref"`
	Title       string `json:"title"`
	Description string `json:"description,omitempty"`
}

// dayDigestAIOutput 是让 AI 返回的最小结构，解析后再展开成 DayDigest。
// 概要只有一份，推送和页面共用；天气行由代码填，不经过 AI。
type dayDigestAIOutput struct {
	Overview string            `json:"overview"`
	News     []dayDigestAINews `json:"news"`
}

type dayDigestAINews struct {
	Title   string   `json:"title"`
	Summary string   `json:"summary"`
	Refs    []string `json:"refs"`
}

func buildDayDigestPromptInput(report *DayReport) dayDigestPromptInput {
	input := dayDigestPromptInput{}
	if report == nil {
		return input
	}

	input.BBC = make([]digestPromptNews, 0, len(report.BbcNews))
	for i, item := range report.BbcNews {
		input.BBC = append(input.BBC, digestPromptNews{
			Ref:         fmt.Sprintf("bbc:%d", i),
			Title:       item.Title,
			Description: item.Description,
		})
	}

	input.NYT = make([]digestPromptNews, 0, len(report.NytNews))
	for i, item := range report.NytNews {
		input.NYT = append(input.NYT, digestPromptNews{
			Ref:         fmt.Sprintf("nyt:%d", i),
			Title:       item.Title,
			Description: item.Description,
		})
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

func buildDayDigestPrompt(input dayDigestPromptInput) string {
	// 紧凑 JSON，省输入 token
	payload, err := json.Marshal(input)
	if err != nil {
		payload = []byte("{}")
	}
	return `你是中文新闻编辑，把下面的外媒新闻整理成给中国读者看的今日要闻，读者在手机上看。

只返回一个 JSON 对象，不要代码块或解释：
{"overview":"string","news":[{"title":"string","summary":"string","refs":["bbc:0"]}]}

overview（今日概览）：
- 150-220 字，一段话，2-4 句。先讲当天最重要的一两件事，再用一两句带过其他值得知道的动态。
- 直接讲发生了什么，像新闻导语。不要写"本轮新闻""BBC 和纽约时报报道了""新闻主要集中在"这类描述来源或输入的话，也不要出现媒体名。
- 示意格式（内容是虚构的，不要照抄）："美联储宣布降息 25 个基点，为年内第二次，并暗示后续节奏会放缓；欧洲市场随之走高。中东方面，停火谈判在开罗重启，但双方在撤军时间表上仍有分歧。另外，日本首相宣布提前解散众院，大选定于下月举行。"

news（重要新闻）：
- 6-10 条，按重要性从高到低排，前 5 条会单独推送。同一件事的多篇报道合成一条。
- title 不超过 18 字，直接说事实，不加"重磅""突发"之类的修饰；summary 不超过 60 字，补充关键细节。
- refs 写这条依据的输入 ref（bbc:n 或 nyt:n），只能用输入里有的。

通用：语言克制准确，不评价，不编造输入里没有的事实。

新闻输入：
` + string(payload)
}

func buildDayDigestRepairPrompt(originalPrompt, response string, validationErr error) string {
	return fmt.Sprintf(`上一轮输出不符合要求，请修复后只返回 JSON 对象，不要代码块或解释。
overview 不能为空；news 至少一条，每条的 refs 只能用原始输入里的 bbc:n 或 nyt:n。

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

	var out dayDigestAIOutput
	if err := json.Unmarshal([]byte(raw), &out); err != nil {
		return nil, errors.Join(errors.New("day digest json unmarshal error"), err)
	}

	return validateDayDigest(report, expandDayDigest(report, out))
}

// expandDayDigest 把 AI 的最小输出展开成页面和推送用的 DayDigest。
func expandDayDigest(report *DayReport, out dayDigestAIOutput) *DayDigest {
	news := make([]DigestItem, 0, len(out.News))
	for _, item := range out.News {
		news = append(news, DigestItem{Title: item.Title, Summary: item.Summary, SourceRefs: item.Refs})
	}
	news = normalizeDigestItems(report, news)
	overview := strings.TrimSpace(out.Overview)

	pushNews := news
	if len(pushNews) > dayPushNewsCount {
		pushNews = pushNews[:dayPushNewsCount]
	}

	return &DayDigest{
		PushBrief: DailyPushBrief{
			WeatherLine:   buildDayDigestWeatherLine(report),
			Overview:      overview,
			ImportantNews: append([]DigestItem(nil), pushNews...),
		},
		Overview:      overview,
		ImportantNews: news,
	}
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
		return nil, errors.New("day digest news is empty")
	}
	if err := validatePublicDigestItems(normalized.ImportantNews, "day digest news"); err != nil {
		return nil, err
	}
	if err := validateKeywordBriefs(normalized.KeywordBriefs, "day digest keywordBriefs"); err != nil {
		return nil, err
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
