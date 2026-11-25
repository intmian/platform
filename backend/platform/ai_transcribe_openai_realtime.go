package platform

import (
	"context"
	"encoding/base64"
	"encoding/binary"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	"github.com/gorilla/websocket"
	"github.com/intmian/platform/backend/share"
)

// OpenAI Realtime API 的转写会话。浏览器推来的 16k PCM 在这里补成 OpenAI 要求的 24k，
// OpenAI 的事件翻译成前端已有的 partial / final / completed，前端不用知道上游是谁。
//
// 模型分两类（2026-11 实测）：
//   - 边说边出字：gpt-live-transcribe、gpt-realtime-whisper。不支持服务端断句，
//     由后端按停顿自己提交（commit）来分句。
//   - 一句一出：gpt-transcribe、gpt-4o(-mini)-transcribe、whisper-1。开服务端断句，说完一句才出这一句。
//
// 每句定稿时带上这句在本次连接音频里的结束时间（EndTime）。连接中途断开时（比如经 Vercel 转发满 5 分钟），
// 前端靠它知道哪些音频已经转完，把剩下的音频续到新连接上。

const (
	openAIRealtimeSampleRate        = 24000
	openAIRealtimeFinishTimeout     = 20 * time.Second
	openAIRealtimeFinishGrace       = 800 * time.Millisecond
	openAIRealtimeServerVADSilence  = 600
	openAIRealtimeCommitEmptyCode   = "input_audio_buffer_commit_empty"
	openAIRealtimeSimplifiedPrompt  = "以下是普通话的句子，用简体中文。"
	openAIRealtimeDefaultBaseURL    = "https://api.openai.com/v1"
	openAIRealtimeTranscriptionPath = "/realtime?intent=transcription"

	// 后端自己分句（边说边出字的模型）：说话后静音这么久就提交一句；一句太长也强制提交，
	// 免得一直没有定稿句、断线时要重传的音频太多。
	openAIClientCommitSilence     = 700 * time.Millisecond
	openAIClientCommitMinSpeech   = 300 * time.Millisecond
	openAIClientCommitMaxSentence = 30 * time.Second
	// 16 位 PCM 的均方根超过这个值算有人声（满幅 32767）。
	openAIVoiceRMSThreshold = 600
)

// openAIRealtimeModelProfile 是不同模型在会话参数上的差别。
type openAIRealtimeModelProfile struct {
	clientCommit bool // true：不开服务端断句，由后端按停顿提交
	languages    bool // true：语言用 languages 数组（gpt-live-transcribe），否则用 language
	prompt       bool // true：加提示词要求输出简体（gpt-4o-transcribe 默认会出繁体）
}

func openAIRealtimeProfile(model string) openAIRealtimeModelProfile {
	name := strings.ToLower(strings.TrimSpace(model))
	switch {
	case strings.Contains(name, "live-transcribe"):
		return openAIRealtimeModelProfile{clientCommit: true, languages: true}
	case strings.Contains(name, "realtime-whisper"):
		return openAIRealtimeModelProfile{clientCommit: true}
	default:
		return openAIRealtimeModelProfile{prompt: true}
	}
}

func openAIRealtimeSessionUpdate(model string) map[string]any {
	profile := openAIRealtimeProfile(model)
	transcription := map[string]any{"model": model}
	if profile.languages {
		transcription["languages"] = []string{"zh-cn"}
	} else {
		transcription["language"] = "zh"
	}
	if profile.prompt {
		transcription["prompt"] = openAIRealtimeSimplifiedPrompt
	}
	var turnDetection any
	if !profile.clientCommit {
		turnDetection = map[string]any{"type": "server_vad", "silence_duration_ms": openAIRealtimeServerVADSilence}
	}
	return map[string]any{
		"type": "session.update",
		"session": map[string]any{
			"type": "transcription",
			"audio": map[string]any{
				"input": map[string]any{
					"format":         map[string]any{"type": "audio/pcm", "rate": openAIRealtimeSampleRate},
					"transcription":  transcription,
					"turn_detection": turnDetection,
				},
			},
		},
	}
}

