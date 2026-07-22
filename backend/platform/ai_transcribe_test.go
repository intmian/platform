package platform

import (
	"bytes"
	"context"
	"encoding/json"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	aiv2 "github.com/intmian/mian_go_lib/tool/ai/v2"
	"github.com/intmian/mian_go_lib/tool/token"
	"github.com/intmian/platform/backend/share"
)

func newTestAITranscribeRouter() (*gin.Engine, *webMgr) {
	gin.SetMode(gin.TestMode)
	router := gin.New()
	web := &webMgr{}
	web.jwt.SetSalt("test-salt-1", "test-salt-2")
	router.POST("/misc/ai/transcribe", web.aiTranscribe)
	router.POST("/misc/ai/config/queue/test", web.aiQueueTest)
	return router, web
}

func TestAIQueueTestRequiresPermission(t *testing.T) {
	router, _ := newTestAITranscribeRouter()
	req := httptest.NewRequest(http.MethodPost, "/misc/ai/config/queue/test", nil)
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, req)

	var ret uniReturn
	if err := json.Unmarshal(recorder.Body.Bytes(), &ret); err != nil {
		t.Fatalf("unmarshal response failed: %v", err)
	}
	if ret.Code == 0 || ret.Msg != "no permission" {
		t.Fatalf("expected no permission, got %+v", ret)
	}
}

func TestTranscribeQueueReportsFailedAttempt(t *testing.T) {
	config := share.AIPlatformConfig{
		Version: 2,
		Providers: []share.AIProviderConfig{{
			ID:       "default",
			Protocol: share.AIProviderProtocolOpenAI,
			Models:   []aiv2.ModelConfig{{ID: "stt-model", Name: "stt-upstream", Type: aiv2.ModelTypeSTT}},
		}},
		Queues: []share.AIModelQueue{{
			ID:    "stt",
			Type:  aiv2.ModelTypeSTT,
			Items: []share.AIModelQueueItem{{ProviderID: "default", ModelID: "stt-model"}},
		}},
	}

	_, meta, err := (&webMgr{}).transcribeQueue(context.Background(), config, "stt", bytes.NewReader([]byte("audio")), "sample.wav", "", "")
	if err == nil {
		t.Fatal("expected missing-token error")
	}
	if len(meta.Attempts) != 1 || meta.Attempts[0].Success || meta.Attempts[0].Error != "provider token is empty" {
		t.Fatalf("unexpected attempts: %#v", meta.Attempts)
	}
}

func TestDashScopeFunASREndpointNormalizesCompatibleBases(t *testing.T) {
	tests := map[string]string{
		"https://example.com":                    "https://example.com/api/v1/services/aigc/multimodal-generation/generation",
		"https://example.com/v1":                 "https://example.com/api/v1/services/aigc/multimodal-generation/generation",
		"https://example.com/compatible-mode/v1": "https://example.com/api/v1/services/aigc/multimodal-generation/generation",
		"https://example.com/api/v1":             "https://example.com/api/v1/services/aigc/multimodal-generation/generation",
	}
	for base, want := range tests {
		got, err := dashScopeMultimodalEndpoint(base)
		if err != nil || got != want {
			t.Errorf("dashScopeMultimodalEndpoint(%q) = %q, %v; want %q", base, got, err, want)
		}
	}
}

