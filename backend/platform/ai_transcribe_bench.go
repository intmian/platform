package platform

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	aiv2 "github.com/intmian/mian_go_lib/tool/ai/v2"
	"github.com/intmian/platform/backend/share"
)

// 管理后台的“转写对比”页用：绕过“语音转写”策略，直接指定调用协议和模型名，
// 密钥和转发地址借用配置里同一家厂商的 provider。模型名可以不在配置里，方便试新模型。

const maxBenchModelNameLen = 128

// benchSTTVendor 把调用协议归到厂商，用来找该用哪个 provider 的密钥。
func benchSTTVendor(protocol aiv2.ModelCallProtocol) string {
	switch protocol {
	case aiv2.ModelCallProtocolOpenAIRealtimeSTT, aiv2.ModelCallProtocolOpenAISTT:
		return "openai"
	case aiv2.ModelCallProtocolDashScopeFunASR, aiv2.ModelCallProtocolDashScopeFunASRRealtime, aiv2.ModelCallProtocolDashScopeQwen3ASR:
		return "dashscope"
	}
	return ""
}

func (m *webMgr) resolveBenchSTTItem(protocol aiv2.ModelCallProtocol, model string) (share.AIResolvedQueueItem, error) {
	model = strings.TrimSpace(model)
	if model == "" || len(model) > maxBenchModelNameLen {
		return share.AIResolvedQueueItem{}, errors.New("invalid model")
	}
	vendor := benchSTTVendor(protocol)
	if vendor == "" {
		return share.AIResolvedQueueItem{}, fmt.Errorf("unsupported protocol %q", protocol)
	}
	config, err := share.GetAIPlatformConfig(m.plat.cfg)
	if err != nil {
		return share.AIResolvedQueueItem{}, errors.New("ai config error")
	}
	for _, provider := range config.Providers {
		if !benchProviderIsVendor(provider, vendor) {
			continue
		}
		return share.AIResolvedQueueItem{
			Provider: provider,
			Model: aiv2.ModelConfig{
				ID:           aiv2.ModelID("bench:" + model),
				Name:         model,
				Type:         aiv2.ModelTypeSTT,
				CallProtocol: protocol,
			},
		}, nil
	}
	return share.AIResolvedQueueItem{}, fmt.Errorf("no %s stt provider configured", vendor)
}

// benchProviderIsVendor 按地址认厂商：OpenAI 官方（地址留空即默认官方）和阿里百炼。
// 不能按“OpenAI 协议”认，OpenRouter 等转售商也是 OpenAI 协议。
func benchProviderIsVendor(provider share.AIProviderConfig, vendor string) bool {
	base := strings.ToLower(strings.TrimSpace(provider.BaseURL))
	switch vendor {
	case "openai":
		return provider.Protocol == share.AIProviderProtocolOpenAI && (base == "" || strings.Contains(base, "api.openai.com"))
	case "dashscope":
		return strings.Contains(base, "dashscope")
	}
	return false
}

type aiTranscribeBenchResp struct {
	Text       string `json:"text"`
	DurationMS int64  `json:"durationMS"`
}

// aiTranscribeBench 用指定模型转写一个文件（对比页里“整段录完再识别”的模型）。
func (m *webMgr) aiTranscribeBench(c *gin.Context) {
	valid := m.getValid(c)
	if !valid.HasOnePermission(share.PermissionAdmin) {
		c.JSON(http.StatusOK, makeErrReturn("no permission"))
		return
	}
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, maxAITranscribeUploadBytes)
	fileHeader, err := c.FormFile("file")
	if err != nil || fileHeader.Size <= 0 {
		c.JSON(http.StatusOK, makeErrReturn("audio file is required"))
		return
	}
	protocol := aiv2.ModelCallProtocol(strings.TrimSpace(c.PostForm("protocol")))
	item, err := m.resolveBenchSTTItem(protocol, c.PostForm("model"))
	if err != nil {
		c.JSON(http.StatusOK, makeErrReturn(err.Error()))
		return
	}
	file, err := fileHeader.Open()
	if err != nil {
		c.JSON(http.StatusOK, makeErrReturn("audio file open error"))
		return
	}
	defer file.Close()

	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Minute)
	defer cancel()
	startedAt := time.Now()
	ret, err := transcribeWithItem(ctx, item, protocol, strings.TrimSpace(item.Provider.Token), file, fileHeader.Filename, "zh", "")
	if err != nil && !isAITranscriptionEmptyError(err) {
		c.JSON(http.StatusOK, makeErrReturn(err.Error()))
		return
	}
	c.JSON(http.StatusOK, makeOkReturn(aiTranscribeBenchResp{
		Text:       strings.TrimSpace(ret.Text),
		DurationMS: time.Since(startedAt).Milliseconds(),
	}))
}
