package platform

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net"
	"net/http"
	"net/url"
	"slices"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/gorilla/websocket"
	aiv2 "github.com/intmian/mian_go_lib/tool/ai/v2"
	"github.com/intmian/platform/backend/share"
)

const (
	dashScopeRealtimePath         = "/api-ws/v1/inference"
	dashScopeRealtimeSampleRate   = 8000
	realtimeHandshakeTimeout      = 15 * time.Second
	realtimeTranscriptionTimeout  = 10 * time.Minute
	realtimeClientMessageMaxBytes = 64 << 10
)

var errNoRealtimeTranscriptionModel = errors.New("stt queue has no DashScope realtime model")

var realtimeTranscriptionUpgrader = websocket.Upgrader{
	ReadBufferSize:  4096,
	WriteBufferSize: 4096,
	CheckOrigin:     realtimeTranscriptionOriginAllowed,
}

type realtimeTranscriptionClientEvent struct {
	Type string `json:"type"`
}

type realtimeTranscriptionServerEvent struct {
	Type       string       `json:"type"`
	Text       string       `json:"text,omitempty"`
	Message    string       `json:"message,omitempty"`
	Code       string       `json:"code,omitempty"`
	SentenceID int          `json:"sentenceID,omitempty"`
	BeginTime  int64        `json:"beginTime,omitempty"`
	EndTime    int64        `json:"endTime,omitempty"`
	SampleRate int          `json:"sampleRate,omitempty"`
	ProviderID string       `json:"providerID,omitempty"`
	ModelID    aiv2.ModelID `json:"modelID,omitempty"`
	Model      string       `json:"model,omitempty"`
	TaskID     string       `json:"taskID,omitempty"`
}

type dashScopeRealtimeEvent struct {
	Header struct {
		Event        string `json:"event"`
		TaskID       string `json:"task_id"`
		ErrorCode    string `json:"error_code"`
		ErrorMessage string `json:"error_message"`
	} `json:"header"`
	Payload struct {
		Code    string `json:"code"`
		Message string `json:"message"`
		Output  struct {
			Sentence struct {
				BeginTime   int64  `json:"begin_time"`
				EndTime     int64  `json:"end_time"`
				Text        string `json:"text"`
				SentenceEnd bool   `json:"sentence_end"`
				SentenceID  int    `json:"sentence_id"`
			} `json:"sentence"`
		} `json:"output"`
	} `json:"payload"`
}

func (m *webMgr) aiTranscribeRealtime(c *gin.Context) {
	valid := m.getValid(c)
	if !valid.HasOnePermission(share.PermissionAdmin, share.PermissionAI) {
		c.JSON(http.StatusForbidden, makeErrReturn("no permission"))
		return
	}

	client, err := realtimeTranscriptionUpgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		return
	}
	defer client.Close()
	client.SetReadLimit(realtimeClientMessageMaxBytes)

	ctx, cancel := context.WithTimeout(c.Request.Context(), realtimeTranscriptionTimeout)
	defer cancel()

	items, err := m.resolveRealtimeTranscriptionItems()
	if err != nil {
		_ = writeRealtimeClientEvent(client, realtimeTranscriptionServerEvent{
			Type:    "error",
			Code:    "config_error",
			Message: err.Error(),
		})
		return
	}

	upstream, selected, taskID, err := connectDashScopeRealtimeQueue(ctx, items)
	if err != nil {
		_ = writeRealtimeClientEvent(client, realtimeTranscriptionServerEvent{
			Type:    "error",
			Code:    "upstream_connect_failed",
			Message: err.Error(),
		})
		return
	}
	defer upstream.Close()

	if err := writeRealtimeClientEvent(client, realtimeTranscriptionServerEvent{
		Type:       "ready",
		SampleRate: dashScopeRealtimeSampleRate,
		ProviderID: selected.Provider.ID,
		ModelID:    selected.Model.ID,
		Model:      selected.Model.Name,
		TaskID:     taskID,
	}); err != nil {
		return
	}

	_ = m.bridgeDashScopeRealtime(client, upstream, taskID)
}

