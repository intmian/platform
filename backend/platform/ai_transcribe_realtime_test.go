package platform

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/gorilla/websocket"
)

func TestDashScopeRealtimeEndpoint(t *testing.T) {
	tests := map[string]string{
		"":                               "wss://dashscope.aliyuncs.com/api-ws/v1/inference",
		"https://dashscope.aliyuncs.com": "wss://dashscope.aliyuncs.com/api-ws/v1/inference",
		"https://workspace.cn-beijing.maas.aliyuncs.com/api/v1":             "wss://workspace.cn-beijing.maas.aliyuncs.com/api-ws/v1/inference",
		"https://workspace.cn-beijing.maas.aliyuncs.com/compatible-mode/v1": "wss://workspace.cn-beijing.maas.aliyuncs.com/api-ws/v1/inference",
		"ws://127.0.0.1:9000/custom":                                        "ws://127.0.0.1:9000/api-ws/v1/inference",
	}
	for input, want := range tests {
		got, err := dashScopeRealtimeEndpoint(input)
		if err != nil {
			t.Fatalf("dashScopeRealtimeEndpoint(%q): %v", input, err)
		}
		if got != want {
			t.Errorf("dashScopeRealtimeEndpoint(%q) = %q, want %q", input, got, want)
		}
	}
}

func TestDashScopeRealtimeEndpointRejectsInvalidURL(t *testing.T) {
	for _, input := range []string{"dashscope.aliyuncs.com", "ftp://dashscope.aliyuncs.com"} {
		if _, err := dashScopeRealtimeEndpoint(input); err == nil {
			t.Errorf("dashScopeRealtimeEndpoint(%q) should fail", input)
		}
	}
}

func TestParseDashScopeRealtimeResultEvent(t *testing.T) {
	event, err := parseDashScopeRealtimeEvent([]byte(`{
		"header":{"event":"result-generated","task_id":"task-1"},
		"payload":{"output":{"sentence":{
			"begin_time":170,
			"end_time":920,
			"text":"你好。",
			"sentence_end":true,
			"sentence_id":2
		}}}
	}`))
	if err != nil {
		t.Fatalf("parseDashScopeRealtimeEvent: %v", err)
	}
	sentence := event.Payload.Output.Sentence
	if event.Header.Event != "result-generated" ||
		sentence.Text != "你好。" ||
		!sentence.SentenceEnd ||
		sentence.SentenceID != 2 ||
		sentence.BeginTime != 170 ||
		sentence.EndTime != 920 {
		t.Fatalf("unexpected event: %#v", event)
	}
}

func TestDashScopeRealtimeTaskError(t *testing.T) {
	event, err := parseDashScopeRealtimeEvent([]byte(`{
		"header":{"event":"task-failed","error_code":"InvalidParameter","error_message":"bad audio"},
		"payload":{}
	}`))
	if err != nil {
		t.Fatalf("parseDashScopeRealtimeEvent: %v", err)
	}
	got := dashScopeRealtimeEventError(event).Error()
	if got != "InvalidParameter: bad audio" {
		t.Fatalf("dashScopeRealtimeEventError = %q", got)
	}
}

