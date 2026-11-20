package share

import (
	"context"
	"net"
	"net/http"
	"time"

	ai "github.com/intmian/mian_go_lib/tool/ai/v2"
)

// 队列里的服务商可能是家里的中转：断网或公网 IP 刚变时，连接请求发出去不会被拒绝，而是一直没有回应。
// 默认客户端要等 30 秒才算连接失败，SDK 还会再重试 2 次，一个模型就要卡约 92 秒，备用模型轮不上。
// 所以连接阶段要快速失败；等待回答不能设短超时（非流式调用要等整段回答生成完才返回），改用每个模型的时间份额兜底。
const (
	aiConnectTimeout      = 5 * time.Second
	aiTLSHandshakeTimeout = 5 * time.Second
	// aiQueueDefaultTimeout 是调用方没给时限时整个队列的总时限（例如 SceneAI.Chat）。
	aiQueueDefaultTimeout = 10 * time.Minute
	aiQueueRetryDelay     = time.Second
)

var aiHTTPClient = &http.Client{
	Transport: &http.Transport{
		Proxy: http.ProxyFromEnvironment,
		DialContext: (&net.Dialer{
			Timeout:   aiConnectTimeout,
			KeepAlive: 30 * time.Second,
		}).DialContext,
		ForceAttemptHTTP2:     true,
		MaxIdleConns:          100,
		IdleConnTimeout:       90 * time.Second,
		TLSHandshakeTimeout:   aiTLSHandshakeTimeout,
		ExpectContinueTimeout: time.Second,
	},
}

// aiProviderOptions 让 SDK 不再自动重试：连接失败直接换下一个模型，收到 429/5xx 时由队列自己重试一次。
func aiProviderOptions() []ai.ProviderOption {
	return []ai.ProviderOption{ai.WithHTTPClient(aiHTTPClient), ai.WithMaxRetries(0)}
}

// withAIQueueDeadline 给没有时限的调用补上默认总时限。
func withAIQueueDeadline(ctx context.Context) (context.Context, context.CancelFunc) {
	if _, ok := ctx.Deadline(); ok {
		return context.WithCancel(ctx)
	}
	return context.WithTimeout(ctx, aiQueueDefaultTimeout)
}

// aiAttemptContext 给队列里的一个模型分配时间：不是最后一个时最多用剩余时间的一半，
// 这样它连上后卡住也会给后面的备用模型留出时间；最后一个可以用完剩余时间。
func aiAttemptContext(ctx context.Context, isLast bool) (context.Context, context.CancelFunc) {
	deadline, ok := ctx.Deadline()
	if !ok || isLast {
		return context.WithCancel(ctx)
	}
	return context.WithTimeout(ctx, time.Until(deadline)/2)
}

// isRetryableAIStatus 判断上游的 HTTP 错误是否值得在同一个模型上再试一次。
func isRetryableAIStatus(err error) bool {
	status, ok := ai.HTTPStatusFromError(err)
	if !ok {
		return false
	}
	return status == http.StatusRequestTimeout ||
		status == http.StatusConflict ||
		status == http.StatusTooManyRequests ||
		status >= http.StatusInternalServerError
}

// chatWithRetry 在同一个模型上最多重试一次（仅限 429/5xx 这类上游有回应的临时错误）。
func chatWithRetry(ctx context.Context, provider *ai.OpenAIProvider, req ai.ChatRequest) (ai.ChatResponse, error) {
	resp, err := provider.Chat(ctx, req)
	if err == nil || !isRetryableAIStatus(err) {
		return resp, err
	}
	select {
	case <-ctx.Done():
		return resp, err
	case <-time.After(aiQueueRetryDelay):
	}
	return provider.Chat(ctx, req)
}