func (m *webMgr) aiTranscribeCapability(c *gin.Context) {
	valid := m.getValid(c)
	if !valid.HasOnePermission(share.PermissionAdmin, share.PermissionAI) {
		c.JSON(http.StatusOK, makeErrReturn("no permission"))
		return
	}

	if _, err := m.resolveRealtimeTranscriptionItems(); err == nil {
		c.JSON(http.StatusOK, makeOkReturn(aiTranscribeCapabilityResp{
			Mode:       "realtime",
			SampleRate: dashScopeRealtimeSampleRate,
		}))
		return
	} else if !errors.Is(err, errNoRealtimeTranscriptionModel) {
		c.JSON(http.StatusOK, makeErrReturn(err.Error()))
		return
	}
	c.JSON(http.StatusOK, makeOkReturn(aiTranscribeCapabilityResp{Mode: "file"}))
}

func (m *webMgr) resolveRealtimeTranscriptionItems() ([]share.AIResolvedQueueItem, error) {
	config, err := share.GetAIPlatformConfig(m.plat.cfg)
	if err != nil {
		return nil, errors.New("ai config error")
	}
	queueID, err := config.QueueIDForScene(share.AISceneTranscribe, aiv2.ModelTypeSTT)
	if err != nil || strings.TrimSpace(queueID) == "" {
		return nil, errors.New("stt queue is not configured")
	}
	items, err := config.ResolveQueue(queueID, aiv2.ModelTypeSTT)
	if err != nil {
		return nil, err
	}
	realtimeItems := make([]share.AIResolvedQueueItem, 0, len(items))
	for _, item := range items {
		protocol, protocolErr := share.ResolveAIModelCallProtocol(item.Provider.Protocol, item.Model)
		if protocolErr != nil {
			continue
		}
		if protocol == aiv2.ModelCallProtocolDashScopeFunASRRealtime {
			realtimeItems = append(realtimeItems, item)
		}
	}
	if len(realtimeItems) == 0 {
		return nil, errNoRealtimeTranscriptionModel
	}
	return realtimeItems, nil
}

func connectDashScopeRealtimeQueue(
	ctx context.Context,
	items []share.AIResolvedQueueItem,
) (*websocket.Conn, share.AIResolvedQueueItem, string, error) {
	var errs []error
	for _, item := range items {
		baseURL := strings.TrimSpace(item.Provider.BaseURL)
		token := strings.TrimSpace(item.Provider.Token)
		model := strings.TrimSpace(item.Model.Name)
		label := fmt.Sprintf("%s/%s", item.Provider.ID, item.Model.ID)
		if token == "" || token == "need input" {
			errs = append(errs, fmt.Errorf("%s: provider token is empty", label))
			continue
		}
		if model == "" {
			errs = append(errs, fmt.Errorf("%s: stt model is empty", label))
			continue
		}
		conn, taskID, err := connectDashScopeRealtime(ctx, baseURL, token, model)
		if err != nil {
			errs = append(errs, fmt.Errorf("%s: %w", label, err))
			continue
		}
		return conn, item, taskID, nil
	}
	if len(errs) == 0 {
		return nil, share.AIResolvedQueueItem{}, "", errors.New("realtime stt queue is empty")
	}
	return nil, share.AIResolvedQueueItem{}, "", errors.Join(errs...)
}

func connectDashScopeRealtime(
	ctx context.Context,
	baseURL string,
	token string,
	model string,
) (*websocket.Conn, string, error) {
	endpoint, err := dashScopeRealtimeEndpoint(baseURL)
	if err != nil {
		return nil, "", err
	}
	headers := http.Header{}
	headers.Set("Authorization", "Bearer "+token)
	dialer := websocket.Dialer{
		HandshakeTimeout: realtimeHandshakeTimeout,
		Proxy:            http.ProxyFromEnvironment,
	}
	conn, response, err := dialer.DialContext(ctx, endpoint, headers)
	if err != nil {
		if response != nil {
			return nil, "", fmt.Errorf("DashScope realtime handshake failed (%d)", response.StatusCode)
		}
		return nil, "", err
	}

	// DashScope requires task_id to retain the canonical UUID form, including hyphens.
	taskID := uuid.NewString()
	runTask := map[string]any{
		"header": map[string]any{
			"action":    "run-task",
			"task_id":   taskID,
			"streaming": "duplex",
		},
		"payload": map[string]any{
			"task_group": "audio",
			"task":       "asr",
			"function":   "recognition",
			"model":      model,
			"parameters": map[string]any{
				"format":         "pcm",
				"sample_rate":    dashScopeRealtimeSampleRate,
				"language_hints": []string{"zh"},
			},
			"input": map[string]any{},
		},
	}
	if err := conn.SetWriteDeadline(time.Now().Add(realtimeHandshakeTimeout)); err != nil {
		_ = conn.Close()
		return nil, "", err
	}
	if err := conn.WriteJSON(runTask); err != nil {
		_ = conn.Close()
		return nil, "", err
	}
	if err := conn.SetReadDeadline(time.Now().Add(realtimeHandshakeTimeout)); err != nil {
		_ = conn.Close()
		return nil, "", err
	}
	for {
		_, body, readErr := conn.ReadMessage()
		if readErr != nil {
			_ = conn.Close()
			return nil, "", describeDashScopeRealtimeReadError(readErr)
		}
		event, parseErr := parseDashScopeRealtimeEvent(body)
		if parseErr != nil {
			continue
		}
		switch event.Header.Event {
		case "task-started":
			_ = conn.SetReadDeadline(time.Time{})
			_ = conn.SetWriteDeadline(time.Time{})
			return conn, taskID, nil
		case "task-failed":
			_ = conn.Close()
			return nil, "", dashScopeRealtimeEventError(event)
		}
	}
}