func TestTranscribeQueueUsesDashScopeFunASRProtocol(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/v1/services/aigc/multimodal-generation/generation" {
			t.Errorf("path = %q", r.URL.Path)
		}
		if got := r.Header.Get("Authorization"); got != "Bearer test-token" {
			t.Errorf("authorization = %q", got)
		}
		if got := r.Header.Get("X-DashScope-SSE"); got != "disable" {
			t.Errorf("X-DashScope-SSE = %q", got)
		}
		var body struct {
			Model string `json:"model"`
			Input struct {
				Messages []struct {
					Content []struct {
						InputAudio struct {
							Data string `json:"data"`
						} `json:"input_audio"`
					} `json:"content"`
				} `json:"messages"`
			} `json:"input"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			t.Errorf("decode request: %v", err)
		}
		if body.Model != "fun-asr-flash-2026-06-15" {
			t.Errorf("model = %q", body.Model)
		}
		if len(body.Input.Messages) != 1 || len(body.Input.Messages[0].Content) != 1 ||
			!strings.HasPrefix(body.Input.Messages[0].Content[0].InputAudio.Data, "data:audio/wav;base64,") {
			t.Errorf("unexpected audio data URI")
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"output":{"output":{"sentence":{"text":"你好，世界"}},"text":"你好，世界"}}`))
	}))
	defer server.Close()

	config := share.AIPlatformConfig{
		Version: 2,
		Providers: []share.AIProviderConfig{{
			ID:       "dashscope",
			Protocol: share.AIProviderProtocolOpenAI,
			BaseURL:  server.URL,
			Token:    "test-token",
			Models: []aiv2.ModelConfig{{
				ID:           "fun-asr",
				Name:         "fun-asr-flash-2026-06-15",
				Type:         aiv2.ModelTypeSTT,
				CallProtocol: aiv2.ModelCallProtocolDashScopeFunASR,
			}},
		}},
		Queues: []share.AIModelQueue{{
			ID:    "stt",
			Type:  aiv2.ModelTypeSTT,
			Items: []share.AIModelQueueItem{{ProviderID: "dashscope", ModelID: "fun-asr"}},
		}},
	}

	result, meta, err := (&webMgr{}).transcribeQueue(context.Background(), config, "stt", bytes.NewReader([]byte("wav")), "sample.wav", "zh", "")
	if err != nil {
		t.Fatalf("transcribeQueue: %v", err)
	}
	if result.Text != "你好，世界" || meta.ProviderID != "dashscope" || meta.ModelID != "fun-asr" {
		t.Fatalf("unexpected result/meta: %#v %#v", result, meta)
	}
}

func TestTranscribeQueueUsesDashScopeQwen3ASRProtocol(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/v1/services/aigc/multimodal-generation/generation" {
			t.Errorf("path = %q", r.URL.Path)
		}
		if got := r.Header.Get("Authorization"); got != "Bearer test-token" {
			t.Errorf("authorization = %q", got)
		}
		var body struct {
			Model string `json:"model"`
			Input struct {
				Messages []struct {
					Role    string `json:"role"`
					Content []struct {
						Audio string `json:"audio"`
					} `json:"content"`
				} `json:"messages"`
			} `json:"input"`
			Parameters struct {
				ASROptions struct {
					Language  string `json:"language"`
					EnableITN bool   `json:"enable_itn"`
				} `json:"asr_options"`
			} `json:"parameters"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			t.Errorf("decode request: %v", err)
		}
		if body.Model != "qwen3-asr-flash" {
			t.Errorf("model = %q", body.Model)
		}
		if len(body.Input.Messages) != 1 || body.Input.Messages[0].Role != "user" ||
			len(body.Input.Messages[0].Content) != 1 ||
			!strings.HasPrefix(body.Input.Messages[0].Content[0].Audio, "data:audio/wav;base64,") {
			t.Errorf("unexpected Qwen3-ASR audio message")
		}
		if body.Parameters.ASROptions.Language != "zh" || body.Parameters.ASROptions.EnableITN {
			t.Errorf("unexpected asr_options: %#v", body.Parameters.ASROptions)
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"output":{"choices":[{"message":{"annotations":[{"language":"zh","type":"audio_info"}],"content":[{"text":"你好，"},{"text":"世界"}]}}]},"usage":{"seconds":1.25}}`))
	}))
	defer server.Close()

	config := share.AIPlatformConfig{
		Version: 2,
		Providers: []share.AIProviderConfig{{
			ID:       "dashscope",
			Protocol: share.AIProviderProtocolOpenAI,
			BaseURL:  server.URL,
			Token:    "test-token",
			Models: []aiv2.ModelConfig{{
				ID:           "qwen3-asr",
				Name:         "qwen3-asr-flash",
				Type:         aiv2.ModelTypeSTT,
				CallProtocol: aiv2.ModelCallProtocolDashScopeQwen3ASR,
			}},
		}},
		Queues: []share.AIModelQueue{{
			ID:    "stt",
			Type:  aiv2.ModelTypeSTT,
			Items: []share.AIModelQueueItem{{ProviderID: "dashscope", ModelID: "qwen3-asr"}},
		}},
	}

	result, meta, err := (&webMgr{}).transcribeQueue(context.Background(), config, "stt", bytes.NewReader([]byte("wav")), "sample.wav", "zh", "")
	if err != nil {
		t.Fatalf("transcribeQueue: %v", err)
	}
	if result.Text != "你好，世界" || result.Language != "zh" || result.Duration != 1.25 ||
		meta.ProviderID != "dashscope" || meta.ModelID != "qwen3-asr" {
		t.Fatalf("unexpected result/meta: %#v %#v", result, meta)
	}
}

