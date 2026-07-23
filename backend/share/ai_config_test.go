package share

import (
	"context"
	"encoding/json"
	"testing"

	aiv2 "github.com/intmian/mian_go_lib/tool/ai/v2"
	"github.com/intmian/mian_go_lib/tool/misc"
	"github.com/intmian/mian_go_lib/xstorage"
)

func newTestAIConfig(t *testing.T) *xstorage.CfgExt {
	t.Helper()
	storage, err := xstorage.NewXStorage(xstorage.XStorageSetting{
		Property: misc.CreateProperty(xstorage.MultiSafe, xstorage.UseCache),
	})
	if err != nil {
		t.Fatalf("new storage failed: %v", err)
	}
	cfg, err := xstorage.NewCfgExt(storage)
	if err != nil {
		t.Fatalf("new cfg failed: %v", err)
	}
	for _, param := range DefaultAIConfigParams() {
		if err := cfg.AddParam(param); err != nil {
			t.Fatalf("add param %s failed: %v", param.Key, err)
		}
	}
	return cfg
}

func TestGetAIConfigAudioModelDefault(t *testing.T) {
	cfg := newTestAIConfig(t)
	conf, err := GetAIConfig(cfg)
	if err != nil {
		t.Fatalf("GetAIConfig failed: %v", err)
	}
	if conf.AudioModel != "gpt-4o-mini-transcribe" {
		t.Fatalf("AudioModel = %q, want gpt-4o-mini-transcribe", conf.AudioModel)
	}
}

func TestGetAIConfigAudioModelOverride(t *testing.T) {
	cfg := newTestAIConfig(t)
	raw, err := json.Marshal("custom-transcribe-model")
	if err != nil {
		t.Fatalf("marshal failed: %v", err)
	}
	if err := cfg.Set("PLAT.openai.audio.model", string(raw)); err != nil {
		t.Fatalf("set audio model failed: %v", err)
	}
	conf, err := GetAIConfig(cfg)
	if err != nil {
		t.Fatalf("GetAIConfig failed: %v", err)
	}
	if conf.AudioModel != "custom-transcribe-model" {
		t.Fatalf("AudioModel = %q, want custom-transcribe-model", conf.AudioModel)
	}
}

func TestGetAIConfigAudioProviderFallsBackToDefault(t *testing.T) {
	cfg := newTestAIConfig(t)
	conf, err := GetAIConfig(cfg)
	if err != nil {
		t.Fatalf("GetAIConfig failed: %v", err)
	}
	base, token, err := conf.AudioProvider()
	if err != nil {
		t.Fatalf("AudioProvider failed: %v", err)
	}
	if base != conf.Base || token != conf.Token {
		t.Fatalf("AudioProvider = (%q, %q), want default (%q, %q)", base, token, conf.Base, conf.Token)
	}
}

func TestGetAIConfigAudioProviderOverride(t *testing.T) {
	cfg := newTestAIConfig(t)
	setTestAIConfigString(t, cfg, "PLAT.openai.audio.base", "https://audio.example.com/v1")
	setTestAIConfigString(t, cfg, "PLAT.openai.audio.token", "audio-token")

	conf, err := GetAIConfig(cfg)
	if err != nil {
		t.Fatalf("GetAIConfig failed: %v", err)
	}
	base, token, err := conf.AudioProvider()
	if err != nil {
		t.Fatalf("AudioProvider failed: %v", err)
	}
	if base != "https://audio.example.com/v1" || token != "audio-token" {
		t.Fatalf("AudioProvider = (%q, %q), want audio override", base, token)
	}
}

func TestGetAIConfigAudioProviderRejectsPartialOverride(t *testing.T) {
	tests := []struct {
		name  string
		key   string
		value string
	}{
		{name: "base only", key: "PLAT.openai.audio.base", value: "https://audio.example.com/v1"},
		{name: "token only", key: "PLAT.openai.audio.token", value: "audio-token"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			cfg := newTestAIConfig(t)
			setTestAIConfigString(t, cfg, tt.key, tt.value)
			conf, err := GetAIConfig(cfg)
			if err != nil {
				t.Fatalf("GetAIConfig failed: %v", err)
			}
			if _, _, err := conf.AudioProvider(); err == nil {
				t.Fatal("AudioProvider should reject partial override")
			}
		})
	}
}

func setTestAIConfigString(t *testing.T, cfg *xstorage.CfgExt, key string, value string) {
	t.Helper()
	raw, err := json.Marshal(value)
	if err != nil {
		t.Fatalf("marshal failed: %v", err)
	}
	if err := cfg.Set(key, string(raw)); err != nil {
		t.Fatalf("set %s failed: %v", key, err)
	}
}

