package platform

import (
	"encoding/json"
	"errors"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/intmian/mian_go_lib/tool/ai"
	"github.com/intmian/platform/backend/share"
)

type aiAction string

const (
	aiActionLibraryReviewNotesDigest aiAction = "library.reviewNotesDigest"
	libraryReviewDigestMaxNotes               = 80
	libraryReviewDigestMaxNoteRunes           = 2000
)

type aiRunReq struct {
	Action  aiAction        `json:"action"`
	Payload json.RawMessage `json:"payload"`
}

type aiActionHandler struct {
	Permissions []share.Permission
	Run         func(json.RawMessage) (interface{}, error)
}

type libraryReviewNoteDigestPayload struct {
	Title     string                    `json:"title"`
	Category  string                    `json:"category"`
	Author    string                    `json:"author"`
	RoundName string                    `json:"roundName"`
	Notes     []libraryReviewDigestNote `json:"notes"`
}

type libraryReviewDigestNote struct {
	Time    string `json:"time"`
	Content string `json:"content"`
}

type libraryReviewDigestPoint struct {
	Point    string `json:"point"`
	Evidence string `json:"evidence,omitempty"`
}

type libraryReviewDigestDrafts struct {
	Main       []string `json:"main"`
	Objective  []string `json:"objective,omitempty"`
	Subjective []string `json:"subjective,omitempty"`
	Innovation []string `json:"innovation,omitempty"`
}

type libraryReviewDigestResp struct {
	Positives    []libraryReviewDigestPoint `json:"positives"`
	Negatives    []libraryReviewDigestPoint `json:"negatives"`
	Records      []libraryReviewDigestPoint `json:"records"`
	DraftPhrases libraryReviewDigestDrafts  `json:"draftPhrases"`
}

func (m *webMgr) aiRun(c *gin.Context) {
	var req aiRunReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(400, makeErrReturn("Invalid request"))
		return
	}

	handlers := m.aiActionHandlers()
	handler, ok := handlers[req.Action]
	if !ok {
		c.JSON(200, makeErrReturn("unknown ai action"))
		return
	}

	valid := m.getValid(c)
	permissions := append([]share.Permission{share.PermissionAdmin}, handler.Permissions...)
	if !valid.HasOnePermission(permissions...) {
		c.JSON(200, makeErrReturn("no permission"))
		return
	}

	ret, err := handler.Run(req.Payload)
	if err != nil {
		c.JSON(200, makeErrReturn(err.Error()))
		return
	}
	c.JSON(200, makeOkReturn(ret))
}

func (m *webMgr) aiActionHandlers() map[aiAction]aiActionHandler {
	return map[aiAction]aiActionHandler{
		aiActionLibraryReviewNotesDigest: {
			Permissions: []share.Permission{share.PermissionAI},
			Run: func(payload json.RawMessage) (interface{}, error) {
				return m.handleLibraryReviewNotesDigest(payload)
			},
		},
	}
}

func (m *webMgr) handleLibraryReviewNotesDigest(payload json.RawMessage) (libraryReviewDigestResp, error) {
	var req libraryReviewNoteDigestPayload
	if err := json.Unmarshal(payload, &req); err != nil {
		return libraryReviewDigestResp{}, errors.New("invalid payload")
	}

	notes := make([]libraryReviewDigestNote, 0, len(req.Notes))
	for _, note := range req.Notes {
		if len(notes) >= libraryReviewDigestMaxNotes {
			break
		}
		content := strings.TrimSpace(note.Content)
		if content == "" {
			continue
		}
		notes = append(notes, libraryReviewDigestNote{
			Time:    strings.TrimSpace(note.Time),
			Content: trimRunes(content, libraryReviewDigestMaxNoteRunes),
		})
	}
	if len(notes) == 0 {
		return libraryReviewDigestResp{}, errors.New("empty notes")
	}
	req.Notes = notes

	promptBytes, err := json.Marshal(req)
	if err != nil {
		return libraryReviewDigestResp{}, errors.New("invalid payload")
	}

	prompt := "你是一个帮助用户整理作品体验笔记的中文写作助手。请只基于输入备注提取信息，不要编造。输出必须是合法 JSON，不要使用 Markdown 代码块。JSON 结构为：{\"positives\":[{\"point\":\"正面观点\",\"evidence\":\"原备注依据，可为空\"}],\"negatives\":[{\"point\":\"负面观点\",\"evidence\":\"原备注依据，可为空\"}],\"records\":[{\"point\":\"可记录的事实/事件/细节\",\"evidence\":\"原备注依据，可为空\"}],\"draftPhrases\":{\"main\":[\"可直接放入总评的短句\"],\"objective\":[\"客观维度短句\"],\"subjective\":[\"主观维度短句\"],\"innovation\":[\"创新维度短句\"]}}。每组最多 6 条，短句自然克制，保留用户原本的判断语气。\n输入：\n" + string(promptBytes)

	content, err := m.chatAI(share.AISceneLibraryReviewDigest, ai.ModelModeCheap, prompt)
	if err != nil {
		return libraryReviewDigestResp{}, err
	}

	var ret libraryReviewDigestResp
	if err := json.Unmarshal([]byte(extractJSONObject(content)), &ret); err != nil {
		return buildLibraryReviewDigestFallback(req), nil
	}
	return normalizeLibraryReviewDigestResp(ret, req), nil
}

