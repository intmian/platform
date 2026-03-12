package platform

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/intmian/mian_go_lib/tool/misc"
	"github.com/intmian/mian_go_lib/xstorage"
)

func newTestSubscriptionMgr(t *testing.T) *subscriptionMgr {
	t.Helper()
	dir := t.TempDir()
	storage, err := xstorage.NewXStorage(xstorage.XStorageSetting{
		Property: misc.CreateProperty(xstorage.UseCache, xstorage.UseDisk, xstorage.MultiSafe, xstorage.FullInitLoad),
		SaveType: xstorage.SqlLiteDB,
		DBAddr:   filepath.Join(dir, "subscription.db"),
	})
	if err != nil {
		t.Fatalf("new storage failed: %v", err)
	}
	cfg, err := xstorage.NewCfgExt(storage)
	if err != nil {
		t.Fatalf("new cfg failed: %v", err)
	}
	plat := &PlatForm{
		storage: storage,
		cfg:     cfg,
	}
	mgr := newSubscriptionMgr(plat)
	plat.subscriptionMgr = mgr
	return mgr
}

func TestParseSubscriptionInfo(t *testing.T) {
	body := []byte(`
- {name: "Traffic: 15.8 GB | 150 GB", server: example.com, port: 10011, type: ss}
- {name: "Expire: 2026-10-16", server: example.com, port: 10011, type: ss}
`)
	now := time.Date(2026, 10, 10, 12, 0, 0, 0, time.Local)
	info, err := parseSubscriptionInfo(body, now)
	if err != nil {
		t.Fatalf("parse info failed: %v", err)
	}
	if info.TrafficRaw != "15.8 GB | 150 GB" {
		t.Fatalf("unexpected traffic raw: %s", info.TrafficRaw)
	}
	if info.ExpireAt.Format("2006-01-02") != "2026-10-16" {
		t.Fatalf("unexpected expire: %s", info.ExpireAt.Format("2006-01-02"))
	}
	if info.ExpireRemainDays != 6 {
		t.Fatalf("unexpected remain days: %d", info.ExpireRemainDays)
	}
	if info.UsagePercent < 10.5 || info.UsagePercent > 10.6 {
		t.Fatalf("unexpected usage percent: %f", info.UsagePercent)
	}
}

func TestShouldResetAlertState(t *testing.T) {
	record := subscriptionRecord{
		LastExpireAt:     time.Date(2026, 10, 16, 0, 0, 0, 0, time.UTC),
		LastUsedBytes:    80,
		LastTotalBytes:   100,
		LastUsagePercent: 80,
	}
	if !shouldResetAlertState(record, subscriptionInfo{
		ExpireAt:     time.Date(2026, 10, 20, 0, 0, 0, 0, time.UTC),
		UsedBytes:    5,
		TotalBytes:   100,
		UsagePercent: 5,
	}) {
		t.Fatal("expected reset when expire changes")
	}
	if !shouldResetAlertState(record, subscriptionInfo{
		ExpireAt:     record.LastExpireAt,
		UsedBytes:    20,
		TotalBytes:   100,
		UsagePercent: 20,
	}) {
		t.Fatal("expected reset when usage drops")
	}
	if shouldResetAlertState(record, subscriptionInfo{
		ExpireAt:     record.LastExpireAt,
		UsedBytes:    85,
		TotalBytes:   100,
		UsagePercent: 85,
	}) {
		t.Fatal("did not expect reset for same cycle growth")
	}
}

