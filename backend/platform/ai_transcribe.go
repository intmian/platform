package platform

import (
	"context"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/gin-gonic/gin"
	"github.com/intmian/mian_go_lib/tool/ai"
	aiv2 "github.com/intmian/mian_go_lib/tool/ai/v2"
	"github.com/intmian/platform/backend/share"
)

const (
	maxAITranscribeUploadBytes = 250 << 20
	maxAITranscribePromptRunes = 4000
	maxAITranscribeLanguageLen = 32
)

var errAITranscriptionEmpty = errors.New("empty transcription")

func isAITranscriptionEmptyError(err error) bool {
	if err == nil {
		return false
	}
	return errors.Is(err, errAITranscriptionEmpty) || strings.TrimSpace(err.Error()) == "openai-empty"
}

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
	ret, err := m.transcribeAI(ctx, file, fileHeader.Filename, language, prompt)
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

func (m *webMgr) transcribeAI(ctx context.Context, file io.ReadSeeker, fileName string, language string, prompt string) (ai.TranscriptionResult, error) {
	aiCfg, err := share.GetAIPlatformConfig(m.plat.cfg)
	if err != nil {
		return ai.TranscriptionResult{}, errors.New("ai config error")
	}
	queueID, err := aiCfg.QueueIDForScene(share.AISceneTranscribe, aiv2.ModelTypeSTT)
	if err != nil || strings.TrimSpace(queueID) == "" {
		return ai.TranscriptionResult{}, errors.New("stt queue is not configured")
	}
	ret, _, err := m.transcribeQueue(ctx, aiCfg, queueID, file, fileName, language, prompt)
	return ret, err
}

func (m *webMgr) transcribeQueue(ctx context.Context, aiCfg share.AIPlatformConfig, queueID string, file io.ReadSeeker, fileName string, language string, prompt string) (ai.TranscriptionResult, share.AIQueueRunMeta, error) {
	var meta share.AIQueueRunMeta
	var err error
	aiCfg, err = share.NormalizeAIPlatformConfig(aiCfg)
	if err != nil {
		return ai.TranscriptionResult{}, meta, err
	}
	items, err := aiCfg.ResolveQueue(queueID, aiv2.ModelTypeSTT)
	if err != nil {
		return ai.TranscriptionResult{}, meta, err
	}
	var errs []error
	for _, item := range items {
		startedAt := time.Now()
		attempt := share.AIQueueAttempt{ProviderID: item.Provider.ID, ModelID: item.Model.ID}
		if _, err := file.Seek(0, io.SeekStart); err != nil {
			return ai.TranscriptionResult{}, meta, errors.New("audio file seek error")
		}
		base := strings.TrimSpace(item.Provider.BaseURL)
		token := strings.TrimSpace(item.Provider.Token)
		model := strings.TrimSpace(item.Model.Name)
		label := fmt.Sprintf("%s/%s", item.Provider.ID, item.Model.ID)
		if token == "" || token == "need input" {
			attempt.Error = "provider token is empty"
			attempt.DurationMS = time.Since(startedAt).Milliseconds()
			meta.Attempts = append(meta.Attempts, attempt)
			errs = append(errs, fmt.Errorf("%s: %s", label, attempt.Error))
			continue
		}
		if model == "" {
			attempt.Error = "stt model is empty"
			attempt.DurationMS = time.Since(startedAt).Milliseconds()
			meta.Attempts = append(meta.Attempts, attempt)
			errs = append(errs, fmt.Errorf("%s: %s", label, attempt.Error))
			continue
		}
		callProtocol, protocolErr := share.ResolveAIModelCallProtocol(item.Provider.Protocol, item.Model)
		if protocolErr != nil {
			attempt.Error = protocolErr.Error()
			attempt.DurationMS = time.Since(startedAt).Milliseconds()
			meta.Attempts = append(meta.Attempts, attempt)
			errs = append(errs, fmt.Errorf("%s: %w", label, protocolErr))
			continue
		}

		var ret ai.TranscriptionResult
		switch callProtocol {
		case aiv2.ModelCallProtocolOpenAISTT:
			if isOpenRouterBaseURL(base) {
				ret, err = transcribeOpenRouter(ctx, base, token, file, fileName, model, language)
			} else {
				bot := ai.NewOpenAIWithModels(base, token, false, model)
				if bot == nil {
					err = errors.New("openai init error")
				} else {
					ret, err = bot.Transcribe(ctx, file, ai.TranscriptionRequest{
						Model:    model,
						Language: language,
						Prompt:   prompt,
					})
				}
			}
		case aiv2.ModelCallProtocolDashScopeFunASR:
			ret, err = transcribeDashScopeFunASR(ctx, base, token, file, fileName, model)
		case aiv2.ModelCallProtocolDashScopeQwen3ASR:
			ret, err = transcribeDashScopeQwen3ASR(ctx, base, token, file, fileName, model, language)
		default:
			err = fmt.Errorf("unsupported stt call protocol %q", callProtocol)
		}
		if err == nil || isAITranscriptionEmptyError(err) {
			ret.Text = strings.TrimSpace(ret.Text)
			attempt.Success = true
			attempt.DurationMS = time.Since(startedAt).Milliseconds()
			meta.Attempts = append(meta.Attempts, attempt)
			meta.ProviderID = item.Provider.ID
			meta.ModelID = item.Model.ID
			return ret, meta, nil
		}
		if m.plat != nil && m.plat.log != nil {
			m.plat.log.Warning("PLAT", "ai transcribe upstream error [%s]: %s", label, err.Error())
		}
		attempt.Error = err.Error()
		attempt.DurationMS = time.Since(startedAt).Milliseconds()
		meta.Attempts = append(meta.Attempts, attempt)
		errs = append(errs, fmt.Errorf("%s: %w", label, err))
	}
	if len(errs) == 0 {
		err = errors.New("stt queue is empty")
		meta.Error = err.Error()
		return ai.TranscriptionResult{}, meta, err
	}
	err = errors.Join(errs...)
	meta.Error = err.Error()
	return ai.TranscriptionResult{}, meta, err
}
