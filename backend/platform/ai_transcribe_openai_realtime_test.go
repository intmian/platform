package platform

import (
	"encoding/base64"
	"encoding/binary"
	"encoding/json"
	"math"
	"testing"
	"time"

	"github.com/gorilla/websocket"
	"github.com/intmian/platform/backend/share"
)

func TestOpenAIRealtimeSessionUpdateByModel(t *testing.T) {
	input := func(model string) map[string]any {
		update := openAIRealtimeSessionUpdate(model)
		raw, _ := json.Marshal(update)
		var decoded struct {
			Session struct {
				Type  string `json:"type"`
				Audio struct {
					Input map[string]any `json:"input"`
				} `json:"audio"`
			} `json:"session"`
		}
		if err := json.Unmarshal(raw, &decoded); err != nil {
			t.Fatal(err)
		}
		if decoded.Session.Type != "transcription" {
			t.Fatalf("%s: session type = %q", model, decoded.Session.Type)
		}
		return decoded.Session.Audio.Input
	}

	live := input("gpt-live-transcribe")
	liveTranscription := live["transcription"].(map[string]any)
	if live["turn_detection"] != nil || liveTranscription["languages"] == nil || liveTranscription["language"] != nil {
		t.Fatalf("gpt-live-transcribe input = %#v", live)
	}
	if format := live["format"].(map[string]any); format["rate"] != float64(24000) {
		t.Fatalf("format = %#v", format)
	}

	whisper := input("gpt-realtime-whisper")
	whisperTranscription := whisper["transcription"].(map[string]any)
	if whisper["turn_detection"] != nil || whisperTranscription["language"] != "zh" || whisperTranscription["languages"] != nil {
		t.Fatalf("gpt-realtime-whisper input = %#v", whisper)
	}

	for _, model := range []string{"gpt-transcribe", "gpt-4o-transcribe", "gpt-4o-mini-transcribe", "whisper-1"} {
		in := input(model)
		turn, _ := in["turn_detection"].(map[string]any)
		transcription := in["transcription"].(map[string]any)
		if turn["type"] != "server_vad" || transcription["language"] != "zh" || transcription["prompt"] == nil {
			t.Fatalf("%s input = %#v", model, in)
		}
	}
}

func TestOpenAIRealtimeEndpoint(t *testing.T) {
	cases := []struct {
		provider share.AIProviderConfig
		want     string
	}{
		{share.AIProviderConfig{}, "wss://api.openai.com/v1/realtime?intent=transcription"},
		{share.AIProviderConfig{ProxyURL: "https://relay.example/tok/"}, "wss://relay.example/tok/api.openai.com/v1/realtime?intent=transcription"},
		{share.AIProviderConfig{BaseURL: "http://local.example:4747/v1/"}, "ws://local.example:4747/v1/realtime?intent=transcription"},
	}
	for _, c := range cases {
		got, err := openAIRealtimeEndpoint(c.provider)
		if err != nil || got != c.want {
			t.Errorf("openAIRealtimeEndpoint(%+v) = %q, %v; want %q", c.provider, got, err, c.want)
		}
	}
}

func TestPCMResamplerIsContinuousAcrossFrames(t *testing.T) {
	ramp := make([]int16, 1600)
	for i := range ramp {
		ramp[i] = int16(i * 10)
	}
	whole := newPCMResampler(16000, 24000).process(ramp)

	split := newPCMResampler(16000, 24000)
	var pieces []int16
	for _, part := range [][]int16{ramp[:333], ramp[333:1000], ramp[1000:]} {
		pieces = append(pieces, split.process(part)...)
	}
	if len(whole) != len(pieces) {
		t.Fatalf("len whole=%d split=%d", len(whole), len(pieces))
	}
	for i := range whole {
		if whole[i] != pieces[i] {
			t.Fatalf("sample %d: whole=%d split=%d", i, whole[i], pieces[i])
		}
	}
	// 1600 个 16k 采样（100ms）约等于 2400 个 24k 采样，最后一个要等下一帧才能插出来。
	if len(whole) < 2398 || len(whole) > 2400 {
		t.Fatalf("output length = %d", len(whole))
	}
	// 线性插值：输出第 3 个采样落在输入第 2 个上。
	if whole[3] != ramp[2] {
		t.Fatalf("whole[3] = %d, want %d", whole[3], ramp[2])
	}
}

func TestDecodeWAVPCM16MonoMixesChannels(t *testing.T) {
	wav := testStereoWAV(2, 8000, [][2]int16{{100, 300}, {-200, 200}, {1000, 0}})
	samples, rate, err := decodeWAVPCM16Mono(wav)
	if err != nil {
		t.Fatal(err)
	}
	if rate != 8000 || len(samples) != 3 || samples[0] != 200 || samples[1] != 0 || samples[2] != 500 {
		t.Fatalf("samples=%v rate=%d", samples, rate)
	}
	if _, _, err := decodeWAVPCM16Mono([]byte("ID3 not a wav file")); err == nil {
		t.Fatal("non-wav input should fail")
	}
}