func TestSubscriptionRotateAndShareLink(t *testing.T) {
	gin.SetMode(gin.TestMode)
	mgr := newTestSubscriptionMgr(t)
	upstreamBody := []byte("hello subscription")
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write(upstreamBody)
	}))
	defer upstream.Close()

	item, err := mgr.create("alice", subscriptionCreateReq{
		Name:           "test",
		UpstreamURL:    upstream.URL,
		MonitorEnabled: true,
	})
	if err != nil {
		t.Fatalf("create failed: %v", err)
	}
	if item.ID == "" || item.ShareURL == "" {
		t.Fatalf("unexpected item: %+v", item)
	}
	if !strings.HasPrefix(item.ShareURL, "/share-link/alice/") {
		t.Fatalf("expected relative share url, got %s", item.ShareURL)
	}

	mgr.mu.Lock()
	records, err := mgr.loadRecordsLocked("alice")
	if err != nil {
		mgr.mu.Unlock()
		t.Fatalf("load failed: %v", err)
	}
	records[0].LastCheckStatus = subscriptionStatusSuccess
	records[0].LastTrafficRaw = "15.8 GB | 150 GB"
	records[0].LastUsagePercent = 80
	records[0].LastExpireAt = time.Date(2026, 10, 16, 0, 0, 0, 0, time.UTC)
	if err = mgr.saveRecordsLocked("alice", records); err != nil {
		mgr.mu.Unlock()
		t.Fatalf("save failed: %v", err)
	}
	mgr.mu.Unlock()

	oldToken := item.ShareURL[strings.LastIndex(item.ShareURL, "/")+1:]
	rotated, err := mgr.rotate("alice", item.ID)
	if err != nil {
		t.Fatalf("rotate failed: %v", err)
	}
	newToken := rotated.ShareURL[strings.LastIndex(rotated.ShareURL, "/")+1:]
	if newToken == oldToken {
		t.Fatal("expected new token")
	}
	if rotated.LastCheckStatus != subscriptionStatusSuccess {
		t.Fatalf("expected rotate to preserve check status, got %s", rotated.LastCheckStatus)
	}
	if rotated.TrafficSummary != "15.8 GB | 150 GB" {
		t.Fatalf("expected rotate to preserve traffic summary, got %s", rotated.TrafficSummary)
	}
	if rotated.ExpireAt != "2026-10-16" {
		t.Fatalf("expected rotate to preserve expireAt, got %s", rotated.ExpireAt)
	}

	web := &webMgr{plat: mgr.plat}
	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	req := httptest.NewRequest(http.MethodGet, "/share-link/alice/"+oldToken, nil)
	ctx.Request = req
	ctx.Params = gin.Params{
		{Key: "username", Value: "alice"},
		{Key: "token", Value: oldToken},
	}
	web.shareLinkDownload(ctx)
	if recorder.Code != http.StatusNotFound {
		t.Fatalf("expected old token 404, got %d", recorder.Code)
	}

	recorder = httptest.NewRecorder()
	ctx, _ = gin.CreateTestContext(recorder)
	req = httptest.NewRequest(http.MethodGet, "/share-link/alice/"+newToken, nil)
	ctx.Request = req
	ctx.Params = gin.Params{
		{Key: "username", Value: "alice"},
		{Key: "token", Value: newToken},
	}
	web.shareLinkDownload(ctx)
	if recorder.Code != http.StatusOK {
		t.Fatalf("expected new token 200, got %d", recorder.Code)
	}
	if recorder.Body.String() != string(upstreamBody) {
		t.Fatalf("unexpected body: %s", recorder.Body.String())
	}
}

func TestSubscriptionManualCheck(t *testing.T) {
	mgr := newTestSubscriptionMgr(t)
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte(`
- {name: "Traffic: 15.8 GB | 150 GB", server: example.com, port: 10011, type: ss}
- {name: "Expire: 2026-10-16", server: example.com, port: 10011, type: ss}
`))
	}))
	defer upstream.Close()

	item, err := mgr.create("alice", subscriptionCreateReq{
		Name:           "test",
		UpstreamURL:    upstream.URL,
		MonitorEnabled: true,
	})
	if err != nil {
		t.Fatalf("create failed: %v", err)
	}

	checked, err := mgr.check("alice", item.ID)
	if err != nil {
		t.Fatalf("manual check failed: %v", err)
	}
	if checked.LastCheckStatus != subscriptionStatusSuccess {
		t.Fatalf("expected success status, got %s", checked.LastCheckStatus)
	}
	if checked.UsagePercent <= 0 {
		t.Fatalf("expected usage percent > 0, got %f", checked.UsagePercent)
	}
	if checked.ExpireAt != "2026-10-16" {
		t.Fatalf("unexpected expireAt: %s", checked.ExpireAt)
	}
}

func TestSubscriptionCreateAutoChecksWhenMonitorEnabled(t *testing.T) {
	mgr := newTestSubscriptionMgr(t)
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte(`
- {name: "Traffic: 15.8 GB | 150 GB", server: example.com, port: 10011, type: ss}
- {name: "Expire: 2026-10-16", server: example.com, port: 10011, type: ss}
`))
	}))
	defer upstream.Close()

	item, err := mgr.create("alice", subscriptionCreateReq{
		Name:           "auto-check-on-create",
		UpstreamURL:    upstream.URL,
		MonitorEnabled: true,
	})
	if err != nil {
		t.Fatalf("create failed: %v", err)
	}
	if item.LastCheckStatus != subscriptionStatusSuccess {
		t.Fatalf("expected create to trigger auto check, got %s", item.LastCheckStatus)
	}
	if item.UsagePercent <= 0 {
		t.Fatalf("expected usage percent > 0, got %f", item.UsagePercent)
	}
	if item.ExpireAt != "2026-10-16" {
		t.Fatalf("unexpected expireAt: %s", item.ExpireAt)
	}
}

