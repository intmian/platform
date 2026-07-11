//go:build live_ai

package platform

import (
	"bufio"
	"context"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
	"time"

	"github.com/intmian/mian_go_lib/tool/ai"
	"github.com/intmian/platform/backend/share"
	"golang.org/x/term"
)

// TestLiveAudioProvider is an opt-in, interactive connectivity check. It keeps
// credentials out of source code, environment variables, logs, and test output.
func TestLiveAudioProvider(t *testing.T) {
	if runtime.GOOS != "darwin" {
		t.Skip("live audio fixture generation currently requires macOS say and afconvert")
	}
	stdinFD := int(os.Stdin.Fd())
	if !term.IsTerminal(stdinFD) {
		t.Skip("live audio provider test requires an interactive terminal")
	}

	reader := bufio.NewReader(os.Stdin)
	baseURL := readLiveTestLine(t, reader, "Audio provider base URL: ")
	fmt.Fprint(os.Stderr, "Audio provider API key (hidden): ")
	tokenBytes, err := term.ReadPassword(stdinFD)
	fmt.Fprintln(os.Stderr)
	if err != nil {
		t.Fatalf("read hidden API key: %v", err)
	}
	token := strings.TrimSpace(string(tokenBytes))
	for i := range tokenBytes {
		tokenBytes[i] = 0
	}
	if token == "" {
		t.Fatal("audio provider API key is required")
	}

	audioPath := generateLiveAudioFixture(t)
	file, err := os.Open(audioPath)
	if err != nil {
		t.Fatalf("open generated audio fixture: %v", err)
	}
	defer file.Close()

	client := ai.NewOpenAIWithModels(baseURL, token, false, share.DefaultAIAudioModel)
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()
	result, err := client.Transcribe(ctx, file, ai.TranscriptionRequest{
		Model:  share.DefaultAIAudioModel,
		Prompt: "这是一段用于验证语音转写供应商连通性的中文测试音频。",
	})
	if err != nil {
		t.Fatalf("audio provider transcription failed: %v", err)
	}
	t.Logf("audio provider transcription succeeded with %s: %q", share.DefaultAIAudioModel, result.Text)
}

func readLiveTestLine(t *testing.T, reader *bufio.Reader, prompt string) string {
	t.Helper()
	fmt.Fprint(os.Stderr, prompt)
	value, err := reader.ReadString('\n')
	if err != nil {
		t.Fatalf("read interactive input: %v", err)
	}
	value = strings.TrimSpace(value)
	if value == "" {
		t.Fatal("audio provider base URL is required")
	}
	return value
}

func generateLiveAudioFixture(t *testing.T) string {
	t.Helper()
	tempDir := t.TempDir()
	aiffPath := filepath.Join(tempDir, "transcription-test.aiff")
	wavPath := filepath.Join(tempDir, "transcription-test.wav")
	if output, err := exec.Command("say", "-o", aiffPath, "这是一次语音转写连接测试").CombinedOutput(); err != nil {
		t.Fatalf("generate speech fixture: %v: %s", err, strings.TrimSpace(string(output)))
	}
	if output, err := exec.Command(
		"afconvert", aiffPath, "-o", wavPath, "-f", "WAVE", "-d", "LEI16@16000",
	).CombinedOutput(); err != nil {
		t.Fatalf("convert speech fixture to WAV: %v: %s", err, strings.TrimSpace(string(output)))
	}
	return wavPath
}
