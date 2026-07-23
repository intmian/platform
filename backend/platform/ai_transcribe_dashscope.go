package platform

import (
	"bufio"
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"path/filepath"
	"strings"

	"github.com/intmian/mian_go_lib/tool/ai"
)

const (
	defaultDashScopeBaseURL        = "https://dashscope.aliyuncs.com"
	dashScopeMultimodalServicePath = "/services/aigc/multimodal-generation/generation"
	maxDashScopeResponseBodyBytes  = 1 << 20
)

func dashScopeMultimodalEndpoint(baseURL string) (string, error) {
	baseURL = strings.TrimSpace(baseURL)
	if baseURL == "" {
		baseURL = defaultDashScopeBaseURL
	}
	parsed, err := url.Parse(baseURL)
	if err != nil || parsed.Scheme == "" || parsed.Host == "" {
		return "", errors.New("invalid DashScope base URL")
	}
	if parsed.RawQuery != "" || parsed.Fragment != "" {
		return "", errors.New("invalid DashScope base URL")
	}
	path := strings.TrimSuffix(parsed.Path, "/")
	switch {
	case strings.HasSuffix(path, dashScopeMultimodalServicePath):
	case strings.HasSuffix(path, "/api/v1"):
		path += dashScopeMultimodalServicePath
	case strings.HasSuffix(path, "/compatible-mode/v1"):
		path = strings.TrimSuffix(path, "/compatible-mode/v1") + "/api/v1" + dashScopeMultimodalServicePath
	case strings.HasSuffix(path, "/v1"):
		path = strings.TrimSuffix(path, "/v1") + "/api/v1" + dashScopeMultimodalServicePath
	default:
		path += "/api/v1" + dashScopeMultimodalServicePath
	}
	parsed.Path = path
	return parsed.String(), nil
}

func dashScopeAudioFormat(fileName string) (format string, mimeType string, err error) {
	format = strings.TrimPrefix(strings.ToLower(filepath.Ext(strings.TrimSpace(fileName))), ".")
	switch format {
	case "wav":
		return format, "audio/wav", nil
	case "mp3", "mpeg":
		return format, "audio/mpeg", nil
	case "m4a", "mp4":
		return format, "audio/mp4", nil
	case "aac":
		return format, "audio/aac", nil
	case "flac":
		return format, "audio/flac", nil
	case "ogg":
		return format, "audio/ogg", nil
	case "opus":
		return format, "audio/opus", nil
	case "webm":
		return format, "audio/webm", nil
	case "amr":
		return format, "audio/amr", nil
	case "pcm":
		return format, "audio/pcm", nil
	default:
		return "", "", errors.New("unsupported DashScope audio format")
	}
}

func transcribeDashScopeFunASR(
	ctx context.Context,
	baseURL string,
	token string,
	file io.Reader,
	fileName string,
	model string,
) (ai.TranscriptionResult, error) {
	if file == nil {
		return ai.TranscriptionResult{}, errors.New("audio file is empty")
	}
	endpoint, err := dashScopeMultimodalEndpoint(baseURL)
	if err != nil {
		return ai.TranscriptionResult{}, err
	}
	model = strings.TrimSpace(model)
	if model == "" {
		return ai.TranscriptionResult{}, errors.New("Fun-ASR model is empty")
	}
	format, mimeType, err := dashScopeAudioFormat(fileName)
	if err != nil {
		return ai.TranscriptionResult{}, err
	}

	requestReader, requestWriter := io.Pipe()
	go writeDashScopeFunASRBody(requestWriter, file, model, format, mimeType)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, requestReader)
	if err != nil {
		_ = requestReader.Close()
		return ai.TranscriptionResult{}, err
	}
	req.Header.Set("Authorization", "Bearer "+strings.TrimSpace(token))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-DashScope-SSE", "disable")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return ai.TranscriptionResult{}, err
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(io.LimitReader(resp.Body, maxDashScopeResponseBodyBytes))
	if err != nil {
		return ai.TranscriptionResult{}, err
	}
	if resp.StatusCode < http.StatusOK || resp.StatusCode >= http.StatusMultipleChoices {
		var upstreamErr struct {
			Message string `json:"message"`
		}
		if json.Unmarshal(body, &upstreamErr) == nil &&
			strings.TrimSpace(upstreamErr.Message) == "ASR_RESPONSE_HAVE_NO_WORDS" {
			return ai.TranscriptionResult{}, errAITranscriptionEmpty
		}
		return ai.TranscriptionResult{}, fmt.Errorf("DashScope Fun-ASR failed (%d): %s", resp.StatusCode, strings.TrimSpace(string(body)))
	}
	var result struct {
		Output struct {
			Text   string `json:"text"`
			Output struct {
				Sentence struct {
					Text string `json:"text"`
				} `json:"sentence"`
			} `json:"output"`
		} `json:"output"`
	}
	if err := json.Unmarshal(body, &result); err != nil {
		return ai.TranscriptionResult{}, err
	}
	text := strings.TrimSpace(result.Output.Text)
	if text == "" {
		text = strings.TrimSpace(result.Output.Output.Sentence.Text)
	}
	if text == "" {
		return ai.TranscriptionResult{}, errAITranscriptionEmpty
	}
	return ai.TranscriptionResult{Text: text}, nil
}

func writeDashScopeFunASRBody(writer *io.PipeWriter, file io.Reader, model string, format string, mimeType string) {
	buffered := bufio.NewWriter(writer)
	fail := func(err error) {
		_ = writer.CloseWithError(err)
	}
	modelJSON, err := json.Marshal(model)
	if err != nil {
		fail(err)
		return
	}
	formatJSON, err := json.Marshal(format)
	if err != nil {
		fail(err)
		return
	}
	if _, err := fmt.Fprintf(buffered, `{"model":%s,"input":{"messages":[{"role":"user","content":[{"type":"input_audio","input_audio":{"data":"data:%s;base64,`, modelJSON, mimeType); err != nil {
		fail(err)
		return
	}
	encoder := base64.NewEncoder(base64.StdEncoding, buffered)
	if _, err := io.Copy(encoder, file); err != nil {
		_ = encoder.Close()
		fail(err)
		return
	}
	if err := encoder.Close(); err != nil {
		fail(err)
		return
	}
	if _, err := fmt.Fprintf(buffered, `"}}]}]},"parameters":{"format":%s}}`, formatJSON); err != nil {
		fail(err)
		return
	}
	if err := buffered.Flush(); err != nil {
		fail(err)
		return
	}
	_ = writer.Close()
}
