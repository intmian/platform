package share

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/url"
	"slices"
	"strings"
	"time"

	legacyai "github.com/intmian/mian_go_lib/tool/ai"
	ai "github.com/intmian/mian_go_lib/tool/ai/v2"
	"github.com/intmian/mian_go_lib/xstorage"
)

const AIPlatformConfigStorageKey = "PLAT.ai.config"

type AIProviderProtocol string

const (
	AIProviderProtocolOpenAI   AIProviderProtocol = "OpenAI"
	AIProviderProtocolDeepSeek AIProviderProtocol = "DeepSeek"
)

type AIProviderConfig struct {
	ID       string             `json:"id"`
	Name     string             `json:"name"`
	Protocol AIProviderProtocol `json:"protocol"`
	BaseURL  string             `json:"baseURL"`
	// ProxyURL 是 workers/ai-proxy 的地址。填了以后请求改走 Worker：
	// https://api.openai.com/v1 → <ProxyURL>/api.openai.com/v1（生产服务器在香港，OpenAI 不对香港开放）。
	ProxyURL         string                `json:"proxyURL,omitempty"`
	Token            string                `json:"token"`
	Models           []ai.ModelConfig      `json:"models"`
	LegacySourceType ai.ProviderSourceType `json:"sourceType,omitempty"`
}

type AIModelQueueItem struct {
	ProviderID      string             `json:"providerID"`
	ModelID         ai.ModelID         `json:"modelID"`
	ReasoningEffort ai.ReasoningEffort `json:"reasoningEffort,omitempty"`
	Thinking        ai.ThinkingType    `json:"thinking,omitempty"`
	Tools           []ai.ChatTool      `json:"tools,omitempty"`
}

type AIModelQueue struct {
	ID    string             `json:"id"`
	Name  string             `json:"name"`
	Type  ai.ModelType       `json:"type"`
	Items []AIModelQueueItem `json:"items"`
}

type AIBusinessConfig struct {
	Scene   AIScene      `json:"scene"`
	Type    ai.ModelType `json:"type"`
	QueueID string       `json:"queueID"`
}

var fixedAIBusinesses = [...]AIBusinessConfig{
	{Scene: AISceneRewrite, Type: ai.ModelTypeText},
	{Scene: AISceneSummary, Type: ai.ModelTypeText},
	{Scene: AISceneTranslate, Type: ai.ModelTypeText},
	{Scene: AISceneLibraryReviewDigest, Type: ai.ModelTypeText},
	{Scene: AISceneKeywordNews, Type: ai.ModelTypeText},
	{Scene: AISceneTranscribe, Type: ai.ModelTypeSTT},
	{Scene: AISceneWebSearch, Type: ai.ModelTypeSearch},
}

type AIPlatformConfig struct {
	Version    int                `json:"version"`
	Providers  []AIProviderConfig `json:"providers"`
	Queues     []AIModelQueue     `json:"queues"`
	Businesses []AIBusinessConfig `json:"businesses"`

	LegacyScenes     []AIBusinessConfig `json:"scenes,omitempty"`
	LegacySTTQueueID string             `json:"sttQueueID,omitempty"`
}

type AIResolvedQueueItem struct {
	Provider AIProviderConfig
	Model    ai.ModelConfig
	Setting  AIModelQueueItem
}

type AIQueueAttempt struct {
	ProviderID string     `json:"providerID"`
	ModelID    ai.ModelID `json:"modelID"`
	Success    bool       `json:"success"`
	Error      string     `json:"error,omitempty"`
	DurationMS int64      `json:"durationMS"`
}

type AIQueueRunMeta struct {
	ProviderID string           `json:"providerID,omitempty"`
	ModelID    ai.ModelID       `json:"modelID,omitempty"`
	Attempts   []AIQueueAttempt `json:"attempts"`
	Error      string           `json:"error,omitempty"`
}

type AITextQueueRunResult struct {
	AIQueueRunMeta
	Text string `json:"text"`
}

// AITextQueueRequest 是一次文本队列调用的完整参数。
type AITextQueueRequest struct {
	Input string
	// JSONSchema 非空时要求按结构输出 JSON。
	JSONSchema *ai.ChatJSONSchema
}

// AITextQueueResponse 在文本结果之外带上模型原始响应（引用、用量）。
type AITextQueueResponse struct {
	AITextQueueRunResult
	Response ai.ChatResponse
}

