package share

import (
	"slices"
	"testing"

	ai "github.com/intmian/mian_go_lib/tool/ai/v2"
)

var (
	testOpenAIReasoning   = []ai.ReasoningEffort{ai.ReasoningEffortNone, ai.ReasoningEffortMinimal, ai.ReasoningEffortLow, ai.ReasoningEffortMedium, ai.ReasoningEffortHigh, ai.ReasoningEffortXHigh, ai.ReasoningEffortMax}
	testDeepSeekReasoning = []ai.ReasoningEffort{ai.ReasoningEffortHigh, ai.ReasoningEffortMax}
	testOpenAITools       = []string{string(ai.ChatToolWebSearch)}
)

func TestDiscoverAIModelUsesUpstreamReasoning(t *testing.T) {
	tests := []struct {
		name      string
		protocol  AIProviderProtocol
		available []ai.ReasoningEffort
		raw       string
		want      []ai.ReasoningEffort
	}{
		{"deepseek effort", AIProviderProtocolDeepSeek, testDeepSeekReasoning, `{"effort":{"supported_levels":["low","high","max"]}}`, []ai.ReasoningEffort{ai.ReasoningEffortHigh, ai.ReasoningEffortMax}},
		{"openrouter reasoning", AIProviderProtocolOpenAI, testOpenAIReasoning, `{"reasoning":{"supported_efforts":["high","low"]}}`, []ai.ReasoningEffort{ai.ReasoningEffortHigh, ai.ReasoningEffortLow}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := discoverAIModel(tt.protocol, tt.available, nil, ai.AvailableModelInfo{ID: "vendor/model", Raw: tt.raw})
			if got.Source != AIModelCapabilityUpstream || !slices.Equal(got.Reasoning, tt.want) {
				t.Fatalf("unexpected result: %+v", got)
			}
		})
	}
}

func TestDiscoverAIModelFallsBackToRules(t *testing.T) {
	tests := []struct {
		name       string
		model      string
		raw        string
		wantType   ai.ModelType
		wantSource AIModelCapabilitySource
		wantLevels int
		wantWeb    bool
	}{
		{"gpt-5 family", "gpt-5.5-mini", `{"id":"gpt-5.5-mini"}`, ai.ModelTypeText, AIModelCapabilityRule, 6, true},
		{"gpt-5 chat has no reasoning", "gpt-5-chat-latest", `{}`, ai.ModelTypeText, AIModelCapabilityRule, 0, false},
		{"gpt-6 adds max", "openai/gpt-6", `{}`, ai.ModelTypeText, AIModelCapabilityRule, 7, true},
		{"transcribe model", "gpt-5.5-transcribe", `{}`, ai.ModelTypeSTT, AIModelCapabilityRule, 0, false},
		{"null allowlist is not upstream data", "gpt-5.4", `{"reasoning":{"supported_efforts":null}}`, ai.ModelTypeText, AIModelCapabilityRule, 6, true},
		{"malformed extension is ignored", "gpt-5.4", `{"reasoning":true}`, ai.ModelTypeText, AIModelCapabilityRule, 6, true},
		{"unknown family needs review", "acme-chat-1", `{}`, ai.ModelTypeText, AIModelCapabilityUnknown, 0, false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := discoverAIModel(AIProviderProtocolOpenAI, testOpenAIReasoning, testOpenAITools, ai.AvailableModelInfo{ID: tt.model, Raw: tt.raw})
			if got.Type != tt.wantType || got.Source != tt.wantSource || len(got.Reasoning) != tt.wantLevels || slices.Contains(got.Tools, ai.ChatToolWebSearch) != tt.wantWeb {
				t.Fatalf("unexpected result: %+v", got)
			}
		})
	}
}

func TestDiscoverAIModelsRecognizesDeepSeekSearch(t *testing.T) {
	got := discoverAIModels(AIProviderProtocolDeepSeek, testDeepSeekReasoning, nil, []ai.AvailableModelInfo{
		{ID: "deepseek-search", Raw: `{}`},
		{ID: "deepseek-flash", Raw: `{}`},
		{ID: "deepseek-flash", Raw: `{}`},
	})
	if len(got) != 2 || got[0].Name != "deepseek-flash" || got[1].Type != ai.ModelTypeSearch {
		t.Fatalf("unexpected result: %+v", got)
	}
	if !slices.Equal(got[0].Reasoning, testDeepSeekReasoning) {
		t.Fatalf("unexpected reasoning: %+v", got[0])
	}
}

func TestAIPlatformConfigKeepsModelAliases(t *testing.T) {
	config, err := NormalizeAIPlatformConfig(AIPlatformConfig{Version: 2, Providers: []AIProviderConfig{{
		ID: "p", Name: "DeepSeek", Protocol: AIProviderProtocolDeepSeek, BaseURL: "https://api.deepseek.com", Token: "x",
		Models: []ai.ModelConfig{
			{ID: "a", Name: "deepseek-flash", Alias: " flash 原生 ", Type: ai.ModelTypeText, CallProtocol: ai.ModelCallProtocolDeepSeekText},
			{ID: "b", Name: "deepseek-flash", Alias: "flash 结构化", Type: ai.ModelTypeText, CallProtocol: ai.ModelCallProtocolOpenAIText},
		},
	}}})
	if err != nil {
		t.Fatal(err)
	}
	if got := config.Providers[0].Models[0].Alias; got != "flash 原生" {
		t.Fatalf("alias = %q", got)
	}
}
