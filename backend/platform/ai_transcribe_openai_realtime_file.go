package platform

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/binary"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"strings"
	"time"

	"github.com/gorilla/websocket"
	"github.com/intmian/mian_go_lib/tool/ai"
	"github.com/intmian/platform/backend/share"
)

// 用 OpenAI 实时转写会话转写一整个文件。配置页测试和文件转写遇到 OpenAIRealtimeSTT 模型时走这里。
// 实时接口只收原始 PCM，这里只解 16 位 PCM 的 wav（配置页自带的样例和浏览器录音都是）；
// 其它格式要解码器，直接报错，让策略换下一个模型。

const (
	openAIRealtimeFileMaxBytes    = 50 << 20
	openAIRealtimeFileChunkFrames = openAIRealtimeSampleRate / 10 // 每次推 100ms
)

// decodeWAVPCM16Mono 读出 wav 里的 16 位 PCM，多声道取平均成单声道。
func decodeWAVPCM16Mono(data []byte) ([]int16, int, error) {
	if len(data) < 12 || !bytes.Equal(data[0:4], []byte("RIFF")) || !bytes.Equal(data[8:12], []byte("WAVE")) {
		return nil, 0, errors.New("OpenAI 实时转写模型只支持 16 位 PCM 的 wav 文件")
	}
	var channels, bits, rate int
	var pcm []byte
	for offset := 12; offset+8 <= len(data); {
		id := string(data[offset : offset+4])
		size := int(binary.LittleEndian.Uint32(data[offset+4 : offset+8]))
		body := offset + 8
		end := min(body+size, len(data))
		switch id {
		case "fmt ":
			if end-body < 16 {
				return nil, 0, errors.New("wav fmt chunk is too short")
			}
			if format := binary.LittleEndian.Uint16(data[body:]); format != 1 && format != 0xFFFE {
				return nil, 0, fmt.Errorf("OpenAI 实时转写模型只支持 PCM 编码的 wav（当前编码 %d）", format)
			}
			channels = int(binary.LittleEndian.Uint16(data[body+2:]))
			rate = int(binary.LittleEndian.Uint32(data[body+4:]))
			bits = int(binary.LittleEndian.Uint16(data[body+14:]))
		case "data":
			pcm = data[body:end]
		}
		offset = body + size + size%2
	}
	if channels <= 0 || rate <= 0 || pcm == nil {
		return nil, 0, errors.New("wav file has no audio")
	}
	if bits != 16 {
		return nil, 0, fmt.Errorf("OpenAI 实时转写模型只支持 16 位 wav（当前 %d 位）", bits)
	}
	frames := len(pcm) / (2 * channels)
	samples := make([]int16, frames)
	for i := range samples {
		var sum int
		for c := 0; c < channels; c++ {
			sum += int(int16(binary.LittleEndian.Uint16(pcm[(i*channels+c)*2:])))
		}
		samples[i] = int16(sum / channels)
	}
	return samples, rate, nil
}

func transcribeOpenAIRealtimeFile(
	ctx context.Context,
	provider share.AIProviderConfig,
	token string,
	file io.Reader,
	model string,
) (ai.TranscriptionResult, error) {
	data, err := io.ReadAll(io.LimitReader(file, openAIRealtimeFileMaxBytes))
	if err != nil {
		return ai.TranscriptionResult{}, err
	}
	samples, rate, err := decodeWAVPCM16Mono(data)
	if err != nil {
		return ai.TranscriptionResult{}, err
	}
	pcm := newPCMResampler(rate, openAIRealtimeSampleRate).process(samples)

	conn, err := connectOpenAIRealtime(ctx, provider, token, model)
	if err != nil {
		return ai.TranscriptionResult{}, err
	}
	defer conn.Close()
	stop := context.AfterFunc(ctx, func() { _ = conn.Close() })
	defer stop()

	// 读和写并行：上游边收边回结果。
	type collected struct {
		text string
		err  error
	}
	commitsCh := make(chan int, 1)
	resultCh := make(chan collected, 1)
	go func() {
		text, err := collectOpenAIRealtimeFileResult(conn, commitsCh, openAIRealtimeProfile(model).clientCommit)
		if err != nil {
			_ = conn.Close()
		}
		resultCh <- collected{text: text, err: err}
	}()

	commits, writeErr := sendOpenAIRealtimeFile(conn, pcm, openAIRealtimeProfile(model).clientCommit)
	if writeErr != nil {
		_ = conn.Close()
	}
	commitsCh <- commits
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
	return ai.TranscriptionResult{Text: result.text, Duration: float64(len(samples)) / float64(rate)}, nil
}