func GetAIPlatformConfig(cfg *xstorage.CfgExt) (AIPlatformConfig, error) {
	if cfg == nil {
		return AIPlatformConfig{}, errors.New("cfg is nil")
	}
	unit, err := cfg.Get("PLAT", "ai", "config")
	if err != nil {
		return AIPlatformConfig{}, err
	}
	raw := strings.TrimSpace(xstorage.ToBase[string](unit))
	if raw == "" {
		legacy, err := GetAIConfig(cfg)
		if err != nil {
			return AIPlatformConfig{}, err
		}
		config, err := migrateLegacyAIConfig(legacy)
		if err != nil {
			return AIPlatformConfig{}, err
		}
		if err := config.Validate(); err != nil {
			return AIPlatformConfig{}, err
		}
		return config, nil
	}

	var config AIPlatformConfig
	if err := json.Unmarshal([]byte(raw), &config); err != nil {
		return AIPlatformConfig{}, fmt.Errorf("decode ai config: %w", err)
	}
	config.normalize()
	if err := config.Validate(); err != nil {
		return AIPlatformConfig{}, err
	}
	return config, nil
}

func SaveAIPlatformConfig(cfg *xstorage.CfgExt, config AIPlatformConfig) error {
	if cfg == nil {
		return errors.New("cfg is nil")
	}
	config.normalize()
	if err := config.Validate(); err != nil {
		return err
	}
	raw, err := json.Marshal(config)
	if err != nil {
		return fmt.Errorf("encode ai config: %w", err)
	}
	encoded, err := json.Marshal(string(raw))
	if err != nil {
		return fmt.Errorf("encode ai config storage value: %w", err)
	}
	return cfg.Set(AIPlatformConfigStorageKey, string(encoded))
}

func NormalizeAIPlatformConfig(config AIPlatformConfig) (AIPlatformConfig, error) {
	config.normalize()
	if err := config.Validate(); err != nil {
		return AIPlatformConfig{}, err
	}
	return config, nil
}

func (c *AIPlatformConfig) normalize() {
	if c.Version <= 1 {
		c.Version = 2
	}
	for i := range c.Providers {
		provider := &c.Providers[i]
		provider.ID = strings.TrimSpace(provider.ID)
		provider.Name = strings.TrimSpace(provider.Name)
		if provider.Protocol == "" {
			if provider.LegacySourceType == ai.ProviderSourceTypeDeepSeek {
				provider.Protocol = AIProviderProtocolDeepSeek
			} else {
				provider.Protocol = AIProviderProtocolOpenAI
			}
		}
		provider.LegacySourceType = ""
		provider.BaseURL = strings.TrimSpace(provider.BaseURL)
		provider.ProxyURL = strings.TrimRight(strings.TrimSpace(provider.ProxyURL), "/")
		provider.Token = strings.TrimSpace(provider.Token)
		for j := range provider.Models {
			provider.Models[j].ID = ai.ModelID(strings.TrimSpace(string(provider.Models[j].ID)))
			provider.Models[j].Name = strings.TrimSpace(provider.Models[j].Name)
			provider.Models[j].Alias = strings.TrimSpace(provider.Models[j].Alias)
			provider.Models[j].CallProtocol = ai.ModelCallProtocol(strings.TrimSpace(string(provider.Models[j].CallProtocol)))
			if provider.Models[j].Type == ai.ModelType("chat") {
				provider.Models[j].Type = ai.ModelTypeText
			}
		}
	}
	for i := range c.Queues {
		queue := &c.Queues[i]
		queue.ID = strings.TrimSpace(queue.ID)
		queue.Name = strings.TrimSpace(queue.Name)
		if queue.Type == ai.ModelType("chat") {
			queue.Type = ai.ModelTypeText
		}
		for j := range queue.Items {
			item := &queue.Items[j]
			item.ProviderID = strings.TrimSpace(item.ProviderID)
			item.ModelID = ai.ModelID(strings.TrimSpace(string(item.ModelID)))
			provider, model, ok := c.findModel(item.ProviderID, item.ModelID)
			if ok {
				callProtocol, err := ResolveAIModelCallProtocol(provider.Protocol, model)
				if err == nil && callProtocol == ai.ModelCallProtocolDeepSeekText {
					switch item.Thinking {
					case ai.ThinkingTypeDisabled:
						item.ReasoningEffort = ai.ReasoningEffortNone
					case ai.ThinkingTypeEnabled:
						if item.ReasoningEffort == "" || item.ReasoningEffort == ai.ReasoningEffortNone {
							item.ReasoningEffort = ai.ReasoningEffortHigh
						}
						c.ensureModelReasoning(item.ProviderID, item.ModelID, item.ReasoningEffort)
					default:
						if item.ReasoningEffort == "" {
							item.ReasoningEffort = ai.ReasoningEffortNone
						}
					}
					item.Thinking = ai.ThinkingTypeUnset
				}
			}
		}
		if queue.Type == "" && len(queue.Items) > 0 {
			_, model, ok := c.findModel(queue.Items[0].ProviderID, queue.Items[0].ModelID)
			if ok {
				queue.Type = model.Type
			}
		}
	}
	if len(c.Businesses) == 0 && len(c.LegacyScenes) > 0 {
		for _, binding := range c.LegacyScenes {
			binding.Type = ai.ModelTypeText
			c.Businesses = append(c.Businesses, binding)
		}
	}
	if strings.TrimSpace(c.LegacySTTQueueID) != "" {
		c.Businesses = append(c.Businesses, AIBusinessConfig{
			Scene:   AISceneTranscribe,
			Type:    ai.ModelTypeSTT,
			QueueID: strings.TrimSpace(c.LegacySTTQueueID),
		})
	}
	c.LegacyScenes = nil
	c.LegacySTTQueueID = ""
	configuredBusinesses := make(map[string]string, len(c.Businesses))
	for i := range c.Businesses {
		c.Businesses[i].Scene = AIScene(strings.TrimSpace(string(c.Businesses[i].Scene)))
		if c.Businesses[i].Type == ai.ModelType("chat") {
			c.Businesses[i].Type = ai.ModelTypeText
		}
		c.Businesses[i].QueueID = strings.TrimSpace(c.Businesses[i].QueueID)
		key := string(c.Businesses[i].Scene) + "\x00" + string(c.Businesses[i].Type)
		if _, exists := configuredBusinesses[key]; !exists {
			configuredBusinesses[key] = c.Businesses[i].QueueID
		}
	}
	c.Businesses = make([]AIBusinessConfig, 0, len(fixedAIBusinesses))
	for _, definition := range fixedAIBusinesses {
		key := string(definition.Scene) + "\x00" + string(definition.Type)
		definition.QueueID = configuredBusinesses[key]
		c.Businesses = append(c.Businesses, definition)
	}
}

