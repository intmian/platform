package platform

import (
	"encoding/json"
	"errors"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/intmian/platform/backend/share"
)

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
		content := strings.TrimSpace(note.Content)
		if content == "" {
			continue
		}
		notes = append(notes, libraryReviewDigestNote{
			Time:    strings.TrimSpace(note.Time),
			Content: content,
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

	prompt := strings.Join([]string{
		"你是一个帮助用户整理作品体验笔记的中文写作助手。",
		"只基于输入备注提取信息，不要编造，不要评价备注作者。",
		"必须覆盖备注中的所有观点，不能因为观点数量多、文字长、表达重复就省略。",
		"输入备注可能来自语音输入，存在口癖、停顿、重复词、错别字或语音识别错误；请结合上下文做合理猜测和整理。",
		"如果某个词、对象、因果关系拿捏不准，请在对应 point 或 evidence 中用中文括号标注猜测，例如：（可能指模型质量）或（此处含义不确定）。",
		"point 可以长，不限制数量；需要完整保留观点含义，但要把口癖和无意义重复清理掉。",
		"evidence 放对应原备注依据，可以保留原文片段，方便用户回看来源。",
		"输出必须是合法 JSON，不要使用 Markdown 代码块。",
		"JSON 结构为：{\"positives\":[{\"point\":\"正面观点\",\"evidence\":\"原备注依据，可为空\"}],\"negatives\":[{\"point\":\"负面观点\",\"evidence\":\"原备注依据，可为空\"}],\"records\":[{\"point\":\"可记录的事实/事件/细节\",\"evidence\":\"原备注依据，可为空\"}]}。",
		"输入：",
		string(promptBytes),
	}, "\n")

	content, err := m.chatAI(share.AISceneLibraryReviewDigest, prompt)
	if err != nil {
		return libraryReviewDigestResp{}, err
	}

	var ret libraryReviewDigestResp
	if err := json.Unmarshal([]byte(extractJSONObject(content)), &ret); err != nil {
		return libraryReviewDigestResp{}, errors.New("ai response parse error")
	}
	return normalizeLibraryReviewDigestResp(ret), nil
}

func (m *webMgr) chatAI(scene share.AIScene, prompt string) (string, error) {
	chat, err := share.NewSceneAI(m.plat.cfg, scene)
	if err != nil {
		return "", err
	}
	content, err := chat.Chat(prompt)
	if err != nil {
		return "", err
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

func normalizeLibraryReviewDigestResp(ret libraryReviewDigestResp) libraryReviewDigestResp {
	ret.Positives = normalizeDigestPoints(ret.Positives)
	ret.Negatives = normalizeDigestPoints(ret.Negatives)
	ret.Records = normalizeDigestPoints(ret.Records)
	if len(ret.Positives) == 0 && len(ret.Negatives) == 0 && len(ret.Records) == 0 {
		return libraryReviewDigestResp{}
	}
	return ret
}

func normalizeDigestPoints(points []libraryReviewDigestPoint) []libraryReviewDigestPoint {
	if len(points) == 0 {
		return nil
	}
	result := make([]libraryReviewDigestPoint, 0, len(points))
	for _, point := range points {
		text := strings.TrimSpace(point.Point)
		if text == "" {
			continue
		}
		result = append(result, libraryReviewDigestPoint{
			Point:    text,
			Evidence: strings.TrimSpace(point.Evidence),
		})
	}
	return result
}