// openAIRealtimeEndpoint 拼出转写会话的 WebSocket 地址；供应商配了转发地址时经转发（格式同 HTTP 请求）。
func openAIRealtimeEndpoint(provider share.AIProviderConfig) (string, error) {
	base := strings.TrimRight(strings.TrimSpace(provider.BaseURL), "/")
	if base == "" {
		base = openAIRealtimeDefaultBaseURL
	}
	raw := share.RewriteURLForAIProxy(provider.ProxyURL, base+openAIRealtimeTranscriptionPath)
	parsed, err := url.Parse(raw)
	if err != nil || parsed.Host == "" {
		return "", errors.New("invalid OpenAI base URL")
	}
	switch parsed.Scheme {
	case "https":
		parsed.Scheme = "wss"
	case "http":
		parsed.Scheme = "ws"
	case "wss", "ws":
	default:
		return "", errors.New("invalid OpenAI base URL")
	}
	return parsed.String(), nil
}

type openAIRealtimeEvent struct {
	Type           string `json:"type"`
	ItemID         string `json:"item_id"`
	PreviousItemID string `json:"previous_item_id"`
	Delta          string `json:"delta"`
	Transcript     string `json:"transcript"`
	AudioEndMS     int64  `json:"audio_end_ms"`
	Error          struct {
		Type    string `json:"type"`
		Code    string `json:"code"`
		Message string `json:"message"`
	} `json:"error"`
}

func (e openAIRealtimeEvent) errorText() string {
	message := strings.TrimSpace(e.Error.Message)
	if message == "" {
		message = "OpenAI realtime error"
	}
	if code := strings.TrimSpace(e.Error.Code); code != "" {
		return code + ": " + message
	}
	return message
}

// connectOpenAIRealtime 建立转写会话并等到 session.updated，失败时返回能看懂的原因。
func connectOpenAIRealtime(ctx context.Context, provider share.AIProviderConfig, token string, model string) (*websocket.Conn, error) {
	endpoint, err := openAIRealtimeEndpoint(provider)
	if err != nil {
		return nil, err
	}
	headers := http.Header{}
	headers.Set("Authorization", "Bearer "+token)
	dialer := websocket.Dialer{HandshakeTimeout: realtimeHandshakeTimeout, Proxy: http.ProxyFromEnvironment}
	conn, response, err := dialer.DialContext(ctx, endpoint, headers)
	if err != nil {
		if response != nil {
			body, _ := io.ReadAll(io.LimitReader(response.Body, 512))
			return nil, fmt.Errorf("OpenAI realtime handshake failed (%d): %s", response.StatusCode, strings.TrimSpace(string(body)))
		}
		return nil, err
	}
	fail := func(err error) (*websocket.Conn, error) {
		_ = conn.Close()
		return nil, err
	}
	if err := conn.SetWriteDeadline(time.Now().Add(realtimeHandshakeTimeout)); err != nil {
		return fail(err)
	}
	if err := conn.WriteJSON(openAIRealtimeSessionUpdate(model)); err != nil {
		return fail(err)
	}
	if err := conn.SetReadDeadline(time.Now().Add(realtimeHandshakeTimeout)); err != nil {
		return fail(err)
	}
	for {
		_, body, err := conn.ReadMessage()
		if err != nil {
			return fail(fmt.Errorf("OpenAI realtime closed before session.updated: %w", err))
		}
		var event openAIRealtimeEvent
		if json.Unmarshal(body, &event) != nil {
			continue
		}
		switch event.Type {
		case "session.updated", "transcription_session.updated":
			_ = conn.SetReadDeadline(time.Time{})
			_ = conn.SetWriteDeadline(time.Time{})
			return conn, nil
		case "error":
			return fail(errors.New(event.errorText()))
		}
	}
}

// ---------- 采样率转换和人声检测 ----------

// pcmResampler 把 16 位单声道 PCM 线性插值到另一个采样率，跨帧连续（上一帧最后一个采样留着接下一帧）。
type pcmResampler struct {
	step    float64 // 每输出一个采样，在输入里前进多少
	pos     float64 // 下一个输出采样在 buf 里的位置；buf 的第 0 个是上一帧留下的最后一个采样
	prev    int16
	hasPrev bool
}

func newPCMResampler(fromRate, toRate int) *pcmResampler {
	return &pcmResampler{step: float64(fromRate) / float64(toRate)}
}