func (c *AIPlatformConfig) ensureModelReasoning(providerID string, modelID ai.ModelID, effort ai.ReasoningEffort) {
	for i := range c.Providers {
		if c.Providers[i].ID != providerID {
			continue
		}
		for j := range c.Providers[i].Models {
			model := &c.Providers[i].Models[j]
			if model.ID != modelID {
				continue
			}
			if !slices.Contains(model.Reasoning, effort) {
				model.Reasoning = append(model.Reasoning, effort)
			}
			return
		}
		return
	}
}

func (c AIPlatformConfig) Validate() error {
	if c.Version != 2 {
		return fmt.Errorf("unsupported ai config version %d", c.Version)
	}
	providers := make(map[string]AIProviderConfig, len(c.Providers))
	models := make(map[string]map[ai.ModelID]ai.ModelConfig, len(c.Providers))
	for i, provider := range c.Providers {
		if strings.TrimSpace(provider.ID) == "" {
			return fmt.Errorf("providers[%d].id is required", i)
		}
		if _, ok := providers[provider.ID]; ok {
			return fmt.Errorf("provider %q is duplicated", provider.ID)
		}
		if !isValidAIProviderProtocol(provider.Protocol) {
			return fmt.Errorf("provider %q has unsupported protocol %q", provider.ID, provider.Protocol)
		}
		if provider.Protocol == AIProviderProtocolDeepSeek && strings.TrimSpace(provider.BaseURL) == "" {
			return fmt.Errorf("provider %q base URL is required for DeepSeek", provider.ID)
		}
		if proxy := strings.TrimSpace(provider.ProxyURL); proxy != "" {
			parsed, err := url.Parse(proxy)
			if err != nil || (parsed.Scheme != "https" && parsed.Scheme != "http") || parsed.Host == "" {
				return fmt.Errorf("provider %q proxy URL is invalid", provider.ID)
			}
		}
		providerModels := make(map[ai.ModelID]ai.ModelConfig, len(provider.Models))
		for j, model := range provider.Models {
			if _, ok := providerModels[model.ID]; ok {
				return fmt.Errorf("provider %q model %q is duplicated", provider.ID, model.ID)
			}
			callProtocol, err := ResolveAIModelCallProtocol(provider.Protocol, model)
			if err != nil {
				return fmt.Errorf("providers[%d].models[%d]: %w", i, j, err)
			}
			sourceType, err := sourceTypeForAIModelCallProtocol(callProtocol)
			if err != nil {
				return fmt.Errorf("providers[%d].models[%d]: %w", i, j, err)
			}
			adapter, err := ai.NewOpenAIProvider(provider.RequestBaseURL(), provider.Token, sourceType)
			if err != nil {
				return fmt.Errorf("provider %q: %w", provider.ID, err)
			}
			if err := adapter.RegisterModel(model); err != nil {
				return fmt.Errorf("providers[%d].models[%d]: %w", i, j, err)
			}
			providerModels[model.ID] = model
		}
		providers[provider.ID] = provider
		models[provider.ID] = providerModels
	}

	queues := make(map[string]AIModelQueue, len(c.Queues))
	for i, queue := range c.Queues {
		if strings.TrimSpace(queue.ID) == "" {
			return fmt.Errorf("queues[%d].id is required", i)
		}
		if _, ok := queues[queue.ID]; ok {
			return fmt.Errorf("queue %q is duplicated", queue.ID)
		}
		if len(queue.Items) == 0 {
			return fmt.Errorf("queue %q requires at least one item", queue.ID)
		}
		if !isValidAIModelType(queue.Type) {
			return fmt.Errorf("queue %q has invalid type %q", queue.ID, queue.Type)
		}
		for j, item := range queue.Items {
			providerModels, ok := models[item.ProviderID]
			if !ok {
				return fmt.Errorf("queue %q item %d references unknown provider %q", queue.ID, j, item.ProviderID)
			}
			model, ok := providerModels[item.ModelID]
			if !ok {
				return fmt.Errorf("queue %q item %d references unknown model %q", queue.ID, j, item.ModelID)
			}
			if queue.Type != model.Type {
				return fmt.Errorf("queue %q type %q does not match model %s/%s type %q", queue.ID, queue.Type, item.ProviderID, item.ModelID, model.Type)
			}
			if !isValidAIThinkingType(item.Thinking) {
				return fmt.Errorf("queue %q item %d thinking %q is invalid", queue.ID, j, item.Thinking)
			}
			callProtocol, err := ResolveAIModelCallProtocol(providers[item.ProviderID].Protocol, model)
			if err != nil {
				return fmt.Errorf("queue %q item %d: %w", queue.ID, j, err)
			}
			if item.Thinking != ai.ThinkingTypeUnset && callProtocol != ai.ModelCallProtocolDeepSeekText {
				return fmt.Errorf("queue %q item %d thinking is only available for DeepSeek text", queue.ID, j)
			}
			if item.ReasoningEffort != "" &&
				!(callProtocol == ai.ModelCallProtocolDeepSeekText && item.ReasoningEffort == ai.ReasoningEffortNone) &&
				!slices.Contains(model.Reasoning, item.ReasoningEffort) {
				return fmt.Errorf("queue %q item %d reasoning %q is unavailable", queue.ID, j, item.ReasoningEffort)
			}
			for _, tool := range item.Tools {
				if !slices.Contains(model.Tools, tool) {
					return fmt.Errorf("queue %q item %d tool %q is unavailable", queue.ID, j, tool)
				}
			}
		}
		queues[queue.ID] = queue
	}

	seenBusinesses := make(map[string]struct{}, len(c.Businesses))
	for i, binding := range c.Businesses {
		if strings.TrimSpace(string(binding.Scene)) == "" {
			return fmt.Errorf("businesses[%d].scene is required", i)
		}
		if !isValidAIModelType(binding.Type) {
			return fmt.Errorf("businesses[%d].type %q is invalid", i, binding.Type)
		}
		key := string(binding.Scene) + "\x00" + string(binding.Type)
		if _, ok := seenBusinesses[key]; ok {
			return fmt.Errorf("business scene %q type %q is duplicated", binding.Scene, binding.Type)
		}
		if !isFixedAIBusiness(binding.Scene, binding.Type) {
			return fmt.Errorf("business scene %q type %q is not supported", binding.Scene, binding.Type)
		}
		if binding.QueueID == "" {
			seenBusinesses[key] = struct{}{}
			continue
		}
		queue, ok := queues[binding.QueueID]
		if !ok {
			return fmt.Errorf("business scene %q type %q references unknown queue %q", binding.Scene, binding.Type, binding.QueueID)
		}
		if queue.Type != binding.Type {
			return fmt.Errorf("business scene %q type %q requires a matching queue", binding.Scene, binding.Type)
		}
		seenBusinesses[key] = struct{}{}
	}
	return nil
}

