package db

import "testing"

func TestCreateDir(t *testing.T) {
	setting := realWorkerTestSetting(t)
	mgr, err := NewMgr(setting)
	if err != nil {
		t.Fatal(err)
	}
	err = mgr.Connect(ConnectTypeDir, &DirDB{})
	if err != nil {
		t.Fatal(err)
	}
	dirDB := mgr.GetConnect(ConnectTypeDir)
	dir, err := CreateDir(dirDB, "worker-test", 2, "title", "content")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		_ = dirDB.Where("id = ?", dir.ID).Delete(&DirDB{}).Error
	})
}
