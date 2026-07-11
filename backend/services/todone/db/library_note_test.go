package db

import (
	"errors"
	"fmt"
	"testing"
	"time"

	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

func newLibraryNoteTestDB(t *testing.T) *gorm.DB {
	t.Helper()
	conn, err := gorm.Open(sqlite.Open("file::memory:?cache=shared"), &gorm.Config{Logger: logger.Default.LogMode(logger.Silent)})
	if err != nil {
		t.Fatal(err)
	}
	if err = conn.AutoMigrate(&LibraryNoteDB{}); err != nil {
		t.Fatal(err)
	}
	return conn
}

func TestLibraryNoteCRUDAndIdempotency(t *testing.T) {
	conn := newLibraryNoteTestDB(t)
	requestID := "req-1"
	eventTime := time.Date(2026, 7, 11, 1, 2, 3, 0, time.UTC)
	note := &LibraryNoteDB{
		ID: "note-1", UserID: "user-1", TaskID: 10, RoundID: "round-1", EventTime: eventTime,
		Content: "private content", Revision: 1, ClientRequestID: &requestID,
	}
	created, err := CreateLibraryNote(conn, note)
	if err != nil {
		t.Fatal(err)
	}
	if created.ID != note.ID || created.Revision != 1 {
		t.Fatalf("unexpected create result: %#v", created)
	}

	retry := *note
	retry.ID = "different-generated-id"
	retried, err := CreateLibraryNote(conn, &retry)
	if err != nil {
		t.Fatal(err)
	}
	if retried.ID != note.ID {
		t.Fatalf("idempotent create returned %q, want %q", retried.ID, note.ID)
	}

	conflict := retry
	conflict.Content = "different"
	if _, err = CreateLibraryNote(conn, &conflict); !errors.Is(err, ErrLibraryNoteRequestConflict) {
		t.Fatalf("request conflict err=%v", err)
	}

	updated, err := ChangeLibraryNote(conn, "user-1", 10, note.ID, 1, "updated", eventTime.Add(time.Hour))
	if err != nil {
		t.Fatal(err)
	}
	if updated.Revision != 2 || updated.Content != "updated" {
		t.Fatalf("unexpected update result: %#v", updated)
	}
	if _, err = ChangeLibraryNote(conn, "user-1", 10, note.ID, 1, "stale", eventTime); !errors.Is(err, ErrLibraryNoteRevisionConflict) {
		t.Fatalf("stale update err=%v", err)
	}

	if err = DeleteLibraryNote(conn, "user-1", 10, note.ID, 2); err != nil {
		t.Fatal(err)
	}
	notes, err := GetLibraryNotes(conn, "user-1", 10, []string{"round-1"})
	if err != nil {
		t.Fatal(err)
	}
	if len(notes) != 0 {
		t.Fatalf("deleted note still returned: %#v", notes)
	}
}

func TestGetLibraryNotesLimit(t *testing.T) {
	conn := newLibraryNoteTestDB(t)
	now := time.Now().UTC()
	notes := make([]LibraryNoteDB, 0, MaxLibraryNotesPerTask+1)
	for i := 0; i <= MaxLibraryNotesPerTask; i++ {
		notes = append(notes, LibraryNoteDB{
			ID: fmt.Sprintf("limit-%03d", i), UserID: "limit-user", TaskID: 20, RoundID: "round-limit",
			EventTime: now.Add(time.Duration(i) * time.Second), Content: "x", Revision: 1,
		})
	}
	if err := conn.CreateInBatches(notes, 50).Error; err != nil {
		t.Fatal(err)
	}
	if _, err := GetLibraryNotes(conn, "limit-user", 20, []string{"round-limit"}); !errors.Is(err, ErrTooManyLibraryNotes) {
		t.Fatalf("limit err=%v", err)
	}
}