func isFixedAIBusiness(scene AIScene, modelType ai.ModelType) bool {
	for _, definition := range fixedAIBusinesses {
		if definition.Scene == scene && definition.Type == modelType {
			return true
		}
	}
	return false
}

func isValidAIModelType(modelType ai.ModelType) bool {
	switch modelType {
	case ai.ModelTypeText, ai.ModelTypeSTT, ai.ModelTypeSearch:
		return true
	default:
		return false
	}
}

func isValidAIProviderProtocol(protocol AIProviderProtocol) bool {
	switch protocol {
	case AIProviderProtocolOpenAI, AIProviderProtocolDeepSeek:
		return true
	default:
		return false
	}
}

func isValidAIThinkingType(thinking ai.ThinkingType) bool {
	switch thinking {
	case ai.ThinkingTypeUnset, ai.ThinkingTypeEnabled, ai.ThinkingTypeDisabled:
		return true
	default:
		return false
	}
}

func ResolveAIModelCallProtocol(providerProtocol AIProviderProtocol, model ai.ModelConfig) (ai.ModelCallProtocol, error) {
	if model.CallProtocol != "" {
		return model.CallProtocol, nil
	}
	switch providerProtocol {
	case AIProviderProtocolOpenAI:
		switch model.Type {
		case ai.ModelTypeText:
			return ai.ModelCallProtocolOpenAIText, nil
		case ai.ModelTypeSTT:
			return ai.ModelCallProtocolOpenAISTT, nil
		}
	case AIProviderProtocolDeepSeek:
		switch model.Type {
		case ai.ModelTypeText:
			return ai.ModelCallProtocolDeepSeekText, nil
		case ai.ModelTypeSearch:
			return ai.ModelCallProtocolDeepSeekSearch, nil
		}
	default:
		return "", fmt.Errorf("provider protocol %q cannot infer a model call protocol", providerProtocol)
	}
	return "", fmt.Errorf("provider protocol %q cannot infer a call protocol for model type %q", providerProtocol, model.Type)
}

