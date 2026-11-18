package share

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	ai "github.com/intmian/mian_go_lib/tool/ai/v2"
)

func webSearchTestConfig(firstBaseURL, secondBaseURL string) AIPlatformConfig {
	searchModel := []ai.ModelConfig{{ID: "search", Name: "deepseek-search", Type: ai.ModelTypeSearch}}
	return AIPlatformConfig{
		Version: 2,
		Providers: []AIProviderConfig{
			{ID: "first", Protocol: AIProviderProtocolDeepSeek, BaseURL: firstBaseURL, Token: "first-token", Models: searchModel},
			{ID: "second", Protocol: AIProviderProtocolDeepSeek, BaseURL: secondBaseURL, Token: "second-token", Models: searchModel},
		},
		Queues: []AIModelQueue{{ID: "search", Name: "搜索", Type: ai.ModelTypeSearch, Items: []AIModelQueueItem{
			{ProviderID: "first", ModelID: "search"},
			{ProviderID: "second", ModelID: "search"},
		}}},
		Businesses: []AIBusinessConfig{{Scene: AISceneWebSearch, Type: ai.ModelTypeSearch, QueueID: "search"}},
	}
}

func TestRunWebSearchSceneSendsRequestAndRetriesRateLimit(t *testing.T) {
	aiWebSearchRetryDelay = 0
	calls := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls++
		if r.URL.Path != "/v1/tools/search" || r.Header.Get("Authorization") != "Bearer first-token" {
			t.Errorf("unexpected request: %s auth=%q", r.URL.Path, r.Header.Get("Authorization"))
		}
		var body map[string]any
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body["query"] != "gta6" || body["count"] != float64(50) {
			t.Errorf("unexpected body: %v err=%v", body, err)
		}
		if calls == 1 {
			w.WriteHeader(http.StatusTooManyRequests)
			return
		}
		_, _ = w.Write([]byte(`{"results":[{"title":"t","url":"https://a.com","site_name":"A","date":null,"authority":-1}]}`))
	}))
	defer server.Close()

	ret, err := webSearchTestConfig(server.URL+"/v1/", server.URL).RunWebSearchScene(context.Background(), AISceneWebSearch, AIWebSearchRequest{Query: "gta6", Count: 50})
	if err != nil {
		t.Fatal(err)
	}
	if calls != 2 || ret.ProviderID != "first" || len(ret.Results) != 1 || ret.Results[0].SiteName != "A" || ret.Results[0].Date != "" {
		t.Fatalf("unexpected result: calls=%d %+v", calls, ret)
	}
}

func TestRunWebSearchQueueFallsBackToNextProvider(t *testing.T) {
	aiWebSearchRetryDelay = 0
	failedCalls := 0
	failed := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		failedCalls++
		w.WriteHeader(http.StatusUnauthorized)
	}))
	defer failed.Close()
	working := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte(`{"results":[]}`))
	}))
	defer working.Close()

	ret, err := webSearchTestConfig(failed.URL, working.URL).RunWebSearchQueue(context.Background(), "search", AIWebSearchRequest{Query: "gta6"})
	if err != nil {
		t.Fatal(err)
	}
	if failedCalls != 1 || ret.ProviderID != "second" || len(ret.Attempts) != 2 || ret.Attempts[0].Success || !ret.Attempts[1].Success {
		t.Fatalf("auth failure should move on without retrying: calls=%d %+v", failedCalls, ret)
	}
}

func TestRunWebSearchQueueReportsAllFailures(t *testing.T) {
	aiWebSearchRetryDelay = 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusUnauthorized)
		_, _ = w.Write([]byte(`{"error":{"message":"invalid key"}}`))
	}))
	defer server.Close()

	ret, err := webSearchTestConfig(server.URL, server.URL).RunWebSearchQueue(context.Background(), "search", AIWebSearchRequest{Query: "gta6"})
	if err == nil || !strings.Contains(err.Error(), "401") || ret.Error == "" || len(ret.Attempts) != 2 {
		t.Fatalf("expected both attempts to fail: %+v err=%v", ret, err)
	}
}

func TestRunWebSearchSceneRequiresBinding(t *testing.T) {
	config := webSearchTestConfig("https://a.com", "https://b.com")
	config.Businesses = nil
	if _, err := config.RunWebSearchScene(context.Background(), AISceneWebSearch, AIWebSearchRequest{Query: "gta6"}); err == nil {
		t.Fatal("expected an error without a bound queue")
	}
}

func TestSearchModelCallProtocol(t *testing.T) {
	model := ai.ModelConfig{ID: "search", Name: "search", Type: ai.ModelTypeSearch}
	protocol, err := ResolveAIModelCallProtocol(AIProviderProtocolDeepSeek, model)
	if err != nil || protocol != ai.ModelCallProtocolDeepSeekSearch {
		t.Fatalf("deepseek provider should default to deepseek search: %q err=%v", protocol, err)
	}
	if _, err := ResolveAIModelCallProtocol(AIProviderProtocolOpenAI, model); err == nil {
		t.Fatal("openai provider has no default search protocol")
	}
	config, err := NormalizeAIPlatformConfig(webSearchTestConfig("https://a.com", "https://b.com"))
	if err != nil {
		t.Fatalf("search queue should validate: %v", err)
	}
	if queueID, err := config.QueueIDForScene(AISceneWebSearch, ai.ModelTypeSearch); err != nil || queueID != "search" {
		t.Fatalf("binding should survive normalize: %q err=%v", queueID, err)
	}
}