func describeDashScopeRealtimeReadError(err error) error {
	if err == nil {
		return nil
	}
	var closeErr *websocket.CloseError
	if errors.As(err, &closeErr) {
		reason := strings.TrimSpace(closeErr.Text)
		if reason == "" {
			reason = http.StatusText(closeErr.Code)
		}
		if reason == "" {
			return fmt.Errorf("DashScope realtime closed with WebSocket code %d", closeErr.Code)
		}
		return fmt.Errorf("DashScope realtime closed with WebSocket code %d: %s", closeErr.Code, reason)
	}
	if errors.Is(err, net.ErrClosed) {
		return errors.New("DashScope realtime connection closed before task-started")
	}
	if strings.TrimSpace(err.Error()) == "EOF" {
		return errors.New("DashScope realtime connection closed before task-started (EOF)")
	}
	return fmt.Errorf("DashScope realtime read before task-started: %w", err)
}

func (m *webMgr) bridgeDashScopeRealtime(client *websocket.Conn, upstream *websocket.Conn, taskID string) error {
	clientDone := make(chan error, 1)
	go func() {
		clientDone <- forwardRealtimeClientAudio(client, upstream, taskID)
		_ = upstream.Close()
	}()

	finalSentences := make(map[int]string)
	sentenceOrder := make([]int, 0)
	for {
		_, body, err := upstream.ReadMessage()
		if err != nil {
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
			return err
		}
		event, err := parseDashScopeRealtimeEvent(body)
		if err != nil {
			continue
		}
		switch event.Header.Event {
		case "result-generated":
			sentence := event.Payload.Output.Sentence
			text := strings.TrimSpace(sentence.Text)
			if text == "" {
				continue
			}
			eventType := "partial"
			if sentence.SentenceEnd {
				eventType = "final"
				if _, exists := finalSentences[sentence.SentenceID]; !exists {
					sentenceOrder = append(sentenceOrder, sentence.SentenceID)
				}
				finalSentences[sentence.SentenceID] = text
			}
			if err := writeRealtimeClientEvent(client, realtimeTranscriptionServerEvent{
				Type:       eventType,
				Text:       text,
				SentenceID: sentence.SentenceID,
				BeginTime:  sentence.BeginTime,
				EndTime:    sentence.EndTime,
			}); err != nil {
				return err
			}
		case "task-finished":
			slices.Sort(sentenceOrder)
			parts := make([]string, 0, len(sentenceOrder))
			for _, sentenceID := range sentenceOrder {
				if text := strings.TrimSpace(finalSentences[sentenceID]); text != "" {
					parts = append(parts, text)
				}
			}
			return writeRealtimeClientEvent(client, realtimeTranscriptionServerEvent{
				Type: "completed",
				Text: strings.Join(parts, ""),
			})
		case "task-failed":
			eventErr := dashScopeRealtimeEventError(event)
			_ = writeRealtimeClientEvent(client, realtimeTranscriptionServerEvent{
				Type:    "error",
				Code:    "task_failed",
				Message: eventErr.Error(),
			})
			return eventErr
		}
	}
}

