package platform

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
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
