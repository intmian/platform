package db

import (
	"testing"

	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

func TestRoutineNodesUpsertAndDelete(t *testing.T) {
	conn, err := gorm.Open(sqlite.Open("file:routine_test?mode=memory&cache=shared"), &gorm.Config{Logger: logger.Default.LogMode(logger.Silent)})
	if err != nil {
		t.Fatal(err)
	}
	if err = conn.AutoMigrate(&RoutineNodeDB{}); err != nil {
		t.Fatal(err)
	}
	nodes := []RoutineNodeDB{
		{UserID: "u", GroupID: 1, Kind: RoutineNodeGroup, NodeID: 1, Rule: `{"kind":"manual"}`},
		{UserID: "u", GroupID: 1, Kind: RoutineNodeTask, NodeID: 7, Temp: true, Mark: "m1"},
	}
	if err = SaveRoutineNodes(conn, nodes); err != nil {
		t.Fatal(err)
	}
	// 再次保存同一节点应更新而不是新增
	if err = SaveRoutineNodes(conn, []RoutineNodeDB{{UserID: "u", GroupID: 1, Kind: RoutineNodeTask, NodeID: 7, Folder: true, Mark: "m2", PrevMark: "m1"}}); err != nil {
		t.Fatal(err)
	}
	got, err := GetRoutineNodes(conn, "u", 1)
	if err != nil || len(got) != 2 {
		t.Fatalf("unexpected nodes %v %v", got, err)
	}
	for _, n := range got {
		if n.Kind == RoutineNodeTask && (n.Mark != "m2" || n.PrevMark != "m1" || n.Temp || !n.Folder) {
			t.Fatalf("task node not updated: %#v", n)
		}
	}
	if err = DeleteRoutineNodes(conn, "u", RoutineNodeTask, []uint32{7}); err != nil {
		t.Fatal(err)
	}
	got, _ = GetRoutineNodes(conn, "u", 1)
	if len(got) != 1 || got[0].Kind != RoutineNodeGroup {
		t.Fatalf("delete failed: %v", got)
	}
}
