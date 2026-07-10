package todone

import (
	"path/filepath"
	"testing"

	"github.com/intmian/mian_go_lib/tool/misc"
	"github.com/intmian/mian_go_lib/xstorage"
	backendshare "github.com/intmian/platform/backend/share"
)

func newWorkerConfigTestShare(t *testing.T) backendshare.ServiceShare {
	t.Helper()
	storage, err := xstorage.NewXStorage(xstorage.XStorageSetting{
		Property: misc.CreateProperty(xstorage.UseCache, xstorage.UseDisk, xstorage.MultiSafe, xstorage.FullInitLoad),
		SaveType: xstorage.SqlLiteDB,
		DBAddr:   filepath.Join(t.TempDir(), "config.sqlite"),
	})
	if err != nil {
		t.Fatalf("create storage: %v", err)
	}
	cfg, err := xstorage.NewCfgExt(storage)
	if err != nil {
		t.Fatalf("create config extension: %v", err)
	}
	return backendshare.ServiceShare{Storage: storage, Cfg: cfg}
}

func TestLoadWorkerConfigUsesCfgExt(t *testing.T) {
	t.Setenv("PLATFORM_TODONE_WORKER_ENDPOINT", "")
	t.Setenv("PLATFORM_TODONE_WORKER_TOKEN", "")
	share := newWorkerConfigTestShare(t)

	if _, _, err := loadWorkerConfig(share); err == nil {
		t.Fatal("expected missing worker config error")
	}
	if err := share.Storage.Set(
		xstorage.Join("todone", "db", "worker_endpoint"),
		xstorage.ToUnit("https://todone.example.com", xstorage.ValueTypeString),
	); err != nil {
		t.Fatalf("set worker endpoint: %v", err)
	}
	if err := share.Storage.Set(
		xstorage.Join("todone", "db", "worker_token"),
		xstorage.ToUnit("configured-token", xstorage.ValueTypeString),
	); err != nil {
		t.Fatalf("set worker token: %v", err)
	}

	endpoint, token, err := loadWorkerConfig(share)
	if err != nil {
		t.Fatalf("load worker config: %v", err)
	}
	if endpoint != "https://todone.example.com" || token != "configured-token" {
		t.Fatalf("unexpected worker config: endpoint=%q token=%q", endpoint, token)
	}
	values, err := share.Cfg.GetWithFilter("todone", "")
	if err != nil {
		t.Fatalf("get registered worker config: %v", err)
	}
	if _, ok := values[xstorage.Join("todone", "db", "worker_endpoint")]; !ok {
		t.Fatal("worker endpoint was not registered in CfgExt")
	}
	if _, ok := values[xstorage.Join("todone", "db", "worker_token")]; !ok {
		t.Fatal("worker token was not registered in CfgExt")
	}
}

func TestLoadWorkerConfigEnvironmentOverridesCfgExt(t *testing.T) {
	t.Setenv("PLATFORM_TODONE_WORKER_ENDPOINT", "https://override.example.com")
	t.Setenv("PLATFORM_TODONE_WORKER_TOKEN", "override-token")

	endpoint, token, err := loadWorkerConfig(newWorkerConfigTestShare(t))
	if err != nil {
		t.Fatalf("load worker config: %v", err)
	}
	if endpoint != "https://override.example.com" || token != "override-token" {
		t.Fatalf("environment did not override worker config: endpoint=%q token=%q", endpoint, token)
	}
}

func TestLoadWorkerConfigDoesNotUseLegacyToken(t *testing.T) {
	t.Setenv("PLATFORM_TODONE_WORKER_ENDPOINT", "")
	t.Setenv("PLATFORM_TODONE_WORKER_TOKEN", "")
	share := newWorkerConfigTestShare(t)
	if err := share.Storage.Set(
		xstorage.Join("todone", "db", "api_token"),
		xstorage.ToUnit("legacy-token", xstorage.ValueTypeString),
	); err != nil {
		t.Fatalf("set legacy token: %v", err)
	}

	if _, _, err := loadWorkerConfig(share); err == nil {
		t.Fatal("legacy token must not satisfy Worker configuration")
	}
}
