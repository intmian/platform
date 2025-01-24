package db

import (
	"github.com/intmian/mian_go_lib/tool/misc"
	"testing"
)

func TestCreateDir(t *testing.T) {
	host := misc.InputWithFile("host")
	port := misc.InputWithFile("port")
	user := misc.InputWithFile("user")
	passwd := misc.InputWithFile("passwd")
	dbName := misc.InputWithFile("db_name")
	setting := Setting{
		User:   user,
		Passwd: passwd,
		Host:   host,
		Port:   port,
		DbName: dbName,
	}
	mgr, err := NewMgr(setting)
	if err != nil {
		t.Fatal(err)
	}
	err = mgr.Connect(ConnectTypeDir, &DirDB{})
	if err != nil {
		t.Fatal(err)
	}
	dirDB := mgr.GetConnect(ConnectTypeDir)
	CreateDir(dirDB, 1, 2, "title", "content")
}