func TestSubscriptionWorkerForwardAndFilename(t *testing.T) {
	gin.SetMode(gin.TestMode)
	mgr := newTestSubscriptionMgr(t)
	upstreamBody := []byte(`
- {name: "Traffic: 15.8 GB | 150 GB", server: example.com, port: 10011, type: ss}
- {name: "Expire: 2026-10-16", server: example.com, port: 10011, type: ss}
`)
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write(upstreamBody)
	}))
	defer upstream.Close()

	expectedUpstreamURL := upstream.URL + "?filename=demo.yaml"
	workerHit := false
	worker := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		workerHit = true
		if got := r.URL.Query().Get("url"); got != expectedUpstreamURL {
			t.Fatalf("unexpected worker url param: %s", got)
		}
		w.Header().Set("Content-Type", "text/plain;charset=utf-8")
		_, _ = w.Write(upstreamBody)
	}))
	defer worker.Close()

	item, err := mgr.create("alice", subscriptionCreateReq{
		Name:                 "worker",
		UpstreamURL:          expectedUpstreamURL,
		WorkerForwardEnabled: true,
		WorkerForwardURL:     worker.URL + "/?url=",
		MonitorEnabled:       true,
	})
	if err != nil {
		t.Fatalf("create failed: %v", err)
	}

	checked, err := mgr.check("alice", item.ID)
	if err != nil {
		t.Fatalf("manual check failed: %v", err)
	}
	if checked.LastCheckStatus != subscriptionStatusSuccess {
		t.Fatalf("expected success status, got %s", checked.LastCheckStatus)
	}
	if !workerHit {
		t.Fatal("expected worker to be used")
	}

	web := &webMgr{plat: mgr.plat}
	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	req := httptest.NewRequest(http.MethodGet, item.ShareURL, nil)
	ctx.Request = req
	ctx.Params = gin.Params{
		{Key: "username", Value: "alice"},
		{Key: "token", Value: item.ShareURL[strings.LastIndex(item.ShareURL, "/")+1:]},
	}
	web.shareLinkDownload(ctx)
	if recorder.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", recorder.Code)
	}
	if got := recorder.Header().Get("Content-Disposition"); !strings.Contains(got, "demo.yaml") {
		t.Fatalf("expected content-disposition filename, got %s", got)
	}
}

func TestSubscriptionDownloadUsesUpstreamContentDispositionFirst(t *testing.T) {
	gin.SetMode(gin.TestMode)
	mgr := newTestSubscriptionMgr(t)
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Disposition", `attachment; filename="from-header.yaml"`)
		_, _ = w.Write([]byte("hello"))
	}))
	defer upstream.Close()

	item, err := mgr.create("alice", subscriptionCreateReq{
		Name:           "header-first",
		UpstreamURL:    upstream.URL + "?filename=from-query.yaml",
		MonitorEnabled: false,
	})
	if err != nil {
		t.Fatalf("create failed: %v", err)
	}

	web := &webMgr{plat: mgr.plat}
	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	req := httptest.NewRequest(http.MethodGet, item.ShareURL, nil)
	ctx.Request = req
	ctx.Params = gin.Params{
		{Key: "username", Value: "alice"},
		{Key: "token", Value: item.ShareURL[strings.LastIndex(item.ShareURL, "/")+1:]},
	}
	web.shareLinkDownload(ctx)
	if recorder.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", recorder.Code)
	}
	if got := recorder.Header().Get("Content-Disposition"); !strings.Contains(got, "from-header.yaml") {
		t.Fatalf("expected upstream header filename, got %s", got)
	}
	if got := recorder.Header().Get("Content-Disposition"); strings.Contains(got, "from-query.yaml") {
		t.Fatalf("expected not to use query filename when upstream header exists, got %s", got)
	}
}

func TestListReturnsRemainDays(t *testing.T) {
	mgr := newTestSubscriptionMgr(t)
	item, err := mgr.create("alice", subscriptionCreateReq{
		Name:           "test",
		UpstreamURL:    "https://example.com/sub",
		MonitorEnabled: true,
	})
	if err != nil {
		t.Fatalf("create failed: %v", err)
	}

	mgr.mu.Lock()
	records, err := mgr.loadRecordsLocked("alice")
	if err != nil {
		mgr.mu.Unlock()
		t.Fatalf("load failed: %v", err)
	}
	records[0].LastCheckStatus = subscriptionStatusSuccess
	records[0].LastTrafficRaw = "15.8 GB / 150 GB"
	records[0].LastUsagePercent = 80
	records[0].LastExpireAt = time.Now().Add(48 * time.Hour)
	if err = mgr.saveRecordsLocked("alice", records); err != nil {
		mgr.mu.Unlock()
		t.Fatalf("save failed: %v", err)
	}
	mgr.mu.Unlock()

	items, err := mgr.list("alice")
	if err != nil {
		t.Fatalf("list failed: %v", err)
	}
	if len(items) != 1 {
		t.Fatalf("unexpected list len: %d", len(items))
	}
	if items[0].ID != item.ID {
		t.Fatalf("unexpected item id: %s", items[0].ID)
	}
	if items[0].ExpireRemainDays < 1 {
		t.Fatalf("expected positive remain days, got %d", items[0].ExpireRemainDays)
	}

	_, err = json.Marshal(items[0])
	if err != nil {
		t.Fatalf("marshal failed: %v", err)
	}
}
