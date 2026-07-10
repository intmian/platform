package db

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"strings"
	"sync"
	"testing"

	"github.com/intmian/mian_go_lib/xbi"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

func realWorkerTestSetting(t *testing.T) Setting {
	t.Helper()
	endpoint := os.Getenv("D1_WORKER_ENDPOINT")
	token := os.Getenv("D1_WORKER_TOKEN")
	if endpoint == "" || token == "" {
		t.Skip("real Worker test requires D1_WORKER_ENDPOINT and D1_WORKER_TOKEN")
	}
	if _, err := url.ParseRequestURI(endpoint); err != nil {
		t.Fatalf("invalid D1_WORKER_ENDPOINT: %v", err)
	}
	localDB, err := gorm.Open(sqlite.Open("file:"+url.QueryEscape(t.Name())+"?mode=memory&cache=shared"), &gorm.Config{
		Logger: logger.Default.LogMode(logger.Silent),
	})
	if err != nil {
		t.Fatalf("open local xbi db: %v", err)
	}
	errCh := make(chan error, 16)
	bi, err := xbi.NewXBi(xbi.Setting{Db: localDB, ErrorChan: errCh, Ctx: context.Background()})
	if err != nil {
		t.Fatalf("create xbi: %v", err)
	}
	return Setting{
		WorkerEndpoint: endpoint,
		WorkerToken:    token,
		Ctx:            context.Background(),
		XBi:            bi,
	}
}

func TestMgrUsesOneWorkerGormDBAndSerialMigrations(t *testing.T) {
	const workerToken = "test-worker-token"
	var mu sync.Mutex
	var migrations []string

	worker := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "Bearer "+workerToken {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		switch {
		case r.Method == http.MethodGet && r.URL.Path == "/health":
			_ = json.NewEncoder(w).Encode(map[string]any{"ok": true, "requestId": "health"})
		case r.Method == http.MethodPost && r.URL.Path == "/v1/query":
			var req struct {
				Mode string `json:"mode"`
				SQL  string `json:"sql"`
			}
			if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
				http.Error(w, "bad request", http.StatusBadRequest)
				return
			}
			if strings.HasPrefix(strings.ToUpper(strings.TrimSpace(req.SQL)), "CREATE TABLE") {
				mu.Lock()
				migrations = append(migrations, req.SQL)
				mu.Unlock()
			}
			result := map[string]any{
				"meta":    map[string]any{},
				"columns": []string{},
				"rows":    [][]any{},
			}
			if req.Mode == "query" && strings.Contains(req.SQL, "sqlite_master") {
				result["columns"] = []string{"count(*)"}
				result["rows"] = [][]any{{0}}
			}
			_ = json.NewEncoder(w).Encode(map[string]any{
				"success":   true,
				"requestId": "query",
				"result":    result,
			})
		default:
			http.NotFound(w, r)
		}
	}))
	defer worker.Close()

	localDB, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{Logger: logger.Default.LogMode(logger.Silent)})
	if err != nil {
		t.Fatalf("open local xbi db: %v", err)
	}
	errCh := make(chan error, 16)
	bi, err := xbi.NewXBi(xbi.Setting{Db: localDB, ErrorChan: errCh, Ctx: context.Background()})
	if err != nil {
		t.Fatalf("create xbi: %v", err)
	}

	mgr, err := NewMgr(Setting{
		WorkerEndpoint: worker.URL,
		WorkerToken:    workerToken,
		Ctx:            context.Background(),
		XBi:            bi,
	})
	if err != nil {
		t.Fatalf("create manager: %v", err)
	}
	connections := []struct {
		connectType ConnectType
		model       any
	}{
		{ConnectTypeDir, &DirDB{}},
		{ConnectTypeGroup, &GroupDB{}},
		{ConnectTypeTask, &TaskDB{}},
		{ConnectTypeTags, &TagsDB{}},
		{ConnectTypeSubGroup, &SubGroupDB{}},
	}
	for _, connection := range connections {
		if err = mgr.Connect(connection.connectType, connection.model); err != nil {
			t.Fatalf("connect %d: %v", connection.connectType, err)
		}
	}

	root := mgr.GetConnect(ConnectTypeDir)
	if root == nil {
		t.Fatal("root connection is nil")
	}
	for _, connection := range connections[1:] {
		if got := mgr.GetConnect(connection.connectType); got != root {
			t.Fatalf("connect type %d does not reuse root GORM DB", connection.connectType)
		}
	}
	mu.Lock()
	defer mu.Unlock()
	if len(migrations) != len(connections) {
		t.Fatalf("expected %d serial table migrations, got %d", len(connections), len(migrations))
	}
}