func TestAIPlatformConfigNormalizesVersionOneBindings(t *testing.T) {
	config := AIPlatformConfig{
		Version: 1,
		Providers: []AIProviderConfig{{
			ID:               "default",
			Name:             "Default",
			LegacySourceType: aiv2.ProviderSourceTypeDeepSeek,
			BaseURL:          "https://api.deepseek.com",
			Models: []aiv2.ModelConfig{
				{ID: "text-model", Name: "text-upstream", Type: aiv2.ModelType("chat")},
				{ID: "stt-model", Name: "stt-upstream", Type: aiv2.ModelTypeSTT},
			},
		}},
		Queues: []AIModelQueue{
			{ID: "text", Items: []AIModelQueueItem{{ProviderID: "default", ModelID: "text-model"}}},
			{ID: "stt", Items: []AIModelQueueItem{{ProviderID: "default", ModelID: "stt-model"}}},
		},
		LegacyScenes:     []AIBusinessConfig{{Scene: AISceneRewrite, QueueID: "text"}},
		LegacySTTQueueID: "stt",
	}

	config.normalize()
	if err := config.Validate(); err != nil {
		t.Fatalf("normalized config validation failed: %v", err)
	}
	if config.Version != 2 || config.Providers[0].Protocol != AIProviderProtocolDeepSeek {
		t.Fatalf("version/protocol not normalized: %#v", config)
	}
	if config.Providers[0].Models[0].Type != aiv2.ModelTypeText || config.Queues[0].Type != aiv2.ModelTypeText {
		t.Fatalf("text model/queue type not normalized: %#v", config)
	}
	if len(config.Businesses) != len(fixedAIBusinesses) {
		t.Fatalf("business bindings = %d, want %d", len(config.Businesses), len(fixedAIBusinesses))
	}
	if queueID, err := config.QueueIDForScene(AISceneTranscribe, aiv2.ModelTypeSTT); err != nil || queueID != "stt" {
		t.Fatalf("transcribe binding = %q, %v", queueID, err)
	}
}

func TestAIPlatformConfigRejectsQueueModelTypeMismatch(t *testing.T) {
	config := AIPlatformConfig{
		Version: 2,
		Providers: []AIProviderConfig{{
			ID:       "default",
			Protocol: AIProviderProtocolOpenAI,
			Models:   []aiv2.ModelConfig{{ID: "text-model", Name: "text-upstream", Type: aiv2.ModelTypeText}},
		}},
		Queues: []AIModelQueue{{
			ID:    "bad",
			Type:  aiv2.ModelTypeSTT,
			Items: []AIModelQueueItem{{ProviderID: "default", ModelID: "text-model"}},
		}},
	}
	if err := config.Validate(); err == nil {
		t.Fatal("expected queue/model type mismatch")
	}
}

func TestResolveAIModelCallProtocolInheritsProviderByModelType(t *testing.T) {
	tests := []struct {
		modelType aiv2.ModelType
		want      aiv2.ModelCallProtocol
	}{
		{modelType: aiv2.ModelTypeText, want: aiv2.ModelCallProtocolOpenAIText},
		{modelType: aiv2.ModelTypeSTT, want: aiv2.ModelCallProtocolOpenAISTT},
	}

	deepSeek, err := ResolveAIModelCallProtocol(AIProviderProtocolDeepSeek, aiv2.ModelConfig{Type: aiv2.ModelTypeText})
	if err != nil || deepSeek != aiv2.ModelCallProtocolDeepSeekText {
		t.Fatalf("DeepSeek text protocol = %q, %v", deepSeek, err)
	}
	if _, err := ResolveAIModelCallProtocol(AIProviderProtocolDeepSeek, aiv2.ModelConfig{Type: aiv2.ModelTypeSTT}); err == nil {
		t.Fatal("DeepSeek STT inheritance should require an explicit protocol")
	}
	for _, tt := range tests {
		got, err := ResolveAIModelCallProtocol(AIProviderProtocolOpenAI, aiv2.ModelConfig{Type: tt.modelType})
		if err != nil || got != tt.want {
			t.Fatalf("type %q protocol = %q, %v; want %q", tt.modelType, got, err, tt.want)
		}
	}

	override := aiv2.ModelConfig{Type: aiv2.ModelTypeSTT, CallProtocol: aiv2.ModelCallProtocolDashScopeFunASR}
	got, err := ResolveAIModelCallProtocol(AIProviderProtocolOpenAI, override)
	if err != nil || got != aiv2.ModelCallProtocolDashScopeFunASR {
		t.Fatalf("override protocol = %q, %v", got, err)
	}
}

