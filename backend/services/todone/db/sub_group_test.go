package db

import (
	"testing"

	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

func TestSubGroupMaxIndexAndOrder(t *testing.T) {
	conn, err := gorm.Open(sqlite.Open("file:sub_group_test?mode=memory&cache=shared"), &gorm.Config{Logger: logger.Default.LogMode(logger.Silent)})
	if err != nil {
		t.Fatal(err)
	}
	if err = conn.AutoMigrate(&SubGroupDB{}); err != nil {
		t.Fatal(err)
	}
	if got := GetParentGroupIDMaxIndex(conn, 1); got != 0 {
		t.Fatalf("empty group max index = %v, want 0", got)
	}
	// 模拟老数据：序号重复
	for _, title := range []string{"a", "b"} {
		if _, err = CreateSubGroup(conn, 1, title, "", 1, ""); err != nil {
			t.Fatal(err)
		}
	}
	if _, err = CreateSubGroup(conn, 1, "c", "", 2.5, ""); err != nil {
		t.Fatal(err)
	}
	if got := GetParentGroupIDMaxIndex(conn, 1); got != 2.5 {
		t.Fatalf("max index = %v, want 2.5", got)
	}
	if got := GetParentGroupIDMaxIndex(conn, 2); got != 0 {
		t.Fatalf("other group max index = %v, want 0", got)
	}
	sgs := GetSubGroupByParentSortByIndex(conn, 1)
	if len(sgs) != 3 || sgs[0].Title != "a" || sgs[1].Title != "b" || sgs[2].Title != "c" {
		t.Fatalf("unexpected order %v", sgs)
	}
}
