package platform

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/intmian/mian_go_lib/tool/token"
)

func signedTokenData(salt1, salt2, user string, perms []string, validTime int64) token.Data {
	mgr := token.NewJwtMgr(salt1, salt2)
	data := token.Data{User: user, Permission: perms, ValidTime: validTime}
	mgr.Signature(&data)
	return data
}

func newTestTokenWeb(now time.Time) *webMgr {
	web := &webMgr{}
	web.setJwtSalt("test-salt", now)
	return web
}

func doTokenRequest(t *testing.T, router *gin.Engine, method, path string, data *token.Data) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest(method, path, nil)
	if data != nil {
		b, _ := json.Marshal(data)
		req.Header.Set("Cookie", "token="+url.QueryEscape(string(b)))
	}
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	return rec
}

func tokenCookie(t *testing.T, rec *httptest.ResponseRecorder) *token.Data {
	t.Helper()
	for _, c := range rec.Result().Cookies() {
		if c.Name != "token" {
			continue
		}
		raw, err := url.QueryUnescape(c.Value)
		if err != nil {
			t.Fatalf("unescape cookie: %v", err)
		}
		var data token.Data
		if err = json.Unmarshal([]byte(raw), &data); err != nil {
			t.Fatalf("unmarshal cookie: %v", err)
		}
		if c.MaxAge != tokenValidSeconds {
			t.Fatalf("unexpected cookie max age %d", c.MaxAge)
		}
		return &data
	}
	return nil
}

func TestTokenFromPreviousMonthIsRejected(t *testing.T) {
	// 跨月重启后旧 token 失效是有意的：自动续期的账号每月至少重新登录一次
	now := time.Now()
	web := newTestTokenWeb(now)
	valid := now.Add(time.Hour).Unix()
	cur := signedTokenData("test-salt", now.Format("2006-01"), "u", []string{"a"}, valid)
	prevMonth := time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, now.Location()).AddDate(0, -1, 0).Format("2006-01")
	prev := signedTokenData("test-salt", prevMonth, "u", []string{"a"}, valid)
	if !web.CheckToken(&cur) || !web.CheckTokenPermission(&cur, "a") {
		t.Fatal("current month token should pass")
	}
	if web.CheckToken(&prev) || web.CheckTokenPermission(&prev, "a") {
		t.Fatal("previous month token should be rejected")
	}
	forged := cur
	forged.Permission = []string{"a", "admin"}
	if web.CheckToken(&forged) {
		t.Fatal("tampered token should fail")
	}
}

func TestCheckRenewsToken(t *testing.T) {
	gin.SetMode(gin.TestMode)
	now := time.Now()
	web := newTestTokenWeb(now)
	curMonth := now.Format("2006-01")
	prevMonth := time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, now.Location()).AddDate(0, -1, 0).Format("2006-01")
	router := gin.New()
	router.GET("/check", web.check)

	cases := []struct {
		name    string
		data    token.Data
		renew   bool
		wantErr bool
	}{
		{"admin near expiry is not renewed", signedTokenData("test-salt", curMonth, "admin", []string{"admin"}, now.Add(24*time.Hour).Unix()), false, false},
		{"user near expiry", signedTokenData("test-salt", curMonth, "bob", []string{"todone"}, now.Add(24*time.Hour).Unix()), true, false},
		{"user plenty left", signedTokenData("test-salt", curMonth, "bob", []string{"todone"}, now.Add(5*24*time.Hour).Unix()), false, false},
		{"previous month salt", signedTokenData("test-salt", prevMonth, "bob", []string{"todone"}, now.Add(5*24*time.Hour).Unix()), false, true},
		{"expired", signedTokenData("test-salt", curMonth, "bob", []string{"todone"}, now.Add(-time.Minute).Unix()), false, true},
		{"wrong salt", signedTokenData("other", curMonth, "bob", []string{"todone"}, now.Add(5*24*time.Hour).Unix()), false, true},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			data := tc.data
			rec := doTokenRequest(t, router, http.MethodGet, "/check", &data)
			var ret uniReturn
			if err := json.Unmarshal(rec.Body.Bytes(), &ret); err != nil {
				t.Fatalf("bad body: %s", rec.Body.String())
			}
			if (ret.Code != 0) != tc.wantErr {
				t.Fatalf("code=%d body=%s", ret.Code, rec.Body.String())
			}
			renewed := tokenCookie(t, rec)
			if (renewed != nil) != tc.renew {
				t.Fatalf("renew=%v, want %v", renewed != nil, tc.renew)
			}
			if renewed == nil {
				return
			}
			if !web.CheckToken(renewed) {
				t.Fatal("renewed token should be valid")
			}
			if renewed.ValidTime < now.Add(7*24*time.Hour-time.Minute).Unix() {
				t.Fatalf("renewed token valid time too short: %d", renewed.ValidTime)
			}
		})
	}
}