// sendOpenAIRealtimeFile 推完音频，返回自己发了几次提交。边说边出字的模型按停顿分句提交。
func sendOpenAIRealtimeFile(conn *websocket.Conn, pcm []int16, clientCommit bool) (int, error) {
	write := func(event map[string]any) error {
		if err := conn.SetWriteDeadline(time.Now().Add(realtimeHandshakeTimeout)); err != nil {
			return err
		}
		return conn.WriteJSON(event)
	}
	var detector clientCommitDetector
	commits := 0
	uncommitted := 0
	for start := 0; start < len(pcm); start += openAIRealtimeFileChunkFrames {
		chunk := pcm[start:min(start+openAIRealtimeFileChunkFrames, len(pcm))]
		if err := write(map[string]any{"type": "input_audio_buffer.append", "audio": base64.StdEncoding.EncodeToString(pcm16ToBytes(chunk))}); err != nil {
			return commits, err
		}
		uncommitted += len(chunk)
		if clientCommit && detector.feed(chunk, openAIRealtimeSampleRate) {
			if err := write(map[string]any{"type": "input_audio_buffer.commit"}); err != nil {
				return commits, err
			}
			commits++
			uncommitted = 0
		}
	}
	if uncommitted*1000/openAIRealtimeSampleRate >= 100 {
		if err := write(map[string]any{"type": "input_audio_buffer.commit"}); err != nil {
			return commits, err
		}
		commits++
	}
	return commits, nil
}

// collectOpenAIRealtimeFileResult 收齐所有句子的定稿结果，按说话顺序拼起来。
// 发送方推完音频后通过 commitsCh 告知一共提交了几次；服务端断句的模型还会自己提交，
// 所以条件满足后再等一小会儿，没有新事件才算完。
func collectOpenAIRealtimeFileResult(conn *websocket.Conn, commitsCh <-chan int, clientCommit bool) (string, error) {
	type message struct {
		body []byte
		err  error
	}
	messages := make(chan message, 64)
	go func() {
		for {
			_, body, err := conn.ReadMessage()
			messages <- message{body: body, err: err}
			if err != nil {
				return
			}
		}
	}()

	order := make([]string, 0)
	seen := make(map[string]bool)
	finals := make(map[string]string)
	pending := make(map[string]bool)
	ownCommits := -1 // 发送方还没推完
	acked := 0       // 收到的 committed（只算自己发的）和 commit_empty
	timeout := time.After(openAIRealtimeFinishTimeout + 2*time.Minute)
	var grace <-chan time.Time

	note := func(itemID string) {
		if !seen[itemID] {
			seen[itemID] = true
			order = append(order, itemID)
		}
	}
	check := func() {
		grace = nil
		if ownCommits >= 0 && acked >= ownCommits && len(pending) == 0 {
			grace = time.After(openAIRealtimeFinishGrace)
		}
	}
	text := func() string {
		parts := make([]string, 0, len(order))
		for _, id := range order {
			if t := strings.TrimSpace(finals[id]); t != "" {
				parts = append(parts, t)
			}
		}
		return strings.Join(parts, "")
	}

	for {
		select {
		case n := <-commitsCh:
			ownCommits = n
			check()
		case <-grace:
			return text(), nil
		case <-timeout:
			return "", errors.New("OpenAI realtime transcription timed out")
		case msg := <-messages:
			if msg.err != nil {
				return "", fmt.Errorf("OpenAI realtime connection closed: %w", msg.err)
			}
			var event openAIRealtimeEvent
			if json.Unmarshal(msg.body, &event) != nil {
				continue
			}
			switch event.Type {
			case "input_audio_buffer.committed":
				note(event.ItemID)
				pending[event.ItemID] = true
				// 服务端断句的提交不是我们发的；只有边说边出字的模型和最后一次手动提交算自己的。
				if clientCommit || ownCommits >= 0 {
					acked++
				}
			case "conversation.item.input_audio_transcription.delta":
				note(event.ItemID)
				pending[event.ItemID] = true
			case "conversation.item.input_audio_transcription.completed", "conversation.item.input_audio_transcription.failed":
				note(event.ItemID)
				delete(pending, event.ItemID)
				finals[event.ItemID] = event.Transcript
			case "error":
				if event.Error.Code == openAIRealtimeCommitEmptyCode {
					acked++
					break
				}
				return "", errors.New(event.errorText())
			}
			check()
		}
	}
}