func TestAIQueueTestUsesUnsavedTextConfig(t *testing.T) {
	router, web := newTestAITranscribeRouter()
	config := share.AIPlatformConfig{
		Version: 2,
		Providers: []share.AIProviderConfig{{
			ID:       "draft",
			Protocol: share.AIProviderProtocolOpenAI,
			Models:   []aiv2.ModelConfig{{ID: "text-model", Name: "text-upstream", Type: aiv2.ModelTypeText}},
		}},
		Queues: []share.AIModelQueue{{
			ID:    "draft-text",
			Type:  aiv2.ModelTypeText,
			Items: []share.AIModelQueueItem{{ProviderID: "draft", ModelID: "text-model"}},
		}},
	}
	configJSON, err := json.Marshal(config)
	if err != nil {
		t.Fatalf("marshal config failed: %v", err)
	}

	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	if err := writer.WriteField("config", string(configJSON)); err != nil {
		t.Fatalf("write config failed: %v", err)
	}
	if err := writer.WriteField("queueID", "draft-text"); err != nil {
		t.Fatalf("write queue id failed: %v", err)
	}
	if err := writer.WriteField("input", "hello"); err != nil {
		t.Fatalf("write input failed: %v", err)
	}
	if err := writer.Close(); err != nil {
		t.Fatalf("close multipart failed: %v", err)
	}

	req := httptest.NewRequest(http.MethodPost, "/misc/ai/config/queue/test", &body)
	req.Header.Set("Content-Type", writer.FormDataContentType())
	data := token.Data{User: "admin", Permission: []string{"admin"}, ValidTime: time.Now().Add(time.Hour).Unix()}
	data.Token = web.jwt.GenToken(data.User, data.Permission, data.ValidTime)
	cookieBytes, err := json.Marshal(data)
	if err != nil {
		t.Fatalf("marshal cookie failed: %v", err)
	}
	req.Header.Set("Cookie", "token="+url.QueryEscape(string(cookieBytes)))
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, req)

	var ret uniReturn
	if err := json.Unmarshal(recorder.Body.Bytes(), &ret); err != nil {
		t.Fatalf("unmarshal response failed: %v", err)
	}
	if ret.Code != 0 {
		t.Fatalf("unexpected response: %+v", ret)
	}
	var result aiQueueTestResp
	marshalBack(t, ret.Data, &result)
	if result.Type != aiv2.ModelTypeText || result.Error == "" || len(result.Attempts) != 1 {
		t.Fatalf("unexpected queue test result: %+v", result)
	}
}

func TestAITranscribeRequiresPermission(t *testing.T) {
	router, _ := newTestAITranscribeRouter()
	req := httptest.NewRequest(http.MethodPost, "/misc/ai/transcribe", nil)
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, req)
	if recorder.Code != http.StatusOK {
		t.Fatalf("unexpected status %d: %s", recorder.Code, recorder.Body.String())
	}

	var ret uniReturn
	if err := json.Unmarshal(recorder.Body.Bytes(), &ret); err != nil {
		t.Fatalf("unmarshal response failed: %v", err)
	}
	if ret.Code == 0 || ret.Msg != "no permission" {
		t.Fatalf("expected no permission, got %+v", ret)
	}
}

func TestAITranscribeRequiresAudioFile(t *testing.T) {
	router, web := newTestAITranscribeRouter()
	ret := performMoneyPost(t, router, web, "admin", []string{"admin"}, "/misc/ai/transcribe", map[string]string{})
	if ret.Code == 0 || ret.Msg != "audio file is required" {
		t.Fatalf("expected missing audio file error, got %+v", ret)
	}
}
