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
	"strings"

	"github.com/intmian/mian_go_lib/tool/ai"
)

func transcribeDashScopeQwen3ASR(
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
	endpoint, err := dashScopeMultimodalEndpoint(baseURL)
	if err != nil {
		return ai.TranscriptionResult{}, err
	}
	model = strings.TrimSpace(model)
	if model == "" {
		return ai.TranscriptionResult{}, errors.New("Qwen3-ASR model is empty")
	}
	_, mimeType, err := dashScopeAudioFormat(fileName)
	if err != nil {
		return ai.TranscriptionResult{}, err
	}

	requestReader, requestWriter := io.Pipe()
	go writeDashScopeQwen3ASRBody(requestWriter, file, model, mimeType, strings.TrimSpace(language))
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, requestReader)
	if err != nil {
		_ = requestReader.Close()
		return ai.TranscriptionResult{}, err
	}
	req.Header.Set("Authorization", "Bearer "+strings.TrimSpace(token))
	req.Header.Set("Content-Type", "application/json")

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
		return ai.TranscriptionResult{}, fmt.Errorf("DashScope Qwen3-ASR failed (%d): %s", resp.StatusCode, strings.TrimSpace(string(body)))
	}
	var result struct {
		Output struct {
			Choices []struct {
				Message struct {
					Annotations []struct {
						Language string `json:"language"`
					} `json:"annotations"`
					Content []struct {
						Text string `json:"text"`
					} `json:"content"`
				} `json:"message"`
			} `json:"choices"`
		} `json:"output"`
		Usage struct {
			Seconds float64 `json:"seconds"`
		} `json:"usage"`
	}
	if err := json.Unmarshal(body, &result); err != nil {
		return ai.TranscriptionResult{}, err
	}
	if len(result.Output.Choices) == 0 {
		return ai.TranscriptionResult{}, errors.New("empty Qwen3-ASR choices")
	}
	var texts []string
	for _, content := range result.Output.Choices[0].Message.Content {
		if text := strings.TrimSpace(content.Text); text != "" {
			texts = append(texts, text)
		}
	}
	text := strings.Join(texts, "")
	if text == "" {
		return ai.TranscriptionResult{}, errAITranscriptionEmpty
	}
	detectedLanguage := strings.TrimSpace(language)
	if annotations := result.Output.Choices[0].Message.Annotations; len(annotations) > 0 && strings.TrimSpace(annotations[0].Language) != "" {
		detectedLanguage = strings.TrimSpace(annotations[0].Language)
	}
	return ai.TranscriptionResult{Text: text, Language: detectedLanguage, Duration: result.Usage.Seconds}, nil
}

func writeDashScopeQwen3ASRBody(writer *io.PipeWriter, file io.Reader, model string, mimeType string, language string) {
	buffered := bufio.NewWriter(writer)
	fail := func(err error) {
		_ = writer.CloseWithError(err)
	}
	modelJSON, err := json.Marshal(model)
	if err != nil {
		fail(err)
		return
	}
	if _, err := fmt.Fprintf(buffered, `{"model":%s,"input":{"messages":[{"content":[{"audio":"data:%s;base64,`, modelJSON, mimeType); err != nil {
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
	if _, err := io.WriteString(buffered, `"}],"role":"user"}]},"parameters":{"asr_options":{"enable_itn":false`); err != nil {
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
	if _, err := io.WriteString(buffered, `}}}`); err != nil {
		fail(err)
		return
	}
	if err := buffered.Flush(); err != nil {
		fail(err)
		return
	}
	_ = writer.Close()
}
