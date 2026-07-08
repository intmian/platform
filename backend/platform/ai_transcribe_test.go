package platform

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
)

func newTestAITranscribeRouter() (*gin.Engine, *webMgr) {
	gin.SetMode(gin.TestMode)
	router := gin.New()
	web := &webMgr{}
	web.jwt.SetSalt("test-salt-1", "test-salt-2")
	router.POST("/misc/ai/transcribe", web.aiTranscribe)
	return router, web
}

func TestAITranscribeRequiresPermission(t *testing.T) {
	router, _ := newTestAITranscribeRouter()
	req := httptest.NewRequest(http.MethodPost, "/misc/ai/transcribe", nil)
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, req)
	if recorder.Code != http.StatusOK {
		t.Fatalf("unexpected status %d: %s", recorder.Code, recorder.Body.String())
	}

	var ret uniReturn
	if err := json.Unmarshal(recorder.Body.Bytes(), &ret); err != nil {
		t.Fatalf("unmarshal response failed: %v", err)
	}
	if ret.Code == 0 || ret.Msg != "no permission" {
		t.Fatalf("expected no permission, got %+v", ret)
	}
}

func TestAITranscribeRequiresAudioFile(t *testing.T) {
	router, web := newTestAITranscribeRouter()
	ret := performMoneyPost(t, router, web, "admin", []string{"admin"}, "/misc/ai/transcribe", map[string]string{})
	if ret.Code == 0 || ret.Msg != "audio file is required" {
		t.Fatalf("expected missing audio file error, got %+v", ret)
	}
}
