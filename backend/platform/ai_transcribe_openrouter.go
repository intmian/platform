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

const maxOpenRouterTranscriptionResponseBytes = 1 << 20

func isOpenRouterBaseURL(baseURL string) bool {
	parsed, err := url.Parse(strings.TrimSpace(baseURL))
	if err != nil {
		return false
	}
	host := strings.ToLower(parsed.Hostname())
	return host == "openrouter.ai" || strings.HasSuffix(host, ".openrouter.ai")
}

func openRouterTranscriptionEndpoint(baseURL string) (string, error) {
	parsed, err := url.Parse(strings.TrimSpace(baseURL))
	if err != nil || parsed.Scheme == "" || parsed.Host == "" {
		return "", errors.New("invalid OpenRouter base URL")
	}
	if parsed.RawQuery != "" || parsed.Fragment != "" {
		return "", errors.New("invalid OpenRouter base URL")
	}
	return strings.TrimSuffix(parsed.String(), "/") + "/audio/transcriptions", nil
}

func openRouterAudioFormat(fileName string) (string, error) {
	format := strings.TrimPrefix(strings.ToLower(filepath.Ext(strings.TrimSpace(fileName))), ".")
	switch format {
	case "wav", "mp3", "m4a", "flac", "ogg", "webm", "aac", "mp4":
		return format, nil
	default:
		return "", errors.New("unsupported audio format")
	}
}

func transcribeOpenRouter(
	ctx context.Context,
	baseURL string,
	token string,
	file io.Reader,
	fileName string,
	model string,
	language string,
) (ai.TranscriptionResult, error) {
	if file == nil {
		return ai.TranscriptionResult{}, errors.New("audio file is empty")
	}
	endpoint, err := openRouterTranscriptionEndpoint(baseURL)
	if err != nil {
		return ai.TranscriptionResult{}, err
	}
	model = strings.TrimSpace(model)
	if model == "" {
		return ai.TranscriptionResult{}, errors.New("audio model is empty")
	}
	format, err := openRouterAudioFormat(fileName)
	if err != nil {
		return ai.TranscriptionResult{}, err
	}

	requestReader, requestWriter := io.Pipe()
	go writeOpenRouterTranscriptionBody(requestWriter, file, model, format, strings.TrimSpace(language))

	req, err := http.NewRequestWithContext(
		ctx,
		http.MethodPost,
		endpoint,
		requestReader,
	)
	if err != nil {
		_ = requestReader.Close()
		return ai.TranscriptionResult{}, err
	}
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return ai.TranscriptionResult{}, err
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(io.LimitReader(resp.Body, maxOpenRouterTranscriptionResponseBytes))
	if err != nil {
		return ai.TranscriptionResult{}, err
	}
	if resp.StatusCode < http.StatusOK || resp.StatusCode >= http.StatusMultipleChoices {
		return ai.TranscriptionResult{}, fmt.Errorf("OpenRouter transcription failed (%d): %s", resp.StatusCode, strings.TrimSpace(string(body)))
	}
	var result struct {
		Text  string `json:"text"`
		Usage struct {
			Seconds float64 `json:"seconds"`
		} `json:"usage"`
	}
	if err := json.Unmarshal(body, &result); err != nil {
		return ai.TranscriptionResult{}, err
	}
	if strings.TrimSpace(result.Text) == "" {
		return ai.TranscriptionResult{}, errors.New("openai-empty")
	}
	return ai.TranscriptionResult{
		Text:     strings.TrimSpace(result.Text),
		Language: strings.TrimSpace(language),
		Duration: result.Usage.Seconds,
	}, nil
}

func writeOpenRouterTranscriptionBody(
	writer *io.PipeWriter,
	file io.Reader,
	model string,
	format string,
	language string,
) {
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
	if _, err := fmt.Fprintf(buffered, `{"model":%s,"input_audio":{"data":"`, modelJSON); err != nil {
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
	if _, err := fmt.Fprintf(buffered, `","format":%s}`, formatJSON); err != nil {
		fail(err)
		return
	}
	if language != "" {
		languageJSON, err := json.Marshal(language)
		if err != nil {
			fail(err)
			return
		}
		if _, err := fmt.Fprintf(buffered, `,"language":%s`, languageJSON); err != nil {
			fail(err)
			return
		}
	}
	if _, err := io.WriteString(buffered, "}"); err != nil {
		fail(err)
		return
	}
	if err := buffered.Flush(); err != nil {
		fail(err)
		return
	}
	_ = writer.Close()
}