func TestAIPlatformConfigMigratesDeepSeekThinking(t *testing.T) {
	config := AIPlatformConfig{
		Version: 2,
		Providers: []AIProviderConfig{{
			ID:       "deepseek",
			Protocol: AIProviderProtocolDeepSeek,
			BaseURL:  "https://api.deepseek.com",
			Token:    "test-token",
			Models: []aiv2.ModelConfig{{
				ID:        "reasoner",
				Name:      "deepseek-reasoner",
				Type:      aiv2.ModelTypeText,
				Reasoning: []aiv2.ReasoningEffort{aiv2.ReasoningEffortHigh},
			}},
		}},
		Queues: []AIModelQueue{{
			ID:   "reasoning",
			Type: aiv2.ModelTypeText,
			Items: []AIModelQueueItem{{
				ProviderID:      "deepseek",
				ModelID:         "reasoner",
				ReasoningEffort: aiv2.ReasoningEffortHigh,
				Thinking:        aiv2.ThinkingTypeEnabled,
			}},
		}},
		Businesses: []AIBusinessConfig{{Scene: AISceneRewrite, Type: aiv2.ModelTypeText, QueueID: "reasoning"}},
	}
	config.normalize()
	item := config.Queues[0].Items[0]
	if item.Thinking != aiv2.ThinkingTypeUnset || item.ReasoningEffort != aiv2.ReasoningEffortHigh {
		t.Fatalf("DeepSeek thinking was not migrated: %#v", item)
	}
	if err := config.Validate(); err != nil {
		t.Fatalf("DeepSeek config validation failed: %v", err)
	}
}

func TestAIPlatformConfigRoundTripPreservesExistingModelIDAndInheritedProtocol(t *testing.T) {
	cfg := newTestAIConfig(t)
	config := AIPlatformConfig{
		Version: 2,
		Providers: []AIProviderConfig{{
			ID:       "existing-provider",
			Name:     "Existing Provider",
			Protocol: AIProviderProtocolOpenAI,
			BaseURL:  "https://example.com/v1",
			Token:    "test-token",
			Models: []aiv2.ModelConfig{{
				ID:   "user-defined-model-id",
				Name: "upstream-model-name",
				Type: aiv2.ModelTypeSTT,
			}},
		}},
		Queues: []AIModelQueue{{
			ID:    "existing-stt",
			Name:  "Existing STT",
			Type:  aiv2.ModelTypeSTT,
			Items: []AIModelQueueItem{{ProviderID: "existing-provider", ModelID: "user-defined-model-id"}},
		}},
		Businesses: []AIBusinessConfig{{Scene: AISceneTranscribe, Type: aiv2.ModelTypeSTT, QueueID: "existing-stt"}},
	}

	if err := SaveAIPlatformConfig(cfg, config); err != nil {
		t.Fatalf("SaveAIPlatformConfig: %v", err)
	}
	loaded, err := GetAIPlatformConfig(cfg)
	if err != nil {
		t.Fatalf("GetAIPlatformConfig: %v", err)
	}
	if got := loaded.Providers[0].ID; got != "existing-provider" {
		t.Fatalf("provider ID = %q, want preserved existing ID", got)
	}
	if got := loaded.Providers[0].Models[0].ID; got != "user-defined-model-id" {
		t.Fatalf("model ID = %q, want preserved existing ID", got)
	}
	if got := loaded.Queues[0].Items[0].ModelID; got != "user-defined-model-id" {
		t.Fatalf("queue model ID = %q, want preserved reference", got)
	}
	if got := loaded.Queues[0].Items[0].ProviderID; got != "existing-provider" {
		t.Fatalf("queue provider ID = %q, want preserved reference", got)
	}
	protocol, err := ResolveAIModelCallProtocol(loaded.Providers[0].Protocol, loaded.Providers[0].Models[0])
	if err != nil || protocol != aiv2.ModelCallProtocolOpenAISTT {
		t.Fatalf("inherited protocol = %q, %v; want %q", protocol, err, aiv2.ModelCallProtocolOpenAISTT)
	}
}

func TestRunTextQueueReportsFailedAttempt(t *testing.T) {
	config := AIPlatformConfig{
		Version: 2,
		Providers: []AIProviderConfig{{
			ID:       "default",
			Protocol: AIProviderProtocolOpenAI,
			Models:   []aiv2.ModelConfig{{ID: "text-model", Name: "text-upstream", Type: aiv2.ModelTypeText}},
		}},
		Queues: []AIModelQueue{{
			ID:    "text",
			Type:  aiv2.ModelTypeText,
			Items: []AIModelQueueItem{{ProviderID: "default", ModelID: "text-model"}},
		}},
	}

	result, err := config.RunTextQueueContext(context.Background(), "text", "hello")
	if err == nil {
		t.Fatal("expected missing-token error")
	}
	if len(result.Attempts) != 1 || result.Attempts[0].Success || result.Attempts[0].Error != "provider token is empty" {
		t.Fatalf("unexpected attempts: %#v", result.Attempts)
	}
	if result.Error == "" {
		t.Fatal("expected result error")
	}
}