func (m *webMgr) chatAI(scene share.AIScene, fallback ai.ModelMode, prompt string) (string, error) {
	aiCfg, err := share.GetAIConfig(m.plat.cfg)
	if err != nil {
		return "", errors.New("openai config error")
	}
	if aiCfg.Base == "" || aiCfg.Base == "need input" {
		return "", errors.New("openai.base is empty")
	}
	if aiCfg.Token == "" || aiCfg.Token == "need input" {
		return "", errors.New("openai.token is empty")
	}

	mode := aiCfg.ModeForScene(scene, fallback)
	bot := ai.NewOpenAIWithMode(aiCfg.Base, aiCfg.Token, mode, aiCfg.ModelPools)
	if bot == nil {
		return "", errors.New("openai init error")
	}

	content, err := bot.Chat(prompt)
	if err != nil {
		return "", errors.New("svr error")
	}
	return content, nil
}

func extractJSONObject(content string) string {
	trimmed := strings.TrimSpace(content)
	if strings.HasPrefix(trimmed, "```") {
		trimmed = strings.TrimPrefix(trimmed, "```json")
		trimmed = strings.TrimPrefix(trimmed, "```")
		trimmed = strings.TrimSuffix(trimmed, "```")
		trimmed = strings.TrimSpace(trimmed)
	}

	start := strings.Index(trimmed, "{")
	end := strings.LastIndex(trimmed, "}")
	if start >= 0 && end >= start {
		return trimmed[start : end+1]
	}
	return trimmed
}

func trimRunes(content string, maxRunes int) string {
	if maxRunes <= 0 {
		return ""
	}
	runes := []rune(content)
	if len(runes) <= maxRunes {
		return content
	}
	return string(runes[:maxRunes])
}

func normalizeLibraryReviewDigestResp(ret libraryReviewDigestResp, req libraryReviewNoteDigestPayload) libraryReviewDigestResp {
	ret.Positives = limitDigestPoints(ret.Positives, 6)
	ret.Negatives = limitDigestPoints(ret.Negatives, 6)
	ret.Records = limitDigestPoints(ret.Records, 6)
	ret.DraftPhrases.Main = limitStrings(ret.DraftPhrases.Main, 6)
	ret.DraftPhrases.Objective = limitStrings(ret.DraftPhrases.Objective, 6)
	ret.DraftPhrases.Subjective = limitStrings(ret.DraftPhrases.Subjective, 6)
	ret.DraftPhrases.Innovation = limitStrings(ret.DraftPhrases.Innovation, 6)
	if len(ret.Positives) == 0 && len(ret.Negatives) == 0 && len(ret.Records) == 0 && len(ret.DraftPhrases.Main) == 0 {
		return buildLibraryReviewDigestFallback(req)
	}
	return ret
}

func buildLibraryReviewDigestFallback(req libraryReviewNoteDigestPayload) libraryReviewDigestResp {
	records := make([]libraryReviewDigestPoint, 0, 6)
	for _, note := range req.Notes {
		content := strings.TrimSpace(note.Content)
		if content == "" {
			continue
		}
		records = append(records, libraryReviewDigestPoint{
			Point:    trimRunes(content, 80),
			Evidence: trimRunes(content, 120),
		})
		if len(records) >= 6 {
			break
		}
	}

	title := strings.TrimSpace(req.Title)
	if title == "" {
		title = "这部作品"
	}
	mainPhrase := title + "留下了一些明确体验点，可以结合当前周目备注继续整理评价。"
	if len(records) > 0 {
		mainPhrase = records[0].Point
	}

	return libraryReviewDigestResp{
		Records: records,
		DraftPhrases: libraryReviewDigestDrafts{
			Main: []string{mainPhrase},
		},
	}
}

func limitDigestPoints(points []libraryReviewDigestPoint, max int) []libraryReviewDigestPoint {
	if max <= 0 || len(points) == 0 {
		return nil
	}
	result := make([]libraryReviewDigestPoint, 0, max)
	for _, point := range points {
		text := strings.TrimSpace(point.Point)
		if text == "" {
			continue
		}
		result = append(result, libraryReviewDigestPoint{
			Point:    trimRunes(text, 120),
			Evidence: trimRunes(strings.TrimSpace(point.Evidence), 160),
		})
		if len(result) >= max {
			break
		}
	}
	return result
}

func limitStrings(items []string, max int) []string {
	if max <= 0 || len(items) == 0 {
		return nil
	}
	result := make([]string, 0, max)
	for _, item := range items {
		text := strings.TrimSpace(item)
		if text == "" {
			continue
		}
		result = append(result, trimRunes(text, 120))
		if len(result) >= max {
			break
		}
	}
	return result
}
