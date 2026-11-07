package platform

import (
	"errors"
	"testing"

	"github.com/intmian/mian_go_lib/tool/misc"
	"github.com/intmian/mian_go_lib/xstorage"
)

func TestRetiredNoteConfigRegistrationPreservesStoredValue(t *testing.T) {
	storage, err := xstorage.NewXStorage(xstorage.XStorageSetting{Property: misc.CreateProperty(xstorage.MultiSafe, xstorage.UseCache)})
	if err != nil {
		t.Fatal(err)
	}
	if err = storage.Set("note.setting", xstorage.ToUnit("synthetic-retained-value", xstorage.ValueTypeString)); err != nil {
		t.Fatal(err)
	}
	cfg, err := xstorage.NewCfgExt(storage)
	if err != nil {
		t.Fatal(err)
	}
	p := &PlatForm{cfg: cfg}
	if err = p.InitCfg(); err != nil {
		t.Fatal(err)
	}
	if _, err = cfg.Get("note.setting"); !errors.Is(err, xstorage.ErrParamIsInvalid) {
		t.Fatalf("retired setting unexpectedly registered: %v", err)
	}
	saved, err := storage.Get("note.setting")
	if err != nil {
		t.Fatal(err)
	}
	if saved == nil || xstorage.ToBase[string](saved) != "synthetic-retained-value" {
		t.Fatal("stored setting was changed or removed")
	}
}