func TestClientCommitDetector(t *testing.T) {
	var detector clientCommitDetector
	speech := testTone(1600, 3000) // 100ms 有声
	silence := make([]int16, 1600) // 100ms 静音
	// 只有静音不提交。
	for i := 0; i < 20; i++ {
		if detector.feed(silence, 16000) {
			t.Fatal("silence alone should not commit")
		}
	}
	for i := 0; i < 5; i++ {
		if detector.feed(speech, 16000) {
			t.Fatal("should not commit while speaking")
		}
	}
	committed := -1
	for i := 0; i < 10; i++ {
		if detector.feed(silence, 16000) {
			committed = i
			break
		}
	}
	if committed != 6 { // 第 7 个 100ms 静音时满 700ms
		t.Fatalf("committed after %d silent frames", committed+1)
	}
}

// 边说边出字的模型：后端按停顿提交，partial 是累积文本，final 带结束时间，finish 后发 completed 并正常关闭。
func TestOpenAIRealtimeBridgeClientCommit(t *testing.T) {
	client, browser := realtimeTestSocketPair(t)
	provider, upstream := realtimeTestSocketPair(t)
	bridge := newOpenAIRealtimeBridge(upstream, "gpt-live-transcribe")
	done := make(chan error, 1)
	go func() {
		err := bridge.run(client)
		_ = upstream.Close()
		_ = client.Close()
		done <- err
	}()

	readUpstream := func() map[string]any {
		t.Helper()
		var event map[string]any
		if err := provider.ReadJSON(&event); err != nil {
			t.Fatalf("read upstream: %v", err)
		}
		return event
	}
	readBrowser := func() realtimeTranscriptionServerEvent {
		t.Helper()
		var event realtimeTranscriptionServerEvent
		if err := browser.ReadJSON(&event); err != nil {
			t.Fatalf("read browser: %v", err)
		}
		return event
	}
	sendAudio := func(samples []int16) {
		t.Helper()
		if err := browser.WriteMessage(websocket.BinaryMessage, pcm16ToBytes(samples)); err != nil {
			t.Fatal(err)
		}
	}

	// 500ms 有声 + 700ms 静音 → 推 12 帧音频后提交一次。
	appended := 0
	for i := 0; i < 5; i++ {
		sendAudio(testTone(1600, 3000))
	}
	for i := 0; i < 7; i++ {
		sendAudio(make([]int16, 1600))
	}
	for appended < 12 {
		event := readUpstream()
		if event["type"] != "input_audio_buffer.append" {
			t.Fatalf("unexpected upstream event before commit: %v", event["type"])
		}
		audio, _ := base64.StdEncoding.DecodeString(event["audio"].(string))
		if len(audio) < 2390*2 || len(audio) > 2410*2 {
			t.Fatalf("appended %d bytes, want ~2400 samples at 24k", len(audio))
		}
		appended++
	}
	if event := readUpstream(); event["type"] != "input_audio_buffer.commit" {
		t.Fatalf("want commit, got %v", event["type"])
	}

	for _, event := range []map[string]any{
		{"type": "conversation.item.input_audio_transcription.delta", "item_id": "a", "delta": "你好"},
		{"type": "conversation.item.input_audio_transcription.delta", "item_id": "a", "delta": "，世界"},
		{"type": "input_audio_buffer.committed", "item_id": "a"},
		{"type": "conversation.item.input_audio_transcription.completed", "item_id": "a", "transcript": "你好，世界。"},
	} {
		if err := provider.WriteJSON(event); err != nil {
			t.Fatal(err)
		}
	}
	if got := readBrowser(); got.Type != "partial" || got.Text != "你好" || got.SentenceID != 1 {
		t.Fatalf("partial 1 = %#v", got)
	}
	if got := readBrowser(); got.Type != "partial" || got.Text != "你好，世界" {
		t.Fatalf("partial 2 = %#v", got)
	}
	if got := readBrowser(); got.Type != "final" || got.Text != "你好，世界。" || got.EndTime != 1200 || got.SentenceID != 1 {
		t.Fatalf("final = %#v", got)
	}

	// 再说 300ms 然后结束：剩下的音频要提交，第二句定稿后发 completed。
	for i := 0; i < 3; i++ {
		sendAudio(testTone(1600, 3000))
	}
	if err := browser.WriteJSON(realtimeTranscriptionClientEvent{Type: "finish"}); err != nil {
		t.Fatal(err)
	}
	for {
		event := readUpstream()
		if event["type"] == "input_audio_buffer.commit" {
			break
		}
	}
	for _, event := range []map[string]any{
		{"type": "input_audio_buffer.committed", "item_id": "b", "previous_item_id": "a"},
		{"type": "conversation.item.input_audio_transcription.completed", "item_id": "b", "transcript": "再见。"},
	} {
		if err := provider.WriteJSON(event); err != nil {
			t.Fatal(err)
		}
	}
	if got := readBrowser(); got.Type != "final" || got.Text != "再见。" || got.BeginTime != 1200 || got.EndTime != 1500 {
		t.Fatalf("final 2 = %#v", got)
	}
	if got := readBrowser(); got.Type != "completed" || got.Text != "你好，世界。再见。" {
		t.Fatalf("completed = %#v", got)
	}
	if _, _, err := browser.ReadMessage(); !websocket.IsCloseError(err, websocket.CloseNormalClosure) {
		t.Fatalf("close = %v, want 1000", err)
	}
	select {
	case err := <-done:
		if err != nil {
			t.Fatalf("bridge: %v", err)
		}
	case <-time.After(4 * time.Second):
		t.Fatal("bridge did not finish")
	}
}