func sourceTypeForAIModelCallProtocol(protocol ai.ModelCallProtocol) (ai.ProviderSourceType, error) {
	switch protocol {
	case ai.ModelCallProtocolDeepSeekText, ai.ModelCallProtocolDeepSeekSearch:
		return ai.ProviderSourceTypeDeepSeek, nil
	case ai.ModelCallProtocolOpenAIText,
		ai.ModelCallProtocolOpenAISTT,
		ai.ModelCallProtocolDashScopeQwen3ASR,
		ai.ModelCallProtocolDashScopeFunASR,
		ai.ModelCallProtocolDashScopeFunASRRealtime:
		return ai.ProviderSourceTypeOpenAI, nil
	default:
		return "", fmt.Errorf("unsupported model call protocol %q", protocol)
	}
}

func (c AIPlatformConfig) ResolveQueue(queueID string, modelType ai.ModelType) ([]AIResolvedQueueItem, error) {
	var queue *AIModelQueue
	for i := range c.Queues {
		if c.Queues[i].ID == queueID {
			queue = &c.Queues[i]
			break
		}
	}
	if queue == nil {
		return nil, fmt.Errorf("ai queue %q not found", queueID)
	}
	if queue.Type != modelType {
		return nil, fmt.Errorf("ai queue %q is %s, not %s", queueID, queue.Type, modelType)
	}
	resolved := make([]AIResolvedQueueItem, 0, len(queue.Items))
	for _, item := range queue.Items {
		provider, model, ok := c.findModel(item.ProviderID, item.ModelID)
		if !ok {
			return nil, fmt.Errorf("ai model %s/%s not found", item.ProviderID, item.ModelID)
		}
		if model.Type != modelType {
			return nil, fmt.Errorf("ai model %s/%s is not %s", item.ProviderID, item.ModelID, modelType)
		}
		resolved = append(resolved, AIResolvedQueueItem{Provider: provider, Model: model, Setting: item})
	}
	return resolved, nil
}

func (c AIPlatformConfig) QueueIDForScene(scene AIScene, modelType ai.ModelType) (string, error) {
	for _, binding := range c.Businesses {
		if binding.Scene == scene && binding.Type == modelType {
			if strings.TrimSpace(binding.QueueID) == "" {
				return "", fmt.Errorf("ai scene %q type %q is not configured", scene, modelType)
			}
			return binding.QueueID, nil
		}
	}
	return "", fmt.Errorf("ai scene %q type %q is not configured", scene, modelType)
}

func (c AIPlatformConfig) findModel(providerID string, modelID ai.ModelID) (AIProviderConfig, ai.ModelConfig, bool) {
	for _, provider := range c.Providers {
		if provider.ID != providerID {
			continue
		}
		for _, model := range provider.Models {
			if model.ID == modelID {
				return provider, model, true
			}
		}
		return AIProviderConfig{}, ai.ModelConfig{}, false
	}
	return AIProviderConfig{}, ai.ModelConfig{}, false
}

type SceneAI struct {
	config AIPlatformConfig
	scene  AIScene
}

func NewSceneAI(cfg *xstorage.CfgExt, scene AIScene) (*SceneAI, error) {
	config, err := GetAIPlatformConfig(cfg)
	if err != nil {
		return nil, err
	}
	return NewSceneAIWithConfig(config, scene)
}

func NewSceneAIWithConfig(config AIPlatformConfig, scene AIScene) (*SceneAI, error) {
	if err := config.Validate(); err != nil {
		return nil, err
	}
	if _, err := config.QueueIDForScene(scene, ai.ModelTypeText); err != nil {
		return nil, err
	}
	return &SceneAI{config: config, scene: scene}, nil
}