func (r *pcmResampler) process(in []int16) []int16 {
	if len(in) == 0 {
		return nil
	}
	buf := in
	if r.hasPrev {
		buf = make([]int16, 0, len(in)+1)
		buf = append(buf, r.prev)
		buf = append(buf, in...)
	}
	out := make([]int16, 0, int(float64(len(buf))/r.step)+1)
	for r.pos+1 < float64(len(buf)) {
		i := int(r.pos)
		frac := r.pos - float64(i)
		value := float64(buf[i])*(1-frac) + float64(buf[i+1])*frac
		out = append(out, int16(math.Round(value)))
		r.pos += r.step
	}
	r.pos -= float64(len(buf) - 1)
	r.prev = buf[len(buf)-1]
	r.hasPrev = true
	return out
}

func pcm16FromBytes(body []byte) []int16 {
	samples := make([]int16, len(body)/2)
	for i := range samples {
		samples[i] = int16(binary.LittleEndian.Uint16(body[i*2:]))
	}
	return samples
}

func pcm16ToBytes(samples []int16) []byte {
	out := make([]byte, len(samples)*2)
	for i, sample := range samples {
		binary.LittleEndian.PutUint16(out[i*2:], uint16(sample))
	}
	return out
}

func pcm16HasVoice(samples []int16) bool {
	if len(samples) == 0 {
		return false
	}
	var sum float64
	for _, sample := range samples {
		sum += float64(sample) * float64(sample)
	}
	return math.Sqrt(sum/float64(len(samples))) > openAIVoiceRMSThreshold
}

// clientCommitDetector 给边说边出字的模型分句：说过话之后静音够久，或者一句太长，就该提交了。
type clientCommitDetector struct {
	speech  time.Duration // 本句里有人声的时长
	silence time.Duration // 当前连续静音时长
	total   time.Duration // 本句总时长
}

func (d *clientCommitDetector) feed(samples []int16, sampleRate int) bool {
	frame := time.Duration(len(samples)) * time.Second / time.Duration(sampleRate)
	d.total += frame
	if pcm16HasVoice(samples) {
		d.speech += frame
		d.silence = 0
	} else {
		d.silence += frame
	}
	if d.speech >= openAIClientCommitMinSpeech && (d.silence >= openAIClientCommitSilence || d.total >= openAIClientCommitMaxSentence) {
		*d = clientCommitDetector{}
		return true
	}
	return false
}

// ---------- 会话桥接 ----------

// openAIRealtimeBridge 是一次实时转写里共享的状态。客户端读循环（唯一往上游写的地方）和主循环
// （唯一往客户端写的地方）都会碰提交队列和收尾标记，所以用锁保护。
type openAIRealtimeBridge struct {
	upstream     *websocket.Conn
	clientCommit bool

	mu              sync.Mutex
	commitOffsets   []int64 // 已发出、还没收到 committed 的提交，对应的音频结束时间（毫秒）
	finishRequested bool
	finishCh        chan struct{}

	// 以下只在主循环里用。
	sentenceIDs map[string]int
	nextID      int
	partials    map[string]string
	endTimes    map[string]int64
	pending     map[string]bool
	finals      map[int]string
	order       []int
	lastEnd     int64
}

func newOpenAIRealtimeBridge(upstream *websocket.Conn, model string) *openAIRealtimeBridge {
	return &openAIRealtimeBridge{
		upstream:     upstream,
		clientCommit: openAIRealtimeProfile(model).clientCommit,
		finishCh:     make(chan struct{}, 1),
		sentenceIDs:  make(map[string]int),
		partials:     make(map[string]string),
		endTimes:     make(map[string]int64),
		pending:      make(map[string]bool),
		finals:       make(map[int]string),
	}
}

func (b *openAIRealtimeBridge) sentenceID(itemID string) int {
	if id, ok := b.sentenceIDs[itemID]; ok {
		return id
	}
	b.nextID++
	b.sentenceIDs[itemID] = b.nextID
	return b.nextID
}

func (b *openAIRealtimeBridge) writeUpstream(event map[string]any) error {
	if err := b.upstream.SetWriteDeadline(time.Now().Add(realtimeHandshakeTimeout)); err != nil {
		return err
	}
	return b.upstream.WriteJSON(event)
}

// commit 提交当前缓冲区，记下这句音频截止到哪（毫秒）。
func (b *openAIRealtimeBridge) commit(audioEndMS int64) error {
	b.mu.Lock()
	b.commitOffsets = append(b.commitOffsets, audioEndMS)
	b.mu.Unlock()
	return b.writeUpstream(map[string]any{"type": "input_audio_buffer.commit"})
}

