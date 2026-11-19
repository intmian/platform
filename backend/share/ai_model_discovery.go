package share

import (
	"encoding/json"
	"regexp"
	"slices"
	"sort"
	"strings"

	ai "github.com/intmian/mian_go_lib/tool/ai/v2"
)

// AIModelCapabilitySource 说明预填的能力从哪来，前端据此提示是否需要人工确认。
type AIModelCapabilitySource string

const (
	AIModelCapabilityUpstream AIModelCapabilitySource = "upstream"
	AIModelCapabilityRule     AIModelCapabilitySource = "rule"
	AIModelCapabilityUnknown  AIModelCapabilitySource = "unknown"
)

// AIDiscoveredModel 是"获取模型"返回的一个上游模型和预填能力。
type AIDiscoveredModel struct {
	Name      string                  `json:"name"`
	Type      ai.ModelType            `json:"type"`
	Reasoning []ai.ReasoningEffort    `json:"reasoning"`
	Tools     []ai.ChatTool           `json:"tools"`
	Source    AIModelCapabilitySource `json:"source"`
}

// upstreamModelMeta 只解析已知的扩展字段：DeepSeek 用 effort，OpenRouter 用 reasoning 和 architecture。
// OpenAI 官方的 /models 不带能力信息。
type upstreamModelMeta struct {
	Effort *struct {
		SupportedLevels []ai.ReasoningEffort `json:"supported_levels"`
	} `json:"effort"`
	Reasoning *struct {
		SupportedEfforts []ai.ReasoningEffort `json:"supported_efforts"`
	} `json:"reasoning"`
	Architecture *struct {
		OutputModalities []string `json:"output_modalities"`
	} `json:"architecture"`
}

var (
	aiSTTModelPattern     = regexp.MustCompile(`(?i)transcribe|whisper|asr`)
	aiOpenAIReasonPattern = regexp.MustCompile(`^o[134](-|$)`)
	aiOpenAISearchPattern = regexp.MustCompile(`^o[34](-|$)`)
)

func discoverAIModels(protocol AIProviderProtocol, reasoning []ai.ReasoningEffort, tools []string, models []ai.AvailableModelInfo) []AIDiscoveredModel {
	seen := make(map[string]struct{}, len(models))
	result := make([]AIDiscoveredModel, 0, len(models))
	for _, model := range models {
		if _, ok := seen[model.ID]; ok {
			continue
		}
		seen[model.ID] = struct{}{}
		result = append(result, discoverAIModel(protocol, reasoning, tools, model))
	}
	sort.Slice(result, func(i, j int) bool { return result[i].Name < result[j].Name })
	return result
}

func discoverAIModel(protocol AIProviderProtocol, available []ai.ReasoningEffort, availableTools []string, model ai.AvailableModelInfo) AIDiscoveredModel {
	// 扩展字段格式不符时当作没有，退回按名称判断
	var meta upstreamModelMeta
	if err := json.Unmarshal([]byte(model.Raw), &meta); err != nil {
		meta = upstreamModelMeta{}
	}
	result := AIDiscoveredModel{
		Name:      model.ID,
		Type:      ai.ModelTypeText,
		Reasoning: []ai.ReasoningEffort{},
		Tools:     []ai.ChatTool{},
		Source:    AIModelCapabilityUnknown,
	}

	if meta.Architecture != nil && slices.Contains(meta.Architecture.OutputModalities, "transcription") {
		result.Type = ai.ModelTypeSTT
		result.Source = AIModelCapabilityUpstream
		return result
	}
	if aiSTTModelPattern.MatchString(model.ID) {
		result.Type = ai.ModelTypeSTT
		result.Source = AIModelCapabilityRule
		return result
	}
	if protocol == AIProviderProtocolDeepSeek && strings.Contains(strings.ToLower(model.ID), "search") {
		result.Type = ai.ModelTypeSearch
		result.Source = AIModelCapabilityRule
		return result
	}

	ruleReasoning, ruleWebSearch, ruleMatched := aiModelCapabilityRule(protocol, model.ID)
	reasoning := ruleReasoning
	if ruleMatched {
		result.Source = AIModelCapabilityRule
	}
	if levels, ok := upstreamReasoning(meta); ok {
		reasoning = levels
		result.Source = AIModelCapabilityUpstream
	}
	for _, effort := range reasoning {
		if slices.Contains(available, effort) {
			result.Reasoning = append(result.Reasoning, effort)
		}
	}
	if ruleWebSearch && slices.Contains(availableTools, string(ai.ChatToolWebSearch)) {
		result.Tools = append(result.Tools, ai.ChatToolWebSearch)
	}
	return result
}

// upstreamReasoning 返回上游明确列出的思考强度；null 表示上游没有给出清单。
func upstreamReasoning(meta upstreamModelMeta) ([]ai.ReasoningEffort, bool) {
	if meta.Effort != nil && meta.Effort.SupportedLevels != nil {
		return meta.Effort.SupportedLevels, true
	}
	if meta.Reasoning != nil && meta.Reasoning.SupportedEfforts != nil {
		return meta.Reasoning.SupportedEfforts, true
	}
	return nil, false
}

// aiModelCapabilityRule 按模型名推断能力，只覆盖命名规律明确的系列。
func aiModelCapabilityRule(protocol AIProviderProtocol, name string) (reasoning []ai.ReasoningEffort, webSearch bool, matched bool) {
	if protocol == AIProviderProtocolDeepSeek {
		return []ai.ReasoningEffort{ai.ReasoningEffortHigh, ai.ReasoningEffortMax}, false, true
	}
	normalized := strings.TrimPrefix(strings.ToLower(name), "openai/")
	switch {
	case strings.HasPrefix(normalized, "gpt-6"):
		return append(defaultReasoning(), ai.ReasoningEffortMax), true, true
	case strings.HasPrefix(normalized, "gpt-5") && strings.Contains(normalized, "-chat"):
		return nil, false, true
	case strings.HasPrefix(normalized, "gpt-5"):
		return defaultReasoning(), true, true
	case aiOpenAIReasonPattern.MatchString(normalized):
		return []ai.ReasoningEffort{ai.ReasoningEffortLow, ai.ReasoningEffortMedium, ai.ReasoningEffortHigh}, aiOpenAISearchPattern.MatchString(normalized), true
	}
	return nil, false, false
}