func (c *SceneAI) Chat(prompt string) (string, error) {
	return c.ChatContext(context.Background(), prompt)
}

func (c *SceneAI) ChatContext(ctx context.Context, prompt string) (string, error) {
	if c == nil {
		return "", errors.New("scene ai is nil")
	}
	queueID, err := c.config.QueueIDForScene(c.scene, ai.ModelTypeText)
	if err != nil {
		return "", err
	}
	result, err := c.config.RunTextQueueContext(ctx, queueID, prompt)
	if err != nil {
		return "", err
	}
	return result.Text, nil
}

// Request 用场景绑定的队列执行一次完整请求（可带结构化输出）。
func (c *SceneAI) Request(ctx context.Context, req AITextQueueRequest) (AITextQueueResponse, error) {
	if c == nil {
		return AITextQueueResponse{}, errors.New("scene ai is nil")
	}
	queueID, err := c.config.QueueIDForScene(c.scene, ai.ModelTypeText)
	if err != nil {
		return AITextQueueResponse{}, err
	}
	return c.config.RunTextQueueRequest(ctx, queueID, req)
}

func (c AIPlatformConfig) RunTextQueueContext(ctx context.Context, queueID string, input string) (AITextQueueRunResult, error) {
	ret, err := c.RunTextQueueRequest(ctx, queueID, AITextQueueRequest{Input: input})
	return ret.AITextQueueRunResult, err
}

// RunTextQueueRequest 按队列顺序逐个尝试模型，第一个成功的返回。
func (c AIPlatformConfig) RunTextQueueRequest(ctx context.Context, queueID string, req AITextQueueRequest) (AITextQueueResponse, error) {
	var ret AITextQueueResponse
	result := &ret.AITextQueueRunResult
	input := req.Input
	if strings.TrimSpace(input) == "" {
		return ret, errors.New("text queue input is required")
	}
	var err error
	c, err = NormalizeAIPlatformConfig(c)
	if err != nil {
		return ret, err
	}
	items, err := c.ResolveQueue(queueID, ai.ModelTypeText)
	if err != nil {
		return ret, err
	}
	ctx, cancelQueue := withAIQueueDeadline(ctx)
	defer cancelQueue()
	var errs []error
	for index, item := range items {
		if ctxErr := ctx.Err(); ctxErr != nil {
			errs = append(errs, fmt.Errorf("queue stopped before %s/%s: %w", item.Provider.ID, item.Model.ID, ctxErr))
			break
		}
		startedAt := time.Now()
		attempt := AIQueueAttempt{ProviderID: item.Provider.ID, ModelID: item.Model.ID}
		if item.Provider.Token == "" || item.Provider.Token == "need input" {
			attempt.Error = "provider token is empty"
			attempt.DurationMS = time.Since(startedAt).Milliseconds()
			result.Attempts = append(result.Attempts, attempt)
			errs = append(errs, fmt.Errorf("%s/%s: %s", item.Provider.ID, item.Model.ID, attempt.Error))
			continue
		}
		callProtocol, err := ResolveAIModelCallProtocol(item.Provider.Protocol, item.Model)
		if err != nil || (callProtocol != ai.ModelCallProtocolOpenAIText && callProtocol != ai.ModelCallProtocolDeepSeekText) {
			if err == nil {
				err = fmt.Errorf("unsupported text call protocol %q", callProtocol)
			}
			attempt.Error = err.Error()
			attempt.DurationMS = time.Since(startedAt).Milliseconds()
			result.Attempts = append(result.Attempts, attempt)
			errs = append(errs, fmt.Errorf("%s/%s: %w", item.Provider.ID, item.Model.ID, err))
			continue
		}
		sourceType, sourceErr := sourceTypeForAIModelCallProtocol(callProtocol)
		if sourceErr != nil {
			attempt.Error = sourceErr.Error()
			attempt.DurationMS = time.Since(startedAt).Milliseconds()
			result.Attempts = append(result.Attempts, attempt)
			errs = append(errs, fmt.Errorf("%s/%s: %w", item.Provider.ID, item.Model.ID, sourceErr))
			continue
		}
		provider, err := ai.NewOpenAIProvider(item.Provider.RequestBaseURL(), item.Provider.Token, sourceType, aiProviderOptions()...)
		if err != nil {
			attempt.Error = err.Error()
			attempt.DurationMS = time.Since(startedAt).Milliseconds()
			result.Attempts = append(result.Attempts, attempt)
			errs = append(errs, fmt.Errorf("%s/%s: %w", item.Provider.ID, item.Model.ID, err))
			continue
		}
		modelForRegistration := item.Model
		if callProtocol == ai.ModelCallProtocolDeepSeekText {
			modelForRegistration.Reasoning = slices.DeleteFunc(
				append([]ai.ReasoningEffort(nil), modelForRegistration.Reasoning...),
				func(effort ai.ReasoningEffort) bool { return effort == ai.ReasoningEffortNone },
			)
		}
		if err := provider.RegisterModel(modelForRegistration); err != nil {
			attempt.Error = err.Error()
			attempt.DurationMS = time.Since(startedAt).Milliseconds()
			result.Attempts = append(result.Attempts, attempt)
			errs = append(errs, fmt.Errorf("%s/%s: %w", item.Provider.ID, item.Model.ID, err))
			continue
		}
		reasoningEffort := item.Setting.ReasoningEffort
		thinking := ai.ThinkingTypeUnset
		if callProtocol == ai.ModelCallProtocolDeepSeekText {
			if reasoningEffort == ai.ReasoningEffortNone {
				reasoningEffort = ""
				thinking = ai.ThinkingTypeDisabled
			} else if reasoningEffort != "" {
				thinking = ai.ThinkingTypeEnabled
			}
		}
		attemptCtx, cancelAttempt := aiAttemptContext(ctx, index == len(items)-1)
		resp, err := chatWithRetry(attemptCtx, provider, ai.ChatRequest{
			Model:           string(item.Model.ID),
			Messages:        []ai.ChatMessage{{Role: ai.ChatRoleUser, Content: input}},
			ReasoningEffort: reasoningEffort,
			Thinking:        thinking,
			Tools:           item.Setting.Tools,
			JSONSchema:      req.JSONSchema,
		})
		cancelAttempt()
		if err != nil {
			attempt.Error = err.Error()
			attempt.DurationMS = time.Since(startedAt).Milliseconds()
			result.Attempts = append(result.Attempts, attempt)
			errs = append(errs, fmt.Errorf("%s/%s: %w", item.Provider.ID, item.Model.ID, err))
			continue
		}
		if strings.TrimSpace(resp.Text) == "" {
			attempt.Error = "empty response"
			attempt.DurationMS = time.Since(startedAt).Milliseconds()
			result.Attempts = append(result.Attempts, attempt)
			errs = append(errs, fmt.Errorf("%s/%s: %s", item.Provider.ID, item.Model.ID, attempt.Error))
			continue
		}
		attempt.Success = true
		attempt.DurationMS = time.Since(startedAt).Milliseconds()
		result.Attempts = append(result.Attempts, attempt)
		result.ProviderID = item.Provider.ID
		result.ModelID = item.Model.ID
		result.Text = resp.Text
		ret.Response = resp
		return ret, nil
	}
	if len(errs) == 0 {
		err = fmt.Errorf("ai queue %q is empty", queueID)
		result.Error = err.Error()
		return ret, err
	}
	err = errors.Join(errs...)
	result.Error = err.Error()
	return ret, err
}

