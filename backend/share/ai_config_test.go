package share

import (
	"encoding/json"
	"testing"

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
	if conf.AudioModel != DefaultAIAudioModel {
		t.Fatalf("AudioModel = %q, want %q", conf.AudioModel, DefaultAIAudioModel)
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
