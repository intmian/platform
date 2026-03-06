package share

import (
	"errors"

	"github.com/intmian/mian_go_lib/tool/ai"
	"github.com/intmian/mian_go_lib/xstorage"
)

type AIScene string

const (
	AISceneRewrite   AIScene = "rewrite"
	AISceneSummary   AIScene = "summary"
	AISceneTranslate AIScene = "translate"
)

func defaultAIModelPools() map[ai.ModelMode][]string {
	return map[ai.ModelMode][]string{
		ai.ModelModeCheap:  {"gpt-5-mini", "gpt-4.1-mini"},
		ai.ModelModeFast:   {"gpt-5.2-chat-latest"},
		ai.ModelModeNormal: {"gpt-5.2", "gpt-5.2-chat-latest"},
	}
}

func DefaultAIConfigParams() []*xstorage.CfgParam {
	modelPools := defaultAIModelPools()
	return []*xstorage.CfgParam{
		{
			Key:       "PLAT.openai.base",
			ValueType: xstorage.ValueTypeString,
			CanUser:   false,
			RealKey:   "openai.base",
			Default:   *xstorage.ToUnit[string]("need input", xstorage.ValueTypeString),
		},
		{
			Key:       "PLAT.openai.token",
			ValueType: xstorage.ValueTypeString,
			CanUser:   false,
			RealKey:   "openai.token",
			Default:   *xstorage.ToUnit[string]("need input", xstorage.ValueTypeString),
		},
		{
			Key:       "PLAT.openai.model.cheap",
			ValueType: xstorage.ValueTypeSliceString,
			CanUser:   false,
			RealKey:   "openai.model.cheap",
			Default:   *xstorage.ToUnit(modelPools[ai.ModelModeCheap], xstorage.ValueTypeSliceString),
		},
		{
			Key:       "PLAT.openai.model.fast",
			ValueType: xstorage.ValueTypeSliceString,
			CanUser:   false,
			RealKey:   "openai.model.fast",
			Default:   *xstorage.ToUnit(modelPools[ai.ModelModeFast], xstorage.ValueTypeSliceString),
		},
		{
			Key:       "PLAT.openai.model.normal",
			ValueType: xstorage.ValueTypeSliceString,
			CanUser:   false,
			RealKey:   "openai.model.normal",
			Default:   *xstorage.ToUnit(modelPools[ai.ModelModeNormal], xstorage.ValueTypeSliceString),
		},
		{
			Key:       "PLAT.openai.scene.rewrite",
			ValueType: xstorage.ValueTypeString,
			CanUser:   false,
			RealKey:   "openai.scene.rewrite",
			Default:   *xstorage.ToUnit[string](string(ai.ModelModeFast), xstorage.ValueTypeString),
		},
		{
			Key:       "PLAT.openai.scene.summary",
			ValueType: xstorage.ValueTypeString,
			CanUser:   false,
			RealKey:   "openai.scene.summary",
			Default:   *xstorage.ToUnit[string](string(ai.ModelModeCheap), xstorage.ValueTypeString),
		},
		{
			Key:       "PLAT.openai.scene.translate",
			ValueType: xstorage.ValueTypeString,
			CanUser:   false,
			RealKey:   "openai.scene.translate",
			Default:   *xstorage.ToUnit[string](string(ai.ModelModeCheap), xstorage.ValueTypeString),
		},
	}
}

type AIConfig struct {
	Base       string
	Token      string
	ModelPools map[ai.ModelMode][]string
	SceneModes map[AIScene]ai.ModelMode
}

func readCfgString(cfg *xstorage.CfgExt, keys ...string) (string, error) {
	v, err := cfg.Get(keys...)
	if err != nil {
		return "", err
	}
	if v == nil {
		return "", errors.New("config not found")
	}
	return xstorage.ToBase[string](v), nil
}

func readCfgStrings(cfg *xstorage.CfgExt, keys ...string) ([]string, error) {
	v, err := cfg.Get(keys...)
	if err != nil {
		return nil, err
	}
	if v == nil {
		return nil, errors.New("config not found")
	}
	return xstorage.ToBase[[]string](v), nil
}

func GetAIConfig(cfg *xstorage.CfgExt) (AIConfig, error) {
	conf := AIConfig{
		ModelPools: make(map[ai.ModelMode][]string),
		SceneModes: make(map[AIScene]ai.ModelMode),
	}
	if cfg == nil {
		return conf, errors.New("cfg is nil")
	}
	var err error
	conf.Base, err = readCfgString(cfg, "PLAT", "openai", "base")
	if err != nil {
		return conf, err
	}
	conf.Token, err = readCfgString(cfg, "PLAT", "openai", "token")
	if err != nil {
		return conf, err
	}
	conf.ModelPools[ai.ModelModeCheap], err = readCfgStrings(cfg, "PLAT", "openai", "model", "cheap")
	if err != nil {
		return conf, err
	}
	conf.ModelPools[ai.ModelModeFast], err = readCfgStrings(cfg, "PLAT", "openai", "model", "fast")
	if err != nil {
		return conf, err
	}
	conf.ModelPools[ai.ModelModeNormal], err = readCfgStrings(cfg, "PLAT", "openai", "model", "normal")
	if err != nil {
		return conf, err
	}
	rewriteMode, err := readCfgString(cfg, "PLAT", "openai", "scene", "rewrite")
	if err != nil {
		return conf, err
	}
	summaryMode, err := readCfgString(cfg, "PLAT", "openai", "scene", "summary")
	if err != nil {
		return conf, err
	}
	translateMode, err := readCfgString(cfg, "PLAT", "openai", "scene", "translate")
	if err != nil {
		return conf, err
	}
	conf.SceneModes[AISceneRewrite] = ai.NormalizeModelMode(rewriteMode, ai.ModelModeFast)
	conf.SceneModes[AISceneSummary] = ai.NormalizeModelMode(summaryMode, ai.ModelModeCheap)
	conf.SceneModes[AISceneTranslate] = ai.NormalizeModelMode(translateMode, ai.ModelModeCheap)
	return conf, nil
}

func (c AIConfig) ModeForScene(scene AIScene, fallback ai.ModelMode) ai.ModelMode {
	mode, ok := c.SceneModes[scene]
	if !ok {
		return fallback
	}
	return mode
}