func migrateLegacyAIConfig(legacy AIConfig) (AIPlatformConfig, error) {
	config := AIPlatformConfig{Version: 2}
	defaultProvider := AIProviderConfig{
		ID:       "default",
		Name:     "默认 OpenAI",
		Protocol: AIProviderProtocolOpenAI,
		BaseURL:  strings.TrimSpace(legacy.Base),
		Token:    strings.TrimSpace(legacy.Token),
	}
	modelSeen := make(map[string]struct{})
	addChatModel := func(name string) {
		name = strings.TrimSpace(name)
		if name == "" {
			return
		}
		if _, ok := modelSeen[name]; ok {
			return
		}
		modelSeen[name] = struct{}{}
		defaultProvider.Models = append(defaultProvider.Models, ai.ModelConfig{
			ID:        ai.ModelID(name),
			Name:      name,
			Type:      ai.ModelTypeText,
			Reasoning: defaultReasoning(),
			Tools:     []ai.ChatTool{ai.ChatToolWebSearch},
		})
	}
	for _, mode := range []legacyai.ModelMode{legacyai.ModelModeCheap, legacyai.ModelModeFast, legacyai.ModelModeNormal} {
		for _, name := range legacy.ModelPools[mode] {
			addChatModel(name)
		}
		items := make([]AIModelQueueItem, 0, len(legacy.ModelPools[mode]))
		for _, name := range legacy.ModelPools[mode] {
			name = strings.TrimSpace(name)
			if name != "" {
				items = append(items, AIModelQueueItem{ProviderID: defaultProvider.ID, ModelID: ai.ModelID(name)})
			}
		}
		if len(items) > 0 {
			config.Queues = append(config.Queues, AIModelQueue{ID: string(mode), Name: string(mode), Type: ai.ModelTypeText, Items: items})
		}
	}

	audioProviderID := defaultProvider.ID
	audioBase, audioToken, audioErr := legacy.AudioProvider()
	if audioErr != nil {
		return AIPlatformConfig{}, audioErr
	}
	if strings.TrimSpace(audioBase) != defaultProvider.BaseURL || strings.TrimSpace(audioToken) != defaultProvider.Token {
		audioProviderID = "audio"
		config.Providers = append(config.Providers, AIProviderConfig{
			ID:       audioProviderID,
			Name:     "语音转写",
			Protocol: AIProviderProtocolOpenAI,
			BaseURL:  strings.TrimSpace(audioBase),
			Token:    strings.TrimSpace(audioToken),
			Models: []ai.ModelConfig{{
				ID:   "stt-default",
				Name: strings.TrimSpace(legacy.AudioModel),
				Type: ai.ModelTypeSTT,
			}},
		})
	} else {
		defaultProvider.Models = append(defaultProvider.Models, ai.ModelConfig{
			ID:   "stt-default",
			Name: strings.TrimSpace(legacy.AudioModel),
			Type: ai.ModelTypeSTT,
		})
	}
	config.Providers = append([]AIProviderConfig{defaultProvider}, config.Providers...)
	config.Queues = append(config.Queues, AIModelQueue{
		ID:   "stt",
		Name: "语音转写",
		Type: ai.ModelTypeSTT,
		Items: []AIModelQueueItem{{
			ProviderID: audioProviderID,
			ModelID:    "stt-default",
		}},
	})
	config.Businesses = append(config.Businesses, AIBusinessConfig{
		Scene:   AISceneTranscribe,
		Type:    ai.ModelTypeSTT,
		QueueID: "stt",
	})
	for _, scene := range []AIScene{AISceneRewrite, AISceneSummary, AISceneTranslate, AISceneLibraryReviewDigest} {
		mode := legacy.ModeForScene(scene, legacyai.ModelModeCheap)
		config.Businesses = append(config.Businesses, AIBusinessConfig{Scene: scene, Type: ai.ModelTypeText, QueueID: string(mode)})
	}
	return config, nil
}