// 服务端断句的模型：结束时间来自 speech_stopped；收尾时的手动提交如果撞上 commit_empty 要忽略。
func TestOpenAIRealtimeBridgeServerVAD(t *testing.T) {
	client, browser := realtimeTestSocketPair(t)
	provider, upstream := realtimeTestSocketPair(t)
	bridge := newOpenAIRealtimeBridge(upstream, "gpt-4o-transcribe")
	done := make(chan error, 1)
	go func() {
		err := bridge.run(client)
		_ = upstream.Close()
		_ = client.Close()
		done <- err
	}()

	for i := 0; i < 3; i++ {
		if err := browser.WriteMessage(websocket.BinaryMessage, pcm16ToBytes(testTone(1600, 3000))); err != nil {
			t.Fatal(err)
		}
	}
	if err := browser.WriteJSON(realtimeTranscriptionClientEvent{Type: "finish"}); err != nil {
		t.Fatal(err)
	}
	commits := 0
	for commits == 0 {
		var event map[string]any
		if err := provider.ReadJSON(&event); err != nil {
			t.Fatal(err)
		}
		if event["type"] == "input_audio_buffer.commit" {
			commits++
		}
	}
	for _, event := range []map[string]any{
		{"type": "input_audio_buffer.speech_stopped", "item_id": "x", "audio_end_ms": 280},
		{"type": "input_audio_buffer.committed", "item_id": "x"},
		{"type": "error", "error": map[string]any{"type": "invalid_request_error", "code": "input_audio_buffer_commit_empty", "message": "buffer too small"}},
		{"type": "conversation.item.input_audio_transcription.completed", "item_id": "x", "transcript": "测试。"},
	} {
		if err := provider.WriteJSON(event); err != nil {
			t.Fatal(err)
		}
	}
	var final, completed realtimeTranscriptionServerEvent
	if err := browser.ReadJSON(&final); err != nil {
		t.Fatal(err)
	}
	if final.Type != "final" || final.Text != "测试。" || final.EndTime != 280 {
		t.Fatalf("final = %#v", final)
	}
	if err := browser.ReadJSON(&completed); err != nil {
		t.Fatal(err)
	}
	if completed.Type != "completed" || completed.Text != "测试。" {
		t.Fatalf("completed = %#v", completed)
	}
	browser.SetCloseHandler(func(int, string) error { return nil })
	_, _, _ = browser.ReadMessage()
	_ = browser.WriteControl(websocket.CloseMessage, websocket.FormatCloseMessage(websocket.CloseNormalClosure, ""), time.Now().Add(time.Second))
	select {
	case err := <-done:
		if err != nil {
			t.Fatalf("bridge: %v", err)
		}
	case <-time.After(4 * time.Second):
		t.Fatal("bridge did not finish")
	}
}

func testTone(n int, amplitude float64) []int16 {
	out := make([]int16, n)
	for i := range out {
		out[i] = int16(amplitude * math.Sin(2*math.Pi*440*float64(i)/16000))
	}
	return out
}

func testStereoWAV(channels, rate int, frames [][2]int16) []byte {
	data := make([]byte, 0, len(frames)*channels*2)
	for _, frame := range frames {
		for c := 0; c < channels; c++ {
			data = binary.LittleEndian.AppendUint16(data, uint16(frame[c]))
		}
	}
	out := []byte("RIFF")
	out = binary.LittleEndian.AppendUint32(out, uint32(36+len(data)))
	out = append(out, []byte("WAVEfmt ")...)
	out = binary.LittleEndian.AppendUint32(out, 16)
	out = binary.LittleEndian.AppendUint16(out, 1)
	out = binary.LittleEndian.AppendUint16(out, uint16(channels))
	out = binary.LittleEndian.AppendUint32(out, uint32(rate))
	out = binary.LittleEndian.AppendUint32(out, uint32(rate*channels*2))
	out = binary.LittleEndian.AppendUint16(out, uint16(channels*2))
	out = binary.LittleEndian.AppendUint16(out, 16)
	out = append(out, []byte("data")...)
	out = binary.LittleEndian.AppendUint32(out, uint32(len(data)))
	return append(out, data...)
}
