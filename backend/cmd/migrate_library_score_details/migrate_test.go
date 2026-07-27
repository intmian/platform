package main

import (
	"encoding/json"
	"net/url"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/intmian/platform/backend/services/todone/db"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

const testRoundID = "b9787c98-6eb0-43dc-91a5-9fd27af7d038"

func TestTransformTaskMovesOnlyScoreDetails(t *testing.T) {
	original := `{
      "unknownFuture":{"keep":true},
      "currentRound":0,
      "mainScoreRoundIndex":0,
      "mainScoreLogIndex":1,
      "createdAt":"2026-01-01T00:00:00Z",
      "updatedAt":"2026-01-03T00:00:00Z",
      "rounds":[{
        "id":"` + testRoundID + `",
        "name":"首周目",
        "startTime":"2026-01-01T00:00:00Z",
        "logs":[
          {"type":0,"time":"2026-01-01T00:00:00Z","status":1,"comment":"开始"},
          {"type":1,"time":"2026-01-03T00:00:00Z","score":4,"scorePlus":true,"comment":"总评","scoreMode":"complex","objScore":{"value":5,"plus":false,"sub":true,"comment":"客观"},"unknownScore":{"keep":true}}
        ]
      }]
    }`
	migration, complexCount, legacyCreated, err := transformTask("user", 42, original)
	if err != nil {
		t.Fatal(err)
	}
	if legacyCreated || complexCount != 1 || len(migration.Details) != 1 {
		t.Fatalf("unexpected counts: complex=%d legacy=%v details=%d", complexCount, legacyCreated, len(migration.Details))
	}
	detail := migration.Details[0]
	if detail.Mode != "complex" || detail.Comment != "总评" || detail.ObjValue == nil || *detail.ObjValue != 5 || detail.ObjAdjustment != -1 {
		t.Fatalf("unexpected detail: %#v", detail)
	}
	var root map[string]json.RawMessage
	if err := json.Unmarshal([]byte(migration.TransformedNote), &root); err != nil {
		t.Fatal(err)
	}
	if _, ok := root["unknownFuture"]; !ok {
		t.Fatal("root unknown field dropped")
	}
	var mainScoreID string
	if err := json.Unmarshal(root["mainScoreID"], &mainScoreID); err != nil || mainScoreID != detail.ID {
		t.Fatalf("main score id=%q err=%v", mainScoreID, err)
	}
	for _, key := range []string{"mainScoreRoundIndex", "mainScoreLogIndex", "scoreMode", "mainScore"} {
		if _, ok := root[key]; ok {
			t.Fatalf("deprecated root field %s retained", key)
		}
	}
	var rounds []map[string]json.RawMessage
	if err := json.Unmarshal(root["rounds"], &rounds); err != nil {
		t.Fatal(err)
	}
	var logs []map[string]json.RawMessage
	if err := json.Unmarshal(rounds[0]["logs"], &logs); err != nil {
		t.Fatal(err)
	}
	score := logs[1]
	for _, key := range []string{"comment", "scoreMode", "objScore", "subScore", "innovateScore"} {
		if _, ok := score[key]; ok {
			t.Fatalf("detail field %s retained in score log", key)
		}
	}
	if _, ok := score["unknownScore"]; !ok {
		t.Fatal("unknown score field dropped")
	}
	if _, ok := score["score"]; !ok {
		t.Fatal("core score value dropped")
	}

	retry, _, _, err := transformTask("user", 42, original)
	if err != nil || retry.TransformedNote != migration.TransformedNote || retry.Details[0].ID != detail.ID {
		t.Fatal("migration is not deterministic")
	}
}

func TestTransformTaskSynthesizesLegacyMainScore(t *testing.T) {
	original := `{
      "currentRound":0,
      "createdAt":"2026-01-01T00:00:00Z",
      "updatedAt":"2026-01-02T00:00:00Z",
      "scoreMode":"simple",
      "mainScore":{"value":3,"plus":false,"sub":false,"comment":"legacy"},
      "rounds":[{"id":"` + testRoundID + `","name":"首周目","startTime":"2026-01-01T00:00:00Z","logs":[]}]
    }`
	migration, _, legacyCreated, err := transformTask("user", 7, original)
	if err != nil {
		t.Fatal(err)
	}
	if !legacyCreated || len(migration.Details) != 1 || migration.Details[0].Comment != "legacy" {
		t.Fatalf("legacy migration mismatch: %#v", migration)
	}
}

func TestTransformTaskRejectsUnsafeInputs(t *testing.T) {
	cases := []string{
		`not-json`,
		`{"rounds":[]}`,
		`{"rounds":[{"id":"` + testRoundID + `","logs":[{"type":2,"time":"2026-01-01T00:00:00Z","comment":"note"}]}]}`,
		`{"rounds":[{"id":"` + testRoundID + `","logs":[{"type":1,"time":"2026-01-01T00:00:00Z","score":3,"scorePlus":true,"scoreSub":true}]}]}`,
	}
	for _, input := range cases {
		if _, _, _, err := transformTask("user", 1, input); err == nil {
			t.Fatalf("expected error for %s", input)
		}
	}
}

func newMigrationTestDB(t *testing.T, originalNote string) (*gorm.DB, db.TaskDB) {
	t.Helper()
	conn, err := gorm.Open(sqlite.Open("file:"+url.QueryEscape(t.Name())+"?mode=memory&cache=shared"), &gorm.Config{
		Logger: logger.Default.LogMode(logger.Silent),
	})
	if err != nil {
		t.Fatal(err)
	}
	if err = conn.AutoMigrate(&db.GroupDB{}, &db.SubGroupDB{}, &db.TaskDB{}); err != nil {
		t.Fatal(err)
	}
	group := db.GroupDB{ID: 11, UserID: "user", Type: db.GroupTypeLibrary, Title: "library"}
	subGroup := db.SubGroupDB{ID: 12, ParentGroupID: group.ID, Title: "items"}
	updatedAt := time.Date(2026, 1, 3, 4, 5, 6, 0, time.UTC)
	task := db.TaskDB{
		UserID: "user", TaskID: 42, Title: "item", Note: originalNote,
		ParentSubGroupID: subGroup.ID, CreatedAt: updatedAt.Add(-time.Hour), UpdatedAt: updatedAt,
	}
	if err = conn.Create(&group).Error; err != nil {
		t.Fatal(err)
	}
	if err = conn.Create(&subGroup).Error; err != nil {
		t.Fatal(err)
	}
	if err = conn.Create(&task).Error; err != nil {
		t.Fatal(err)
	}
	return conn, task
}

func migrationLifecycleNote() string {
	return `{
      "unknownFuture":{"keep":true},
      "currentRound":0,
      "mainScoreRoundIndex":0,
      "mainScoreLogIndex":0,
      "createdAt":"2026-01-01T00:00:00Z",
      "updatedAt":"2026-01-03T00:00:00Z",
      "rounds":[{
        "id":"` + testRoundID + `",
        "name":"首周目",
        "startTime":"2026-01-01T00:00:00Z",
        "logs":[{"type":1,"time":"2026-01-03T00:00:00Z","score":4,"scoreSub":true,"comment":"迁移评价","scoreMode":"complex","subScore":{"value":3,"plus":true,"sub":false,"comment":"主观评价"}}]
      }]
    }`
}

func TestMigrationApplyVerifyRollbackLifecycle(t *testing.T) {
	original := migrationLifecycleNote()
	conn, seededTask := newMigrationTestDB(t, original)
	backupPath := t.TempDir() + "/score-details.jsonl"

	plan, err := buildMigrationPlan(conn)
	if err != nil {
		t.Fatal(err)
	}
	if len(plan.Tasks) != 1 || plan.ScoreCount != 1 || plan.ComplexCount != 1 {
		t.Fatalf("unexpected plan: %#v", plan)
	}
	if _, err = os.Stat(backupPath); !os.IsNotExist(err) {
		t.Fatalf("planning unexpectedly created backup: %v", err)
	}

	if err = applyMigration(conn, backupPath); err != nil {
		t.Fatal(err)
	}
	backupInfo, err := os.Stat(backupPath)
	if err != nil {
		t.Fatal(err)
	}
	if backupInfo.Mode().Perm() != 0o600 {
		t.Fatalf("backup permissions=%o", backupInfo.Mode().Perm())
	}
	if err = verifyFromBackup(conn, backupPath); err != nil {
		t.Fatal(err)
	}

	var migratedTask db.TaskDB
	if err = conn.First(&migratedTask, "task_id = ?", seededTask.TaskID).Error; err != nil {
		t.Fatal(err)
	}
	if migratedTask.Note == original || migratedTask.UpdatedAt.UTC() != seededTask.UpdatedAt.UTC() {
		t.Fatalf("task core was not migrated safely: noteChanged=%v updatedAt=%s", migratedTask.Note != original, migratedTask.UpdatedAt)
	}
	var detail db.LibraryScoreDetailDB
	if err = conn.First(&detail).Error; err != nil {
		t.Fatal(err)
	}
	if detail.Comment != "迁移评价" || detail.Mode != "complex" || detail.SubValue == nil || *detail.SubValue != 3 || detail.SubAdjustment != 1 {
		t.Fatalf("unexpected migrated detail: %#v", detail)
	}

	if err = rollbackFromBackup(conn, backupPath); err != nil {
		t.Fatal(err)
	}
	if err = conn.First(&migratedTask, "task_id = ?", seededTask.TaskID).Error; err != nil {
		t.Fatal(err)
	}
	if migratedTask.Note != original || migratedTask.UpdatedAt.UTC() != seededTask.UpdatedAt.UTC() {
		t.Fatalf("rollback did not restore original task: %#v", migratedTask)
	}
	var detailCount int64
	if err = conn.Unscoped().Model(&db.LibraryScoreDetailDB{}).Count(&detailCount).Error; err != nil {
		t.Fatal(err)
	}
	if detailCount != 0 {
		t.Fatalf("rollback retained %d details", detailCount)
	}
}

func TestMigrationRollbackRefusesPostCutoverChanges(t *testing.T) {
	for _, tc := range []struct {
		name   string
		mutate func(*gorm.DB) error
		want   string
	}{
		{
			name: "task core changed",
			mutate: func(conn *gorm.DB) error {
				return conn.Model(&db.TaskDB{}).Where("task_id = ?", 42).UpdateColumn("note", `{"changed":true}`).Error
			},
			want: "changed after migration",
		},
		{
			name: "score detail changed",
			mutate: func(conn *gorm.DB) error {
				return conn.Model(&db.LibraryScoreDetailDB{}).Where("task_id = ?", 42).Updates(map[string]any{"comment": "edited", "revision": gorm.Expr("revision + 1")}).Error
			},
			want: "changed after migration",
		},
	} {
		t.Run(tc.name, func(t *testing.T) {
			conn, _ := newMigrationTestDB(t, migrationLifecycleNote())
			backupPath := t.TempDir() + "/score-details.jsonl"
			if err := applyMigration(conn, backupPath); err != nil {
				t.Fatal(err)
			}
			if err := tc.mutate(conn); err != nil {
				t.Fatal(err)
			}
			err := rollbackFromBackup(conn, backupPath)
			if err == nil || !strings.Contains(err.Error(), tc.want) {
				t.Fatalf("rollback error=%v, want %q", err, tc.want)
			}
		})
	}
}
