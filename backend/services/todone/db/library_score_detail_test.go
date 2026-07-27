package db

import (
	"errors"
	"testing"

	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

func newLibraryScoreDetailTestDB(t *testing.T) *gorm.DB {
	t.Helper()
	conn, err := gorm.Open(sqlite.Open("file::memory:?cache=shared"), &gorm.Config{Logger: logger.Default.LogMode(logger.Silent)})
	if err != nil {
		t.Fatal(err)
	}
	if err = conn.AutoMigrate(&LibraryScoreDetailDB{}); err != nil {
		t.Fatal(err)
	}
	return conn
}

func TestLibraryScoreDetailCRUDAndIdempotency(t *testing.T) {
	conn := newLibraryScoreDetailTestDB(t)
	requestID := "request-1"
	objValue := uint8(4)
	detail := &LibraryScoreDetailDB{
		ID: "score-1", UserID: "user-1", TaskID: 10, RoundID: "round-1", Mode: "complex", Comment: "main",
		ObjValue: &objValue, ObjAdjustment: 1, ObjComment: "objective", Revision: 1, ClientRequestID: &requestID,
	}
	created, err := CreateLibraryScoreDetail(conn, detail)
	if err != nil {
		t.Fatal(err)
	}
	if created.ID != detail.ID || created.Revision != 1 {
		t.Fatalf("unexpected create result: %#v", created)
	}

	retry := *detail
	retried, err := CreateLibraryScoreDetail(conn, &retry)
	if err != nil || retried.ID != detail.ID {
		t.Fatalf("idempotent retry failed: detail=%#v err=%v", retried, err)
	}

	conflict := retry
	conflict.Comment = "different"
	if _, err = CreateLibraryScoreDetail(conn, &conflict); !errors.Is(err, ErrLibraryScoreDetailRequestConflict) {
		t.Fatalf("request conflict err=%v", err)
	}

	updatedInput := *detail
	updatedInput.Comment = "updated"
	updated, err := ChangeLibraryScoreDetail(conn, &updatedInput, 1)
	if err != nil {
		t.Fatal(err)
	}
	if updated.Revision != 2 || updated.Comment != "updated" {
		t.Fatalf("unexpected update result: %#v", updated)
	}
	if _, err = ChangeLibraryScoreDetail(conn, &updatedInput, 1); !errors.Is(err, ErrLibraryScoreDetailRevisionConflict) {
		t.Fatalf("stale update err=%v", err)
	}
}