func TestFrontMiddlewareStaticFiles(t *testing.T) {
	gin.SetMode(gin.TestMode)
	dir := t.TempDir()
	write := func(name, content string) {
		full := filepath.Join(dir, name)
		if err := os.MkdirAll(filepath.Dir(full), 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(full, []byte(content), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	write("index.html", "INDEX")
	write("manifest.json", "MANIFEST")
	write("sw.js", "SW")
	write("icon-192.png", "PNG")
	write("config.json", "CONFIG")
	write("assets/app-abc.js", "APP")
	write("icons/icon-512.png", "PNG512")
	write(".env", "HIDDEN")
	outside := filepath.Join(filepath.Dir(dir), "outside-front.txt")
	_ = os.WriteFile(outside, []byte("OUTSIDE"), 0o644)
	defer os.Remove(outside)

	router := gin.New()
	router.Use(frontMiddleware(dir))
	router.POST("/api", func(c *gin.Context) { c.String(200, "API") })

	cases := []struct {
		path, body, cache string
		status            int
	}{
		{"/", "INDEX", "no-cache", 200},
		{"/todone/abc", "INDEX", "no-cache", 200},
		{"/index.html", "", "no-cache", 301}, // http.ServeFile 会把 /index.html 重定向到 /

		{"/manifest.json", "MANIFEST", "", 200},
		{"/sw.js", "SW", "no-cache", 200},
		{"/icon-192.png", "PNG", "", 200},
		{"/config.json", "CONFIG", "", 200},
		{"/assets/app-abc.js", "APP", "public, max-age=31536000, immutable", 200},
		{"/assets/missing.js", "", "", 404},
		{"/assets/", "", "", 404},
		{"/icons/icon-512.png", "PNG512", "", 200},
		{"/icons", "INDEX", "no-cache", 200},
		{"/icons/", "INDEX", "no-cache", 200},
		{"/.env", "INDEX", "no-cache", 200},
		// 带 .. 的路径不会命中静态文件，回落到 index 时被 http.ServeFile 拒绝
		{"/../outside-front.txt", "", "", 400},
		{"/%2e%2e/outside-front.txt", "", "", 400},
	}
	for _, tc := range cases {
		t.Run(tc.path, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodGet, "/", nil)
			req.URL.Path = mustUnescapePath(t, tc.path)
			rec := httptest.NewRecorder()
			router.ServeHTTP(rec, req)
			if rec.Code != tc.status {
				t.Fatalf("status %d, want %d (body %q)", rec.Code, tc.status, rec.Body.String())
			}
			if tc.status == 200 && rec.Body.String() != tc.body {
				t.Fatalf("body %q, want %q", rec.Body.String(), tc.body)
			}
			if got := rec.Header().Get("Cache-Control"); got != tc.cache {
				t.Fatalf("cache-control %q, want %q", got, tc.cache)
			}
		})
	}

	req := httptest.NewRequest(http.MethodPost, "/api", nil)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	if rec.Body.String() != "API" {
		t.Fatalf("POST should pass through, got %q", rec.Body.String())
	}
}

func mustUnescapePath(t *testing.T, p string) string {
	t.Helper()
	s, err := url.PathUnescape(p)
	if err != nil {
		t.Fatal(err)
	}
	return s
}
