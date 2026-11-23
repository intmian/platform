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

func TestSetJwtSaltMonthBoundary(t *testing.T) {
	// 3 月 31 日往前一个月不能落到 3 月 3 日
	web := newTestTokenWeb(time.Date(2026, 3, 31, 12, 0, 0, 0, time.Local))
	valid := time.Now().Add(time.Hour).Unix()
	cur := signedTokenData("test-salt", "2026-03", "u", []string{"a"}, valid)
	prev := signedTokenData("test-salt", "2026-02", "u", []string{"a"}, valid)
	old := signedTokenData("test-salt", "2026-01", "u", []string{"a"}, valid)
	if ok, prevOnly := web.verifyTokenSign(&cur); !ok || prevOnly {
		t.Fatalf("current month token: ok=%v prevOnly=%v", ok, prevOnly)
	}
	if ok, prevOnly := web.verifyTokenSign(&prev); !ok || !prevOnly {
		t.Fatalf("previous month token: ok=%v prevOnly=%v", ok, prevOnly)
	}
	if ok, _ := web.verifyTokenSign(&old); ok {
		t.Fatal("token from two months ago should be rejected")
	}

	jan := newTestTokenWeb(time.Date(2026, 1, 5, 0, 0, 0, 0, time.Local))
	dec := signedTokenData("test-salt", "2025-12", "u", []string{"a"}, valid)
	if ok, prevOnly := jan.verifyTokenSign(&dec); !ok || !prevOnly {
		t.Fatalf("december token in january: ok=%v prevOnly=%v", ok, prevOnly)
	}
}

func TestVerifyTokenSignWithoutPrevSalt(t *testing.T) {
	// 只 SetSalt 当前盐时，jwtPrev 的空盐不能被用来校验
	web := &webMgr{}
	web.jwt.SetSalt("test-salt", "2026-04")
	valid := time.Now().Add(time.Hour).Unix()
	empty := signedTokenData("", "", "admin", []string{"admin"}, valid)
	if web.CheckToken(&empty) || web.CheckTokenPermission(&empty, "admin") {
		t.Fatal("token signed with empty salts must be rejected")
	}
}

func TestCheckTokenPermissionAcceptsPrevSalt(t *testing.T) {
	now := time.Now()
	web := newTestTokenWeb(now)
	prevMonth := time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, now.Location()).AddDate(0, -1, 0).Format("2006-01")
	data := signedTokenData("test-salt", prevMonth, "admin", []string{"admin"}, now.Add(time.Hour).Unix())
	if !web.CheckTokenPermission(&data, "admin") {
		t.Fatal("previous month token should pass permission check")
	}
	if web.CheckTokenPermission(&data, "money") {
		t.Fatal("permission not in token should fail")
	}
	expired := signedTokenData("test-salt", prevMonth, "admin", []string{"admin"}, now.Add(-time.Hour).Unix())
	if web.CheckTokenPermission(&expired, "admin") {
		t.Fatal("expired token should fail")
	}
	forged := data
	forged.Permission = []string{"admin", "root"}
	if web.CheckToken(&forged) {
		t.Fatal("tampered token should fail")
	}

	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.GET("/valid", func(c *gin.Context) {
		c.JSON(200, web.getValid(c))
	})
	router.GET("/admin/x", web.checkAdmin, func(c *gin.Context) { c.String(200, "pass") })
	rec := doTokenRequest(t, router, http.MethodGet, "/valid", &data)
	var valid struct {
		User        string
		Permissions []string
	}
	_ = json.Unmarshal(rec.Body.Bytes(), &valid)
	if valid.User != "admin" || len(valid.Permissions) != 1 {
		t.Fatalf("getValid with previous month token: %s", rec.Body.String())
	}
	rec = doTokenRequest(t, router, http.MethodGet, "/admin/x", &data)
	if rec.Body.String() != "pass" {
		t.Fatalf("checkAdmin with previous month token: %s", rec.Body.String())
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
		{"admin near expiry", signedTokenData("test-salt", curMonth, "admin", []string{"admin"}, now.Add(2*24*time.Hour).Unix()), true, false},
		{"user near expiry", signedTokenData("test-salt", curMonth, "bob", []string{"todone"}, now.Add(2*24*time.Hour).Unix()), true, false},
		{"plenty left", signedTokenData("test-salt", curMonth, "admin", []string{"admin"}, now.Add(5*24*time.Hour).Unix()), false, false},
		{"previous month salt", signedTokenData("test-salt", prevMonth, "admin", []string{"admin"}, now.Add(5*24*time.Hour).Unix()), true, false},
		{"expired", signedTokenData("test-salt", curMonth, "admin", []string{"admin"}, now.Add(-time.Minute).Unix()), false, true},
		{"wrong salt", signedTokenData("other", curMonth, "admin", []string{"admin"}, now.Add(5*24*time.Hour).Unix()), false, true},
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
			if ok, prevOnly := web.verifyTokenSign(renewed); !ok || prevOnly {
				t.Fatalf("renewed token should be signed with current salt: ok=%v prevOnly=%v", ok, prevOnly)
			}
			if renewed.ValidTime < now.Add(7*24*time.Hour-time.Minute).Unix() {
				t.Fatalf("renewed token valid time too short: %d", renewed.ValidTime)
			}
			if renewed.User != data.User || len(renewed.Permission) != len(data.Permission) {
				t.Fatalf("renewed token changed identity: %+v", renewed)
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