func TestConnectDashScopeRealtimeStartsTask(t *testing.T) {
	requestReceived := make(chan struct{}, 1)
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		if request.URL.Path != dashScopeRealtimePath {
			t.Errorf("path = %q, want %q", request.URL.Path, dashScopeRealtimePath)
		}
		if request.Header.Get("Authorization") != "Bearer test-token" {
			t.Errorf("Authorization = %q", request.Header.Get("Authorization"))
		}
		conn, err := (&websocket.Upgrader{CheckOrigin: func(*http.Request) bool { return true }}).Upgrade(writer, request, nil)
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
				Model      string `json:"model"`
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
		if runTask.Payload.Model != "fun-asr-flash-8k-realtime" ||
			runTask.Payload.Parameters.Format != "pcm" ||
			runTask.Payload.Parameters.SampleRate != 8000 {
			t.Errorf("unexpected run-task: %#v", runTask)
		}
		if _, err := uuid.Parse(runTask.Header.TaskID); err != nil {
			t.Errorf("task_id = %q, want canonical UUID: %v", runTask.Header.TaskID, err)
		}
		requestReceived <- struct{}{}
		_ = conn.WriteJSON(map[string]any{
			"header": map[string]any{
				"event":   "task-started",
				"task_id": runTask.Header.TaskID,
			},
			"payload": map[string]any{},
		})
	}))
	defer server.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	conn, taskID, err := connectDashScopeRealtime(
		ctx,
		server.URL,
		"test-token",
		"fun-asr-flash-8k-realtime",
	)
	if err != nil {
		t.Fatalf("connectDashScopeRealtime: %v", err)
	}
	defer conn.Close()
	if taskID == "" {
		t.Fatal("taskID is empty")
	}
	select {
	case <-requestReceived:
	case <-ctx.Done():
		t.Fatal("mock upstream did not receive run-task")
	}
}

func TestDescribeDashScopeRealtimeReadError(t *testing.T) {
	tests := []struct {
		name string
		err  error
		want string
	}{
		{
			name: "close reason",
			err:  &websocket.CloseError{Code: websocket.ClosePolicyViolation, Text: "invalid task_id"},
			want: "DashScope realtime closed with WebSocket code 1008: invalid task_id",
		},
		{
			name: "eof",
			err:  errors.New("EOF"),
			want: "DashScope realtime connection closed before task-started (EOF)",
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := describeDashScopeRealtimeReadError(tt.err).Error(); got != tt.want {
				t.Fatalf("describeDashScopeRealtimeReadError = %q, want %q", got, tt.want)
			}
		})
	}
}

func TestRealtimeTranscriptionOriginAllowed(t *testing.T) {
	tests := []struct {
		name   string
		host   string
		origin string
		want   bool
	}{
		{name: "same host", host: "platform.example.com", origin: "https://platform.example.com", want: true},
		{name: "same loopback different port", host: "127.0.0.1:8080", origin: "http://localhost:5173", want: true},
		{name: "different host", host: "platform.example.com", origin: "https://evil.example.com", want: false},
		{name: "missing origin", host: "platform.example.com", want: true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			request := httptest.NewRequest("GET", "http://"+tt.host+"/misc/ai/transcribe/realtime", nil)
			request.Host = tt.host
			if tt.origin != "" {
				request.Header.Set("Origin", tt.origin)
			}
			if got := realtimeTranscriptionOriginAllowed(request); got != tt.want {
				t.Fatalf("realtimeTranscriptionOriginAllowed(%q, %q) = %v, want %v", tt.host, tt.origin, got, tt.want)
			}
		})
	}
}

func TestHostName(t *testing.T) {
	if got := hostName("[::1]:8080"); got != "::1" {
		t.Fatalf("hostName IPv6 = %q", got)
	}
	if got := hostName("EXAMPLE.COM"); !strings.EqualFold(got, "example.com") {
		t.Fatalf("hostName DNS = %q", got)
	}
}

