package platform

import (
	"bytes"
	"context"
	"encoding/binary"
	"errors"
	"fmt"
	"io"
	"path/filepath"
	"slices"
	"strings"
	"time"

	"github.com/gorilla/websocket"
	"github.com/intmian/mian_go_lib/tool/ai"
)

const (
	// 上传文件一次推给上游的字节数。实时接口不要求按真实语速推送。
	dashScopeRealtimeFileChunkBytes = 8 << 10
	dashScopeRealtimeFileSampleRate = 16000
)

// dashScopeRealtimeFileAudio 把上传文件的扩展名映射成实时接口认识的 format。
// 实时接口只认 pcm/wav/mp3/opus/speex/aac/amr，opus 要求 ogg 封装；
// webm、m4a 这类容器它不收，直接报错，免得上游返回含糊的失败。
func dashScopeRealtimeFileAudio(fileName string, head []byte) (dashScopeRealtimeAudio, error) {
	ext := strings.TrimPrefix(strings.ToLower(filepath.Ext(strings.TrimSpace(fileName))), ".")
	audio := dashScopeRealtimeAudio{SampleRate: dashScopeRealtimeFileSampleRate}
	switch ext {
	case "wav":
		audio.Format = "wav"
		if rate := wavSampleRate(head); rate > 0 {
			audio.SampleRate = rate
		}
	case "pcm":
		audio.Format = "pcm"
	case "mp3", "mpeg":
		audio.Format = "mp3"
	case "ogg", "opus":
		audio.Format = "opus"
	case "aac", "amr":
		audio.Format = ext
	default:
		return dashScopeRealtimeAudio{}, fmt.Errorf("实时转写模型不支持 %q 格式的文件，请用 wav、mp3 或 ogg", ext)
	}
	return audio, nil
}

// wavSampleRate 从 RIFF 头里找 fmt 块读采样率，找不到返回 0。
func wavSampleRate(head []byte) int {
	if len(head) < 12 || !bytes.Equal(head[0:4], []byte("RIFF")) || !bytes.Equal(head[8:12], []byte("WAVE")) {
		return 0
	}
	offset := 12
	for offset+8 <= len(head) {
		chunkID := head[offset : offset+4]
		chunkSize := int(binary.LittleEndian.Uint32(head[offset+4 : offset+8]))
		body := offset + 8
		if bytes.Equal(chunkID, []byte("fmt ")) {
			if body+8 > len(head) {
				return 0
			}
			return int(binary.LittleEndian.Uint32(head[body+4 : body+8]))
		}
		offset = body + chunkSize + chunkSize%2
	}
	return 0
}

// transcribeDashScopeRealtimeFile 用实时接口转写一整个文件：建任务、推完音频、
// 发 finish-task，再收齐结果。配置页测试和文件转写遇到实时模型时都走这里。
func transcribeDashScopeRealtimeFile(
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
	model = strings.TrimSpace(model)
	if model == "" {
		return ai.TranscriptionResult{}, errors.New("realtime model is empty")
	}
	head := make([]byte, 512)
	n, err := io.ReadFull(file, head)
	if err != nil && !errors.Is(err, io.ErrUnexpectedEOF) && !errors.Is(err, io.EOF) {
		return ai.TranscriptionResult{}, err
	}
	head = head[:n]
	audio, err := dashScopeRealtimeFileAudio(fileName, head)
	if err != nil {
		return ai.TranscriptionResult{}, err
	}

	conn, taskID, err := connectDashScopeRealtime(ctx, baseURL, token, model, audio)
	if err != nil {
		return ai.TranscriptionResult{}, err
	}
	defer conn.Close()
	// ctx 到期时关掉连接，让阻塞中的读写立刻返回。
	stop := context.AfterFunc(ctx, func() { _ = conn.Close() })
	defer stop()

	// 上游边收边回结果，读和写要并行，否则长文件可能把双方的缓冲区都塞满。
	type readResult struct {
		text string
		err  error
	}
	resultCh := make(chan readResult, 1)
	go func() {
		text, err := collectDashScopeRealtimeResult(conn)
		if err != nil {
			// 上游已经失败，关掉连接让还在推音频的写端立刻退出。
			_ = conn.Close()
		}
		resultCh <- readResult{text: text, err: err}
	}()

	writeErr := sendDashScopeRealtimeFile(conn, taskID, io.MultiReader(bytes.NewReader(head), file))
	if writeErr != nil {
		_ = conn.Close()
	}
	result := <-resultCh
	if ctx.Err() != nil {
		return ai.TranscriptionResult{}, ctx.Err()
	}
	if result.err != nil {
		return ai.TranscriptionResult{}, result.err
	}
	if writeErr != nil {
		return ai.TranscriptionResult{}, writeErr
	}
	if strings.TrimSpace(result.text) == "" {
		return ai.TranscriptionResult{}, errAITranscriptionEmpty
	}
	return ai.TranscriptionResult{Text: result.text}, nil
}

func sendDashScopeRealtimeFile(conn *websocket.Conn, taskID string, file io.Reader) error {
	buf := make([]byte, dashScopeRealtimeFileChunkBytes)
	for {
		n, err := file.Read(buf)
		if n > 0 {
			if err := conn.SetWriteDeadline(time.Now().Add(realtimeHandshakeTimeout)); err != nil {
				return err
			}
			if err := conn.WriteMessage(websocket.BinaryMessage, buf[:n]); err != nil {
				return err
			}
		}
		if errors.Is(err, io.EOF) {
			break
		}
		if err != nil {
			return err
		}
	}
	if err := conn.SetWriteDeadline(time.Now().Add(realtimeHandshakeTimeout)); err != nil {
		return err
	}
	return conn.WriteJSON(map[string]any{
		"header": map[string]any{
			"action":    "finish-task",
			"task_id":   taskID,
			"streaming": "duplex",
		},
		"payload": map[string]any{
			"input": map[string]any{},
		},
	})
}

// collectDashScopeRealtimeResult 读到 task-finished 为止，按句子编号拼出最终文本。
func collectDashScopeRealtimeResult(conn *websocket.Conn) (string, error) {
	finals := make(map[int]string)
	for {
		_, body, err := conn.ReadMessage()
		if err != nil {
			return "", fmt.Errorf("DashScope realtime closed before task-finished: %w", err)
		}
		event, err := parseDashScopeRealtimeEvent(body)
		if err != nil {
			continue
		}
		switch event.Header.Event {
		case "result-generated":
			sentence := event.Payload.Output.Sentence
			if sentence.SentenceEnd {
				finals[sentence.SentenceID] = strings.TrimSpace(sentence.Text)
			}
		case "task-finished":
			ids := make([]int, 0, len(finals))
			for id := range finals {
				ids = append(ids, id)
			}
			slices.Sort(ids)
			parts := make([]string, 0, len(ids))
			for _, id := range ids {
				if finals[id] != "" {
					parts = append(parts, finals[id])
				}
			}
			return strings.Join(parts, ""), nil
		case "task-failed":
			return "", dashScopeRealtimeEventError(event)
		}
	}
}
