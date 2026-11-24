package platform

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/intmian/mian_go_lib/tool/misc"
	"github.com/intmian/mian_go_lib/tool/token"
	"github.com/intmian/mian_go_lib/xstorage"
)

func newTestHomeLayoutWeb(t *testing.T) (*webMgr, *gin.Engine) {
	t.Helper()
	gin.SetMode(gin.TestMode)
	storage, err := xstorage.NewXStorage(xstorage.XStorageSetting{
		Property: misc.CreateProperty(xstorage.UseCache, xstorage.UseDisk, xstorage.MultiSafe, xstorage.FullInitLoad),
		SaveType: xstorage.SqlLiteDB,
		DBAddr:   filepath.Join(t.TempDir(), "home.db"),
	})
	if err != nil {
		t.Fatalf("new storage failed: %v", err)
	}
	web := &webMgr{plat: &PlatForm{storage: storage}}
	web.jwt.SetSalt("test-salt", "2026-11")
	router := gin.New()
	router.POST("/misc/home/get", web.homeLayoutGet)
	router.POST("/misc/home/set", web.homeLayoutSet)
	return web, router
}

func postHomeRaw(t *testing.T, router *gin.Engine, web *webMgr, user, path string, body []byte) uniReturn {
	t.Helper()
	req := httptest.NewRequest(http.MethodPost, path, bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	if user != "" {
		data := token.Data{User: user, Permission: []string{"todone"}, ValidTime: time.Now().Add(time.Hour).Unix()}
		web.jwt.Signature(&data)
		cookie, _ := json.Marshal(data)
		req.Header.Set("Cookie", "token="+url.QueryEscape(string(cookie)))
	}
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	var ret uniReturn
	if err := json.Unmarshal(rec.Body.Bytes(), &ret); err != nil {
		t.Fatalf("bad body: %s", rec.Body.String())
	}
	return ret
}

func homeRecord(t *testing.T, ret uniReturn) homeLayoutRecord {
	t.Helper()
	var rec homeLayoutRecord
	marshalBack(t, ret.Data, &rec)
	return rec
}

func TestHomeLayoutGetSetConflict(t *testing.T) {
	web, router := newTestHomeLayoutWeb(t)

	ret := postHomeRaw(t, router, web, "alice", "/misc/home/get", []byte(`{}`))
	if ret.Code != 0 {
		t.Fatalf("get failed: %+v", ret)
	}
	empty := homeRecord(t, ret)
	if empty.Version != 0 || empty.UpdatedAt != 0 || string(empty.Layout) != "null" {
		t.Fatalf("unexpected empty record: %+v layout=%s", empty, empty.Layout)
	}

	ret = postHomeRaw(t, router, web, "alice", "/misc/home/set", []byte(`{"Version":0,"Layout":{"widgets":[{"id":"a","x":1}]}}`))
	if ret.Code != 0 {
		t.Fatalf("set failed: %+v", ret)
	}
	first := homeRecord(t, ret)
	if first.Version != 1 || first.UpdatedAt == 0 || string(first.Layout) != `{"widgets":[{"id":"a","x":1}]}` {
		t.Fatalf("unexpected first record: %+v layout=%s", first, first.Layout)
	}

	ret = postHomeRaw(t, router, web, "alice", "/misc/home/get", []byte(`{}`))
	got := homeRecord(t, ret)
	if got.Version != 1 || string(got.Layout) != string(first.Layout) || got.UpdatedAt != first.UpdatedAt {
		t.Fatalf("get after set mismatch: %+v layout=%s", got, got.Layout)
	}

	// 用旧版本号写入：冲突，返回当前记录，不覆盖
	ret = postHomeRaw(t, router, web, "alice", "/misc/home/set", []byte(`{"Version":0,"Layout":{"widgets":[]}}`))
	if ret.Code != 2 || ret.Msg != "version conflict" {
		t.Fatalf("expected conflict, got %+v", ret)
	}
	cur := homeRecord(t, ret)
	if cur.Version != 1 || string(cur.Layout) != string(first.Layout) {
		t.Fatalf("conflict should return stored record: %+v layout=%s", cur, cur.Layout)
	}

	ret = postHomeRaw(t, router, web, "alice", "/misc/home/set", []byte(`{"Version":1,"Layout":[1,2,3]}`))
	if ret.Code != 0 || homeRecord(t, ret).Version != 2 {
		t.Fatalf("second set failed: %+v", ret)
	}

	// 用户之间互相隔离
	ret = postHomeRaw(t, router, web, "bob", "/misc/home/get", []byte(`{}`))
	if bob := homeRecord(t, ret); ret.Code != 0 || bob.Version != 0 {
		t.Fatalf("bob should have no layout: %+v", ret)
	}
}

func TestHomeLayoutRejectsBadBody(t *testing.T) {
	web, router := newTestHomeLayoutWeb(t)

	big := `{"Version":0,"Layout":"` + strings.Repeat("x", homeLayoutMaxBytes) + `"}`
	ret := postHomeRaw(t, router, web, "alice", "/misc/home/set", []byte(big))
	if ret.Code != 1 {
		t.Fatalf("oversized layout should be rejected: code=%d msg=%s", ret.Code, ret.Msg)
	}
	// 刚好在请求体上限内、但 Layout 超过 256KB
	justOver := `{"Version":0,"Layout":"` + strings.Repeat("x", homeLayoutMaxBytes-1) + `"}`
	ret = postHomeRaw(t, router, web, "alice", "/misc/home/set", []byte(justOver))
	if ret.Code != 1 || ret.Msg != "layout too large" {
		t.Fatalf("layout just over limit should be rejected: code=%d msg=%s", ret.Code, ret.Msg)
	}

	ret = postHomeRaw(t, router, web, "alice", "/misc/home/set", []byte(`{"Version":0,"Layout":{bad}`))
	if ret.Code != 1 {
		t.Fatalf("invalid json should be rejected: %+v", ret)
	}

	ret = postHomeRaw(t, router, web, "alice", "/misc/home/get", []byte(`{}`))
	if homeRecord(t, ret).Version != 0 {
		t.Fatalf("rejected writes should not be stored: %+v", ret)
	}
}

func TestHomeLayoutNotLoggedIn(t *testing.T) {
	web, router := newTestHomeLayoutWeb(t)
	for _, path := range []string{"/misc/home/get", "/misc/home/set"} {
		ret := postHomeRaw(t, router, web, "", path, []byte(`{"Version":0,"Layout":{}}`))
		if ret.Code != 1 || ret.Msg != "no permission" {
			t.Fatalf("%s without login: %+v", path, ret)
		}
	}
}
