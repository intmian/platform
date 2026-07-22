package mods

import (
	"os"
	"testing"
	"time"

	"github.com/intmian/mian_go_lib/tool/ai"
	backendshare "github.com/intmian/platform/backend/share"
)

func Test_getNews(t *testing.T) {
	time := time.Now().Format("2006_01_02_15_04_05")
	f, _ := os.Create("gnews_" + time + ".md")
	defer f.Close()
	cfg := backendshare.AIConfig{
		Base:  "https://www.gptapi.us/v1",
		Token: "sk-RMKHw5wosxxQ27FD4fD922E56b7545A8Aa22EdC2E6A5334f",
		ModelPools: map[ai.ModelMode][]string{
			ai.ModelModeCheap: {"gpt-5.4-mini", "gpt-5.4-nano"},
		},
		SceneModes: map[backendshare.AIScene]ai.ModelMode{
			backendshare.AISceneSummary: ai.ModelModeCheap,
		},
	}
	chat := ai.NewOpenAIWithMode(cfg.Base, cfg.Token, cfg.ModeForScene(backendshare.AISceneSummary, ai.ModelModeCheap), cfg.ModelPools)
	s, err := getNews("ee54b7595ba81fc612c56689416abf6a", chat)
	if err != nil {
		t.Fatal(err)
	}
	f.WriteString(s)
}
