package share

import (
	"context"
	"net"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"
	"time"

	aiv2 "github.com/intmian/mian_go_lib/tool/ai/v2"
)

const fakeResponsesBody = `{"id":"resp_1","object":"response","created_at":1,"status":"completed","model":"m",
"output":[{"type":"message","id":"msg_1","role":"assistant","status":"completed",
"content":[{"type":"output_text","text":"ok","annotations":[]}]}]}`

func okResponsesServer(t *testing.T) *httptest.Server {
	t.Helper()
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(fakeResponsesBody))
	}))
	t.Cleanup(server.Close)
	return server
}

func twoProviderQueue(firstURL, secondURL string) AIPlatformConfig {
	model := func(id string) []aiv2.ModelConfig {
		return []aiv2.ModelConfig{{ID: aiv2.ModelID(id), Name: "m", Type: aiv2.ModelTypeText}}
	}
	return AIPlatformConfig{
		Version: 2,
		Providers: []AIProviderConfig{
			{ID: "home", Protocol: AIProviderProtocolOpenAI, BaseURL: firstURL, Token: "t", Models: model("home-model")},
			{ID: "paid", Protocol: AIProviderProtocolOpenAI, BaseURL: secondURL, Token: "t", Models: model("paid-model")},
		},
		Queues: []AIModelQueue{{
			ID:   "text",
			Type: aiv2.ModelTypeText,
			Items: []AIModelQueueItem{
				{ProviderID: "home", ModelID: "home-model"},
				{ProviderID: "paid", ModelID: "paid-model"},
			},
		}},
	}
}

func assertFellBack(t *testing.T, result AITextQueueRunResult, err error) {
	t.Helper()
	if err != nil {
		t.Fatalf("queue error: %v (attempts %#v)", err, result.Attempts)
	}
	if result.ProviderID != "paid" || result.Text != "ok" {
		t.Fatalf("result = %s/%q, want fallback to paid", result.ProviderID, result.Text)
	}
	if len(result.Attempts) != 2 || result.Attempts[0].Success {
		t.Fatalf("attempts = %#v", result.Attempts)
	}
}

// 第一个服务商连上后一直不回答：它只能用掉一半时间，备用模型仍然来得及。
func TestRunTextQueueFallsBackWhenProviderHangs(t *testing.T) {
	release := make(chan struct{})
	hanging := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		select {
		case <-r.Context().Done():
		case <-release:
		}
	}))
	defer hanging.Close()
	defer close(release) // 先放行挂起的处理函数，否则 Close 会一直等它
	config := twoProviderQueue(hanging.URL, okResponsesServer(t).URL)

	ctx, cancel := context.WithTimeout(context.Background(), 4*time.Second)
	defer cancel()
	started := time.Now()
	result, err := config.RunTextQueueContext(ctx, "text", "hi")
	assertFellBack(t, result, err)
	if elapsed := time.Since(started); elapsed > 3*time.Second {
		t.Fatalf("fallback took %v, want about half of the 4s budget", elapsed)
	}
}

// 连接被拒绝时不在原地重试，直接换下一个。
func TestRunTextQueueSkipsUnreachableProviderImmediately(t *testing.T) {
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	closedURL := "http://" + listener.Addr().String()
	_ = listener.Close()
	config := twoProviderQueue(closedURL, okResponsesServer(t).URL)

	started := time.Now()
	result, err := config.RunTextQueueContext(context.Background(), "text", "hi")
	assertFellBack(t, result, err)
	if elapsed := time.Since(started); elapsed > 500*time.Millisecond {
		t.Fatalf("fallback took %v, want no retry backoff", elapsed)
	}
}

// 上游返回 5xx 时在同一个模型上重试一次，再失败才换下一个。
func TestRunTextQueueRetriesServerErrorOnce(t *testing.T) {
	var hits atomic.Int32
	failing := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		hits.Add(1)
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadGateway)
		_, _ = w.Write([]byte(`{"error":{"message":"upstream down"}}`))
	}))
	defer failing.Close()
	config := twoProviderQueue(failing.URL, okResponsesServer(t).URL)

	result, err := config.RunTextQueueContext(context.Background(), "text", "hi")
	assertFellBack(t, result, err)
	if got := hits.Load(); got != 2 {
		t.Fatalf("failing provider hits = %d, want 2", got)
	}
}
