package share

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	ai "github.com/intmian/mian_go_lib/tool/ai/v2"
)

const (
	aiWebSearchAttempts = 2
	aiWebSearchTimeout  = 60 * time.Second
)

// 变量而不是常量：测试里置 0，避免等待。
var aiWebSearchRetryDelay = 2 * time.Second

// AIWebSearchRequest 是一次联网搜索。Query 可以带服务商支持的搜索语法，例如 after:、before:。
type AIWebSearchRequest struct {
	Query string
	Count int
	// Question 是触发搜索的原始问题，帮助搜索引擎理解查询。
	Question string
}

type AIWebSearchResult struct {
	Title    string `json:"title"`
	URL      string `json:"url"`
	Snippet  string `json:"snippet"`
	Summary  string `json:"summary"`
	SiteName string `json:"site_name"`
	// Date 是 UTC 的 RFC 3339 时间，未知时为空。
	Date string `json:"date"`
	// Authority 是来源权威等级：0 到 4，-1 表示未知。
	Authority int `json:"authority"`
}

// AIWebSearchQueueResponse 带上命中的模型和每次尝试，和文本、转写队列的结果一致。
type AIWebSearchQueueResponse struct {
	AIQueueRunMeta
	Results []AIWebSearchResult
}

// RunWebSearchScene 用业务绑定的搜索队列执行一次搜索。
func (c AIPlatformConfig) RunWebSearchScene(ctx context.Context, scene AIScene, req AIWebSearchRequest) (AIWebSearchQueueResponse, error) {
	queueID, err := c.QueueIDForScene(scene, ai.ModelTypeSearch)
	if err != nil {
		return AIWebSearchQueueResponse{}, err
	}
	return c.RunWebSearchQueue(ctx, queueID, req)
}

// RunWebSearchQueue 按队列顺序逐个尝试搜索服务，第一个成功的返回；没有搜到结果也算成功。
func (c AIPlatformConfig) RunWebSearchQueue(ctx context.Context, queueID string, req AIWebSearchRequest) (AIWebSearchQueueResponse, error) {
	var ret AIWebSearchQueueResponse
	if strings.TrimSpace(req.Query) == "" {
		return ret, errors.New("web search query is required")
	}
	config, err := NormalizeAIPlatformConfig(c)
	if err != nil {
		return ret, err
	}
	items, err := config.ResolveQueue(queueID, ai.ModelTypeSearch)
	if err != nil {
		return ret, err
	}
	var errs []error
	for _, item := range items {
		startedAt := time.Now()
		attempt := AIQueueAttempt{ProviderID: item.Provider.ID, ModelID: item.Model.ID}
		results, err := runWebSearchItem(ctx, item, req)
		attempt.DurationMS = time.Since(startedAt).Milliseconds()
		if err != nil {
			attempt.Error = err.Error()
			ret.Attempts = append(ret.Attempts, attempt)
			errs = append(errs, fmt.Errorf("%s/%s: %w", item.Provider.ID, item.Model.ID, err))
			continue
		}
		attempt.Success = true
		ret.Attempts = append(ret.Attempts, attempt)
		ret.ProviderID = item.Provider.ID
		ret.ModelID = item.Model.ID
		ret.Results = results
		return ret, nil
	}
	if len(errs) == 0 {
		err = fmt.Errorf("ai queue %q is empty", queueID)
	} else {
		err = errors.Join(errs...)
	}
	ret.Error = err.Error()
	return ret, err
}

func runWebSearchItem(ctx context.Context, item AIResolvedQueueItem, req AIWebSearchRequest) ([]AIWebSearchResult, error) {
	token := strings.TrimSpace(item.Provider.Token)
	if token == "" || token == "need input" {
		return nil, errors.New("provider token is empty")
	}
	protocol, err := ResolveAIModelCallProtocol(item.Provider.Protocol, item.Model)
	if err != nil {
		return nil, err
	}
	switch protocol {
	case ai.ModelCallProtocolDeepSeekSearch:
		return searchDeepSeek(ctx, item.Provider.RequestBaseURL(), token, req)
	default:
		return nil, fmt.Errorf("unsupported web search call protocol %q", protocol)
	}
}

// searchDeepSeek 调用 DeepSeek Search API。只有成功且有结果的请求计费，所以限流和服务端错误可以放心重试一次。
func searchDeepSeek(ctx context.Context, baseURL, token string, req AIWebSearchRequest) ([]AIWebSearchResult, error) {
	payload := map[string]any{"query": req.Query}
	if req.Count > 0 {
		payload["count"] = req.Count
	}
	if strings.TrimSpace(req.Question) != "" {
		payload["ori_question"] = req.Question
	}
	body, err := json.Marshal(payload)
	if err != nil {
		return nil, fmt.Errorf("encode web search request: %w", err)
	}
	endpoint := strings.TrimSuffix(strings.TrimRight(baseURL, "/"), "/v1") + "/v1/tools/search"

	var lastErr error
	for attempt := 0; attempt < aiWebSearchAttempts; attempt++ {
		if attempt > 0 {
			select {
			case <-ctx.Done():
				return nil, ctx.Err()
			case <-time.After(aiWebSearchRetryDelay):
			}
		}
		results, retryable, err := postDeepSeekSearch(ctx, endpoint, token, body)
		if err == nil {
			return results, nil
		}
		lastErr = err
		if !retryable {
			break
		}
	}
	return nil, lastErr
}

func postDeepSeekSearch(ctx context.Context, endpoint, token string, body []byte) ([]AIWebSearchResult, bool, error) {
	ctx, cancel := context.WithTimeout(ctx, aiWebSearchTimeout)
	defer cancel()
	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(body))
	if err != nil {
		return nil, false, fmt.Errorf("build web search request: %w", err)
	}
	httpReq.Header.Set("Authorization", "Bearer "+token)
	httpReq.Header.Set("Content-Type", "application/json")

	resp, err := aiHTTPClient.Do(httpReq)
	if err != nil {
		return nil, true, fmt.Errorf("web search request: %w", err)
	}
	defer resp.Body.Close()
	raw, err := io.ReadAll(io.LimitReader(resp.Body, 8<<20))
	if err != nil {
		return nil, true, fmt.Errorf("read web search response: %w", err)
	}
	if resp.StatusCode != http.StatusOK {
		retryable := resp.StatusCode == http.StatusRequestTimeout ||
			resp.StatusCode == http.StatusTooManyRequests ||
			resp.StatusCode >= http.StatusInternalServerError
		message := string(raw)
		if len(message) > 200 {
			message = message[:200]
		}
		return nil, retryable, fmt.Errorf("web search HTTP %d: %s", resp.StatusCode, message)
	}
	var parsed struct {
		Results []AIWebSearchResult `json:"results"`
	}
	if err := json.Unmarshal(raw, &parsed); err != nil {
		return nil, false, fmt.Errorf("decode web search response: %w", err)
	}
	return parsed.Results, false, nil
}