func (b *openAIRealtimeBridge) popCommitOffset() (int64, bool) {
	b.mu.Lock()
	defer b.mu.Unlock()
	if len(b.commitOffsets) == 0 {
		return 0, false
	}
	offset := b.commitOffsets[0]
	b.commitOffsets = b.commitOffsets[1:]
	return offset, true
}

func (b *openAIRealtimeBridge) waitingCommits() int {
	b.mu.Lock()
	defer b.mu.Unlock()
	return len(b.commitOffsets)
}

// forwardClientAudio 读浏览器的消息：音频补成 24k 推给上游；finish 时把剩下的音频提交掉。
func (b *openAIRealtimeBridge) forwardClientAudio(client *websocket.Conn) error {
	resampler := newPCMResampler(realtimeClientSampleRate, openAIRealtimeSampleRate)
	var detector clientCommitDetector
	var receivedSamples int64    // 本次连接收到的客户端采样数，用来算时间
	var uncommittedSamples int64 // 上次提交之后的采样数
	finished := false
	audioMS := func() int64 { return receivedSamples * 1000 / realtimeClientSampleRate }

	for {
		messageType, body, err := client.ReadMessage()
		if err != nil {
			return err
		}
		switch messageType {
		case websocket.BinaryMessage:
			if finished || len(body) < 2 {
				continue
			}
			samples := pcm16FromBytes(body)
			receivedSamples += int64(len(samples))
			uncommittedSamples += int64(len(samples))
			if err := b.writeUpstream(map[string]any{
				"type":  "input_audio_buffer.append",
				"audio": base64.StdEncoding.EncodeToString(pcm16ToBytes(resampler.process(samples))),
			}); err != nil {
				return err
			}
			if b.clientCommit && detector.feed(samples, realtimeClientSampleRate) {
				if err := b.commit(audioMS()); err != nil {
					return err
				}
				uncommittedSamples = 0
			}
		case websocket.TextMessage:
			var event realtimeTranscriptionClientEvent
			if json.Unmarshal(body, &event) != nil {
				continue
			}
			switch event.Type {
			case "finish":
				if finished {
					continue
				}
				finished = true
				// OpenAI 要求一次提交至少 100ms 音频；不够就不提交，免得收一个 commit_empty 错误。
				if uncommittedSamples*1000/realtimeClientSampleRate >= 100 {
					if err := b.commit(audioMS()); err != nil {
						return err
					}
				}
				b.mu.Lock()
				b.finishRequested = true
				b.mu.Unlock()
				select {
				case b.finishCh <- struct{}{}:
				default:
				}
			case "cancel":
				return errors.New("realtime transcription canceled")
			}
		}
	}
}

func (b *openAIRealtimeBridge) finishing() bool {
	b.mu.Lock()
	defer b.mu.Unlock()
	return b.finishRequested
}

func (b *openAIRealtimeBridge) completedText() string {
	parts := make([]string, 0, len(b.order))
	for _, id := range b.order {
		if text := strings.TrimSpace(b.finals[id]); text != "" {
			parts = append(parts, text)
		}
	}
	return strings.Join(parts, "")
}

// run 是主循环：把上游事件翻译给浏览器，收尾时等所有句子定稿再发 completed。
func (b *openAIRealtimeBridge) run(client *websocket.Conn) error {
	clientDone := make(chan error, 1)
	go func() {
		clientDone <- b.forwardClientAudio(client)
		_ = b.upstream.Close()
	}()

	type upstreamMessage struct {
		body []byte
		err  error
	}
	messages := make(chan upstreamMessage, 64)
	go func() {
		for {
			_, body, err := b.upstream.ReadMessage()
			messages <- upstreamMessage{body: body, err: err}
			if err != nil {
				return
			}
		}
	}()

	var finishDeadline <-chan time.Time
	var graceTimer *time.Timer
	var grace <-chan time.Time
	// 收尾条件：没有等待中的提交、没有没定稿的句子。服务端断句的模型可能在 finish 之后才补提交一句，
	// 所以条件满足后再等一小会儿，期间没有新事件才算完。
	armGrace := func() {
		if !b.finishing() {
			return
		}
		if b.waitingCommits() == 0 && len(b.pending) == 0 {
			if graceTimer != nil {
				graceTimer.Stop()
			}
			graceTimer = time.NewTimer(openAIRealtimeFinishGrace)
			grace = graceTimer.C
		} else {
			grace = nil
		}
	}
	complete := func() error {
		if err := writeRealtimeClientEvent(client, realtimeTranscriptionServerEvent{Type: "completed", Text: b.completedText()}); err != nil {
			return err
		}
		return closeRealtimeClientNormally(client, clientDone)
	}

	for {
		select {
		case clientErr := <-clientDone:
			return clientErr
		case <-b.finishCh:
			finishDeadline = time.After(openAIRealtimeFinishTimeout)
			armGrace()
		case <-grace:
			return complete()
		case <-finishDeadline:
			// 等太久就把已有的结果交出去，没定稿的句子按当前的临时结果算。
			for itemID := range b.pending {
				id := b.sentenceID(itemID)
				if _, ok := b.finals[id]; !ok {
					b.order = append(b.order, id)
				}
				b.finals[id] = b.partials[itemID]
			}
			return complete()
		case message := <-messages:
			if message.err != nil {
				select {
				case clientErr := <-clientDone:
					return clientErr
				default:
				}
				_ = writeRealtimeClientEvent(client, realtimeTranscriptionServerEvent{
					Type:    "error",
					Code:    "upstream_closed",
					Message: "实时转写连接中断",
				})
				return message.err
			}
			var event openAIRealtimeEvent
			if json.Unmarshal(message.body, &event) != nil {
				continue
			}
			if err := b.handleEvent(client, event); err != nil {
				return err
			}
			armGrace()
		}
	}
}

