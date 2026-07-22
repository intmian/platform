package platform

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/gin-gonic/gin"
	aiv2 "github.com/intmian/mian_go_lib/tool/ai/v2"
	"github.com/intmian/platform/backend/share"
)

const maxAIQueueTestInputRunes = 100000

type aiQueueTestResp struct {
	Type       aiv2.ModelType `json:"type"`
	OutputText string         `json:"outputText,omitempty"`
	Language   string         `json:"language,omitempty"`
	Duration   float64        `json:"duration,omitempty"`
	share.AIQueueRunMeta
}

func (m *webMgr) aiConfigGet(c *gin.Context) {
	if !m.canManageAIConfig(c) {
		c.JSON(200, makeErrReturn("no permission"))
		return
	}
	config, err := share.GetAIPlatformConfig(m.plat.cfg)
	if err != nil {
		c.JSON(200, makeErrReturn(err.Error()))
		return
	}
	c.JSON(200, makeOkReturn(config))
}

func (m *webMgr) aiConfigSet(c *gin.Context) {
	if !m.canManageAIConfig(c) {
		c.JSON(200, makeErrReturn("no permission"))
		return
	}
	var config share.AIPlatformConfig
	if err := c.ShouldBindJSON(&config); err != nil {
		c.JSON(200, makeErrReturn("invalid ai config"))
		return
	}
	if err := share.SaveAIPlatformConfig(m.plat.cfg, config); err != nil {
		c.JSON(200, makeErrReturn(err.Error()))
		return
	}
	m.plat.log.Info("PLAT", "ai config updated: providers=%d queues=%d businesses=%d", len(config.Providers), len(config.Queues), len(config.Businesses))
	c.JSON(200, makeOkReturn(nil))
}

func (m *webMgr) aiQueueTest(c *gin.Context) {
	if !m.canManageAIConfig(c) {
		c.JSON(200, makeErrReturn("no permission"))
		return
	}
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, maxAITranscribeUploadBytes)

	var config share.AIPlatformConfig
	if err := json.Unmarshal([]byte(c.PostForm("config")), &config); err != nil {
		c.JSON(200, makeErrReturn("invalid ai config"))
		return
	}
	config, err := share.NormalizeAIPlatformConfig(config)
	if err != nil {
		c.JSON(200, makeErrReturn(err.Error()))
		return
	}
	queueID := strings.TrimSpace(c.PostForm("queueID"))
	var queue *share.AIModelQueue
	for i := range config.Queues {
		if config.Queues[i].ID == queueID {
			queue = &config.Queues[i]
			break
		}
	}
	if queue == nil {
		c.JSON(200, makeErrReturn("ai queue not found"))
		return
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Minute)
	defer cancel()
	switch queue.Type {
	case aiv2.ModelTypeText:
		input := c.PostForm("input")
		if strings.TrimSpace(input) == "" {
			c.JSON(200, makeErrReturn("text queue input is required"))
			return
		}
		if utf8.RuneCountInString(input) > maxAIQueueTestInputRunes {
			c.JSON(200, makeErrReturn("text queue input is too long"))
			return
		}
		result, _ := config.RunTextQueueContext(ctx, queueID, input)
		c.JSON(200, makeOkReturn(aiQueueTestResp{
			Type:           queue.Type,
			OutputText:     result.Text,
			AIQueueRunMeta: result.AIQueueRunMeta,
		}))
	case aiv2.ModelTypeSTT:
		fileHeader, err := c.FormFile("file")
		if err != nil {
			c.JSON(200, makeErrReturn("audio file is required"))
			return
		}
		if fileHeader.Size <= 0 {
			c.JSON(200, makeErrReturn("audio file is empty"))
			return
		}
		if fileHeader.Size > maxAITranscribeUploadBytes {
			c.JSON(200, makeErrReturn("audio file is too large"))
			return
		}
		language := strings.TrimSpace(c.PostForm("language"))
		if len(language) > maxAITranscribeLanguageLen {
			c.JSON(200, makeErrReturn("language is too long"))
			return
		}
		prompt := strings.TrimSpace(c.PostForm("prompt"))
		if utf8.RuneCountInString(prompt) > maxAITranscribePromptRunes {
			c.JSON(200, makeErrReturn("prompt is too long"))
			return
		}
		file, err := fileHeader.Open()
		if err != nil {
			c.JSON(200, makeErrReturn("audio file open error"))
			return
		}
		defer file.Close()
		result, meta, _ := m.transcribeQueue(ctx, config, queueID, file, fileHeader.Filename, language, prompt)
		c.JSON(200, makeOkReturn(aiQueueTestResp{
			Type:           queue.Type,
			OutputText:     result.Text,
			Language:       result.Language,
			Duration:       result.Duration,
			AIQueueRunMeta: meta,
		}))
	default:
		c.JSON(200, makeErrReturn("unsupported ai queue type"))
	}
}

func (m *webMgr) canManageAIConfig(c *gin.Context) bool {
	valid := m.getValid(c)
	return valid.HasPermission(share.PermissionAdmin) || valid.HasPermission("plat.cfg")
}
