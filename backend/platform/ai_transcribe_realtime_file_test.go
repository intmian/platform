package platform

import (
	"bytes"
	"context"
	"encoding/binary"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/gorilla/websocket"
)

func testWAV(sampleRate uint32, pcmBytes int) []byte {
	var b bytes.Buffer
	b.WriteString("RIFF")
	_ = binary.Write(&b, binary.LittleEndian, uint32(36+pcmBytes))
	b.WriteString("WAVEfmt ")
	_ = binary.Write(&b, binary.LittleEndian, uint32(16))
	_ = binary.Write(&b, binary.LittleEndian, uint16(1)) // PCM
	_ = binary.Write(&b, binary.LittleEndian, uint16(1)) // mono
	_ = binary.Write(&b, binary.LittleEndian, sampleRate)
	_ = binary.Write(&b, binary.LittleEndian, sampleRate*2)
	_ = binary.Write(&b, binary.LittleEndian, uint16(2))
	_ = binary.Write(&b, binary.LittleEndian, uint16(16))
	b.WriteString("data")
	_ = binary.Write(&b, binary.LittleEndian, uint32(pcmBytes))
	b.Write(make([]byte, pcmBytes))
	return b.Bytes()
}

func TestDashScopeRealtimeFileAudio(t *testing.T) {
	wav := testWAV(24000, 10)
	tests := []struct {
		name       string
		file       string
		head       []byte
		format     string
		sampleRate int
		wantErr    bool
	}{
		{name: "wav reads header", file: "a.wav", head: wav, format: "wav", sampleRate: 24000},
		{name: "broken wav falls back", file: "a.wav", head: []byte("nope"), format: "wav", sampleRate: 16000},
		{name: "mp3", file: "a.MP3", format: "mp3", sampleRate: 16000},
		{name: "ogg is opus", file: "a.ogg", format: "opus", sampleRate: 16000},
		{name: "webm unsupported", file: "a.webm", wantErr: true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := dashScopeRealtimeFileAudio(tt.file, tt.head)
			if tt.wantErr {
				if err == nil {
					t.Fatalf("want error, got %#v", got)
				}
				return
			}
			if err != nil || got.Format != tt.format || got.SampleRate != tt.sampleRate {
				t.Fatalf("got %#v, %v; want %s/%d", got, err, tt.format, tt.sampleRate)
			}
		})
	}
}

// 模拟上游：收 run-task → 回 task-started → 收音频直到 finish-task → 回两句结果和 task-finished。
func TestTranscribeDashScopeRealtimeFile(t *testing.T) {
	audio := testWAV(16000, 20000)
	var received bytes.Buffer
	var gotFormat string
	var gotRate int
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		conn, err := (&websocket.Upgrader{}).Upgrade(writer, request, nil)
		if err != nil {
			t.Errorf("upgrade: %v", err)
			return
		}
		defer conn.Close()
		var runTask struct {
			Header struct {
				TaskID string `json:"task_id"`
			} `json:"header"`
			Payload struct {
				Parameters struct {
					Format     string `json:"format"`
					SampleRate int    `json:"sample_rate"`
				} `json:"parameters"`
			} `json:"payload"`
		}
		if err := conn.ReadJSON(&runTask); err != nil {
			t.Errorf("read run-task: %v", err)
			return
		}
		gotFormat, gotRate = runTask.Payload.Parameters.Format, runTask.Payload.Parameters.SampleRate
		taskID := runTask.Header.TaskID
		_ = conn.WriteJSON(map[string]any{"header": map[string]any{"event": "task-started", "task_id": taskID}})
		for {
			messageType, body, err := conn.ReadMessage()
			if err != nil {
				t.Errorf("read audio: %v", err)
				return
			}
			if messageType == websocket.BinaryMessage {
				received.Write(body)
				continue
			}
			break // finish-task
		}
		sentence := func(id int, text string) map[string]any {
			return map[string]any{
				"header":  map[string]any{"event": "result-generated", "task_id": taskID},
				"payload": map[string]any{"output": map[string]any{"sentence": map[string]any{"sentence_id": id, "text": text, "sentence_end": true}}},
			}
		}
		_ = conn.WriteJSON(sentence(2, "世界。"))
		_ = conn.WriteJSON(sentence(1, "你好，"))
		_ = conn.WriteJSON(map[string]any{"header": map[string]any{"event": "task-finished", "task_id": taskID}})
	}))
	defer server.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	ret, err := transcribeDashScopeRealtimeFile(ctx, server.URL, "token", bytes.NewReader(audio), "sample.wav", "qwen-audio-3.0-asr-flash-streaming")
	if err != nil {
		t.Fatalf("transcribe: %v", err)
	}
	if ret.Text != "你好，世界。" {
		t.Fatalf("text = %q", ret.Text)
	}
	if gotFormat != "wav" || gotRate != 16000 {
		t.Fatalf("run-task audio = %s/%d", gotFormat, gotRate)
	}
	if !bytes.Equal(received.Bytes(), audio) {
		t.Fatalf("upstream received %d bytes, want %d", received.Len(), len(audio))
	}
}

func TestTranscribeDashScopeRealtimeFileTaskFailed(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		conn, err := (&websocket.Upgrader{}).Upgrade(writer, request, nil)
		if err != nil {
			return
		}
		defer conn.Close()
		var runTask struct {
			Header struct {
				TaskID string `json:"task_id"`
			} `json:"header"`
		}
		_ = conn.ReadJSON(&runTask)
		_ = conn.WriteJSON(map[string]any{"header": map[string]any{"event": "task-started", "task_id": runTask.Header.TaskID}})
		_, _, _ = conn.ReadMessage()
		_ = conn.WriteJSON(map[string]any{"header": map[string]any{
			"event": "task-failed", "task_id": runTask.Header.TaskID,
			"error_code": "InvalidParameter", "error_message": "bad audio",
		}})
	}))
	defer server.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	_, err := transcribeDashScopeRealtimeFile(ctx, server.URL, "token", bytes.NewReader(testWAV(16000, 100)), "a.wav", "m")
	if err == nil || err.Error() != "InvalidParameter: bad audio" {
		t.Fatalf("err = %v", err)
	}
}
