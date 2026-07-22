package platform

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestOpenRouterTranscriptionEndpointUsesConfiguredBaseURL(t *testing.T) {
	tests := map[string]string{
		"https://openrouter.ai":                             "https://openrouter.ai/api/v1/audio/transcriptions",
		"https://openrouter.ai/":                            "https://openrouter.ai/api/v1/audio/transcriptions",
		"https://openrouter.ai/api/v1/":                     "https://openrouter.ai/api/v1/audio/transcriptions",
		"https://openrouter.ai/api/v1/audio/transcriptions": "https://openrouter.ai/api/v1/audio/transcriptions",
	}
	for baseURL, want := range tests {
		got, err := openRouterTranscriptionEndpoint(baseURL)
		if err != nil {
			t.Fatalf("openRouterTranscriptionEndpoint(%q): %v", baseURL, err)
		}
		if got != want {
			t.Errorf("openRouterTranscriptionEndpoint(%q) = %q, want %q", baseURL, got, want)
		}
	}
}

func TestTranscribeOpenRouter(t *testing.T) {
	audio := []byte("test-wav-data")
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/v1/audio/transcriptions" {
			t.Errorf("path = %q", r.URL.Path)
		}
		if r.Header.Get("Authorization") != "Bearer test-token" {
			t.Errorf("authorization header is missing")
		}
		var payload struct {
			Model      string `json:"model"`
			InputAudio struct {
				Data   string `json:"data"`
				Format string `json:"format"`
			} `json:"input_audio"`
			Language string `json:"language"`
		}
		if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
			t.Errorf("decode request: %v", err)
		}
		decoded, err := base64.StdEncoding.DecodeString(payload.InputAudio.Data)
		if err != nil || string(decoded) != string(audio) {
			t.Errorf("decoded audio = %q, err = %v", decoded, err)
		}
		if payload.Model != "openai/gpt-4o-mini-transcribe" || payload.InputAudio.Format != "wav" || payload.Language != "zh" {
			t.Errorf("unexpected payload: %+v", payload)
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"text":"测试成功","usage":{"seconds":1.5}}`))
	}))
	defer server.Close()

	result, err := transcribeOpenRouter(
		context.Background(),
		server.URL+"/api/v1",
		"test-token",
		strings.NewReader(string(audio)),
		"recording.wav",
		"openai/gpt-4o-mini-transcribe",
		"zh",
	)
	if err != nil {
		t.Fatalf("transcribeOpenRouter: %v", err)
	}
	if result.Text != "测试成功" || result.Duration != 1.5 {
		t.Fatalf("unexpected result: %+v", result)
	}
}
