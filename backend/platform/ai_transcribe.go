package platform

import (
	"context"
	"errors"
	"io"
	"net/http"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/gin-gonic/gin"
	"github.com/intmian/mian_go_lib/tool/ai"
	"github.com/intmian/platform/backend/share"
)

const (
	maxAITranscribeUploadBytes = 250 << 20
	maxAITranscribePromptRunes = 4000
	maxAITranscribeLanguageLen = 32
)

func (m *webMgr) aiTranscribe(c *gin.Context) {
	valid := m.getValid(c)
	if !valid.HasOnePermission(share.PermissionAdmin, share.PermissionAI) {
		c.JSON(200, makeErrReturn("no permission"))
		return
	}

	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, maxAITranscribeUploadBytes)
	fileHeader, err := c.FormFile("file")
	if err != nil {
		if strings.Contains(err.Error(), "request body too large") {
			c.JSON(200, makeErrReturn("audio file is too large"))
			return
		}
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

	ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Minute)
	defer cancel()
	ret, err := m.transcribeAI(ctx, file, language, prompt)
	if err != nil {
		c.JSON(200, makeErrReturn(err.Error()))
		return
	}

	c.JSON(200, makeOkReturn(aiTranscribeResp{
		Text:     ret.Text,
		Language: ret.Language,
		Duration: ret.Duration,
	}))
}

func (m *webMgr) transcribeAI(ctx context.Context, file io.Reader, language string, prompt string) (ai.TranscriptionResult, error) {
	aiCfg, err := share.GetAIConfig(m.plat.cfg)
	if err != nil {
		return ai.TranscriptionResult{}, errors.New("openai config error")
	}
	if aiCfg.Base == "" || aiCfg.Base == "need input" {
		return ai.TranscriptionResult{}, errors.New("openai.base is empty")
	}
	if aiCfg.Token == "" || aiCfg.Token == "need input" {
		return ai.TranscriptionResult{}, errors.New("openai.token is empty")
	}
	if strings.TrimSpace(aiCfg.AudioModel) == "" {
		return ai.TranscriptionResult{}, errors.New("openai.audio.model is empty")
	}

	bot := ai.NewOpenAIWithModels(aiCfg.Base, aiCfg.Token, false, aiCfg.AudioModel)
	if bot == nil {
		return ai.TranscriptionResult{}, errors.New("openai init error")
	}

	ret, err := bot.Transcribe(ctx, file, ai.TranscriptionRequest{
		Model:    aiCfg.AudioModel,
		Language: language,
		Prompt:   prompt,
	})
	if err != nil {
		if m.plat != nil && m.plat.log != nil {
			m.plat.log.Warning("PLAT", "ai transcribe upstream error: %s", err.Error())
		}
		return ai.TranscriptionResult{}, errors.New("svr error")
	}
	return ret, nil
}