func TestBridgeDashScopeRealtimeCompletionClosesNormally(t *testing.T) {
	for _, mode := range []string{"reply_after_close", "close_after_completed", "no_close_reply"} {
		t.Run(mode, func(t *testing.T) {
			client, browser := realtimeTestSocketPair(t)
			provider, upstream := realtimeTestSocketPair(t)
			bridgeDone := make(chan error, 1)
			go func() {
				err := new(webMgr).bridgeDashScopeRealtime(client, upstream, "test-task")
				_ = upstream.Close()
				_ = client.Close()
				bridgeDone <- err
			}()

			if err := browser.WriteJSON(realtimeTranscriptionClientEvent{Type: "finish"}); err != nil {
				t.Fatal(err)
			}
			var finish struct {
				Header struct {
					Action string `json:"action"`
					TaskID string `json:"task_id"`
				} `json:"header"`
			}
			if err := provider.ReadJSON(&finish); err != nil {
				t.Fatalf("read finish-task: %v", err)
			}
			if finish.Header.Action != "finish-task" || finish.Header.TaskID != "test-task" {
				t.Fatalf("unexpected finish-task: %#v", finish)
			}

			// Final sentences may arrive out of order or be corrected before completion.
			for _, sentence := range []struct {
				id   int
				text string
			}{{2, "世界。"}, {1, "您好，"}, {1, "你好，"}} {
				event := dashScopeRealtimeEvent{}
				event.Header.Event = "result-generated"
				event.Payload.Output.Sentence.SentenceID = sentence.id
				event.Payload.Output.Sentence.Text = sentence.text
				event.Payload.Output.Sentence.SentenceEnd = true
				if err := provider.WriteJSON(event); err != nil {
					t.Fatal(err)
				}
				var result realtimeTranscriptionServerEvent
				if err := browser.ReadJSON(&result); err != nil {
					t.Fatal(err)
				}
				if result.Type != "final" || result.Text != sentence.text {
					t.Fatalf("unexpected sentence: %#v", result)
				}
			}

			started := time.Now()
			if err := provider.WriteJSON(map[string]any{"header": map[string]string{"event": "task-finished"}}); err != nil {
				t.Fatal(err)
			}
			var completed realtimeTranscriptionServerEvent
			if err := browser.ReadJSON(&completed); err != nil {
				t.Fatalf("read completed: %v", err)
			}
			if completed.Type != "completed" || completed.Text != "你好，世界。" {
				t.Fatalf("unexpected completion: %#v", completed)
			}

			// Read the server close frame without automatically acknowledging it.
			browser.SetCloseHandler(func(int, string) error { return nil })
			reply := func() {
				t.Helper()
				if err := browser.WriteControl(websocket.CloseMessage,
					websocket.FormatCloseMessage(websocket.CloseNormalClosure, "done"),
					time.Now().Add(time.Second)); err != nil {
					t.Fatalf("send close reply: %v", err)
				}
			}
			if mode == "close_after_completed" {
				reply()
			}
			if _, _, err := browser.ReadMessage(); !websocket.IsCloseError(err, websocket.CloseNormalClosure) {
				t.Fatalf("close = %v, want WebSocket code 1000", err)
			}
			if mode == "reply_after_close" {
				select {
				case err := <-bridgeDone:
					t.Fatalf("bridge returned before close reply: %v", err)
				default:
				}
				reply()
			}
			select {
			case err := <-bridgeDone:
				if err != nil {
					t.Fatalf("bridge: %v", err)
				}
			case <-time.After(4 * time.Second):
				t.Fatal("bridge did not release connections after close")
			}
			if mode == "no_close_reply" && time.Since(started) < 2*time.Second {
				t.Fatal("bridge did not wait for the close handshake timeout")
			}
		})
	}
}

func realtimeTestSocketPair(t *testing.T) (*websocket.Conn, *websocket.Conn) {
	t.Helper()
	accepted := make(chan *websocket.Conn, 1)
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		conn, err := (&websocket.Upgrader{}).Upgrade(writer, request, nil)
		if err != nil {
			t.Errorf("upgrade test socket: %v", err)
			return
		}
		accepted <- conn
	}))
	t.Cleanup(server.Close)
	peer, _, err := websocket.DefaultDialer.Dial("ws"+strings.TrimPrefix(server.URL, "http"), nil)
	if err != nil {
		t.Fatalf("dial test socket: %v", err)
	}
	t.Cleanup(func() { _ = peer.Close() })
	conn := <-accepted
	t.Cleanup(func() { _ = conn.Close() })
	for _, socket := range []*websocket.Conn{conn, peer} {
		_ = socket.SetReadDeadline(time.Now().Add(5 * time.Second))
		_ = socket.SetWriteDeadline(time.Now().Add(5 * time.Second))
	}
	return conn, peer
}