func forwardRealtimeClientAudio(client *websocket.Conn, upstream *websocket.Conn, taskID string) error {
	finished := false
	for {
		messageType, body, err := client.ReadMessage()
		if err != nil {
			return err
		}
		switch messageType {
		case websocket.BinaryMessage:
			if finished || len(body) == 0 {
				continue
			}
			if err := upstream.SetWriteDeadline(time.Now().Add(realtimeHandshakeTimeout)); err != nil {
				return err
			}
			if err := upstream.WriteMessage(websocket.BinaryMessage, body); err != nil {
				return err
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
				if err := upstream.SetWriteDeadline(time.Now().Add(realtimeHandshakeTimeout)); err != nil {
					return err
				}
				if err := upstream.WriteJSON(map[string]any{
					"header": map[string]any{
						"action":    "finish-task",
						"task_id":   taskID,
						"streaming": "duplex",
					},
					"payload": map[string]any{
						"input": map[string]any{},
					},
				}); err != nil {
					return err
				}
			case "cancel":
				return errors.New("realtime transcription canceled")
			}
		}
	}
}

func dashScopeRealtimeEndpoint(baseURL string) (string, error) {
	baseURL = strings.TrimSpace(baseURL)
	if baseURL == "" {
		baseURL = defaultDashScopeBaseURL
	}
	parsed, err := url.Parse(baseURL)
	if err != nil || parsed.Scheme == "" || parsed.Host == "" {
		return "", errors.New("invalid DashScope base URL")
	}
	switch parsed.Scheme {
	case "https":
		parsed.Scheme = "wss"
	case "http":
		parsed.Scheme = "ws"
	case "wss", "ws":
	default:
		return "", errors.New("invalid DashScope base URL")
	}
	parsed.Path = dashScopeRealtimePath
	parsed.RawPath = ""
	parsed.RawQuery = ""
	parsed.Fragment = ""
	return parsed.String(), nil
}

func parseDashScopeRealtimeEvent(body []byte) (dashScopeRealtimeEvent, error) {
	var event dashScopeRealtimeEvent
	if err := json.Unmarshal(body, &event); err != nil {
		return dashScopeRealtimeEvent{}, err
	}
	if strings.TrimSpace(event.Header.Event) == "" {
		return dashScopeRealtimeEvent{}, errors.New("DashScope realtime event is empty")
	}
	return event, nil
}

func dashScopeRealtimeEventError(event dashScopeRealtimeEvent) error {
	code := strings.TrimSpace(event.Header.ErrorCode)
	message := strings.TrimSpace(event.Header.ErrorMessage)
	if code == "" {
		code = strings.TrimSpace(event.Payload.Code)
	}
	if message == "" {
		message = strings.TrimSpace(event.Payload.Message)
	}
	if message == "" {
		message = "DashScope realtime task failed"
	}
	if code == "" {
		return errors.New(message)
	}
	return fmt.Errorf("%s: %s", code, message)
}

func writeRealtimeClientEvent(client *websocket.Conn, event realtimeTranscriptionServerEvent) error {
	if err := client.SetWriteDeadline(time.Now().Add(realtimeHandshakeTimeout)); err != nil {
		return err
	}
	return client.WriteJSON(event)
}

func realtimeTranscriptionOriginAllowed(request *http.Request) bool {
	origin := strings.TrimSpace(request.Header.Get("Origin"))
	if origin == "" {
		return true
	}
	parsed, err := url.Parse(origin)
	if err != nil || parsed.Hostname() == "" {
		return false
	}
	originHost := strings.ToLower(parsed.Hostname())
	requestHost := request.Header.Get("X-Forwarded-Host")
	if comma := strings.IndexByte(requestHost, ','); comma >= 0 {
		requestHost = requestHost[:comma]
	}
	if strings.TrimSpace(requestHost) == "" {
		requestHost = request.Host
	}
	requestHostname := hostName(requestHost)
	if strings.EqualFold(originHost, requestHostname) {
		return true
	}
	return isLoopbackHost(originHost) && isLoopbackHost(requestHostname)
}

func hostName(host string) string {
	host = strings.TrimSpace(host)
	if parsedHost, _, err := net.SplitHostPort(host); err == nil {
		return strings.ToLower(parsedHost)
	}
	return strings.ToLower(strings.Trim(host, "[]"))
}

func isLoopbackHost(host string) bool {
	if strings.EqualFold(host, "localhost") {
		return true
	}
	ip := net.ParseIP(host)
	return ip != nil && ip.IsLoopback()
}
