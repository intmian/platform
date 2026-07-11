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