func (b *openAIRealtimeBridge) handleEvent(client *websocket.Conn, event openAIRealtimeEvent) error {
	switch event.Type {
	case "input_audio_buffer.speech_stopped":
		// 服务端断句：这句音频的结束时间由服务端给出（按 24k 音频算的毫秒，和客户端时间一致）。
		if event.ItemID != "" {
			b.endTimes[event.ItemID] = event.AudioEndMS
		}
	case "input_audio_buffer.committed":
		if event.ItemID == "" {
			return nil
		}
		b.sentenceID(event.ItemID)
		b.pending[event.ItemID] = true
		// 服务端断句产生的提交已经有结束时间（来自 speech_stopped）；我们自己发的提交按发出顺序对上。
		// 收尾时我们发的提交如果被服务端断句抢先，缓冲区已空，会收到 commit_empty，在 error 分支里作废。
		if _, ok := b.endTimes[event.ItemID]; !ok {
			if offset, ok := b.popCommitOffset(); ok {
				b.endTimes[event.ItemID] = offset
			}
		}
	case "conversation.item.input_audio_transcription.delta":
		if event.ItemID == "" || event.Delta == "" {
			return nil
		}
		b.pending[event.ItemID] = true
		b.partials[event.ItemID] += event.Delta
		text := strings.TrimSpace(b.partials[event.ItemID])
		if text == "" {
			return nil
		}
		return writeRealtimeClientEvent(client, realtimeTranscriptionServerEvent{
			Type:       "partial",
			Text:       text,
			SentenceID: b.sentenceID(event.ItemID),
		})
	case "conversation.item.input_audio_transcription.completed", "conversation.item.input_audio_transcription.failed":
		if event.ItemID == "" {
			return nil
		}
		id := b.sentenceID(event.ItemID)
		delete(b.pending, event.ItemID)
		text := strings.TrimSpace(event.Transcript)
		if event.Type == "conversation.item.input_audio_transcription.failed" {
			text = strings.TrimSpace(b.partials[event.ItemID])
		}
		delete(b.partials, event.ItemID)
		if _, ok := b.finals[id]; !ok {
			b.order = append(b.order, id)
		}
		b.finals[id] = text
		begin := b.lastEnd
		end, ok := b.endTimes[event.ItemID]
		if !ok {
			end = begin
		}
		b.lastEnd = max(b.lastEnd, end)
		if text == "" {
			return nil
		}
		return writeRealtimeClientEvent(client, realtimeTranscriptionServerEvent{
			Type:       "final",
			Text:       text,
			SentenceID: id,
			BeginTime:  begin,
			EndTime:    end,
		})
	case "error":
		if event.Error.Code == openAIRealtimeCommitEmptyCode {
			// 缓冲区已经空了（服务端断句抢先提交了），这次提交作废。
			b.popCommitOffset()
			return nil
		}
		err := errors.New(event.errorText())
		_ = writeRealtimeClientEvent(client, realtimeTranscriptionServerEvent{Type: "error", Code: "task_failed", Message: err.Error()})
		return err
	}
	return nil
}