func defaultReasoning() []ai.ReasoningEffort {
	return []ai.ReasoningEffort{
		ai.ReasoningEffortNone,
		ai.ReasoningEffortMinimal,
		ai.ReasoningEffortLow,
		ai.ReasoningEffortMedium,
		ai.ReasoningEffortHigh,
		ai.ReasoningEffortXHigh,
	}
}

const defaultOpenAIBaseURL = "https://api.openai.com/v1"

// RequestBaseURL 是实际发请求用的 baseURL：配置了转发地址时改写成经 Worker 的地址。
func (p AIProviderConfig) RequestBaseURL() string {
	base := strings.TrimSpace(p.BaseURL)
	if strings.TrimSpace(p.ProxyURL) == "" {
		return base
	}
	if base == "" && p.Protocol == AIProviderProtocolOpenAI {
		base = defaultOpenAIBaseURL
	}
	return RewriteURLForAIProxy(p.ProxyURL, base)
}

// RewriteURLForAIProxy 把完整地址改写成 workers/ai-proxy 的格式：<proxy>/<host><path>?<query>。
// proxy 为空或地址无法解析时原样返回。
func RewriteURLForAIProxy(proxyURL, rawURL string) string {
	proxyURL = strings.TrimRight(strings.TrimSpace(proxyURL), "/")
	if proxyURL == "" {
		return rawURL
	}
	parsed, err := url.Parse(strings.TrimSpace(rawURL))
	if err != nil || parsed.Host == "" {
		return rawURL
	}
	rewritten := proxyURL + "/" + parsed.Host + parsed.EscapedPath()
	if parsed.RawQuery != "" {
		rewritten += "?" + parsed.RawQuery
	}
	return rewritten
}

// ListAIProviderModels 调用供应商的 /models 接口列出可用模型及预填能力（经转发地址时同样走 Worker）。
func ListAIProviderModels(ctx context.Context, provider AIProviderConfig) ([]AIDiscoveredModel, error) {
	token := strings.TrimSpace(provider.Token)
	if token == "" || token == "need input" {
		return nil, errors.New("provider token is empty")
	}
	sourceType := ai.ProviderSourceTypeOpenAI
	if provider.Protocol == AIProviderProtocolDeepSeek {
		sourceType = ai.ProviderSourceTypeDeepSeek
	}
	adapter, err := ai.NewOpenAIProvider(provider.RequestBaseURL(), token, sourceType, aiProviderOptions()...)
	if err != nil {
		return nil, err
	}
	models, err := adapter.AvailableModelInfos(ctx)
	if err != nil {
		return nil, err
	}
	return discoverAIModels(provider.Protocol, adapter.AvailableReasoning(), adapter.AvailableTools(), models), nil
}
