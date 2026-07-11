package db

import (
	"errors"
	"time"

	"gorm.io/gorm"
)

const MaxLibraryNotesPerTask = 500

var (
	ErrLibraryNoteNotFound         = errors.New("library note not found")
	ErrLibraryNoteRevisionConflict = errors.New("library note revision conflict")
	ErrLibraryNoteRequestConflict  = errors.New("library note request conflict")
	ErrTooManyLibraryNotes         = errors.New("too many library notes")
)

type LibraryNoteDB struct {
	ID              string    `gorm:"primaryKey"`
	UserID          string    `gorm:"not null;index:idx_library_notes_scope,priority:1;uniqueIndex:idx_library_notes_request,priority:1"`
	TaskID          uint32    `gorm:"not null;index:idx_library_notes_scope,priority:2"`
	RoundID         string    `gorm:"not null;index:idx_library_notes_scope,priority:3"`
	EventTime       time.Time `gorm:"not null;index:idx_library_notes_scope,priority:4"`
	Content         string    `gorm:"not null"`
	Revision        uint32    `gorm:"not null"`
	ClientRequestID *string   `gorm:"uniqueIndex:idx_library_notes_request,priority:2"`
	CreatedAt       time.Time
	UpdatedAt       time.Time
	DeletedAt       gorm.DeletedAt `gorm:"index"`
}

func (LibraryNoteDB) TableName() string { return "library_notes" }

func CreateLibraryNote(conn *gorm.DB, note *LibraryNoteDB) (*LibraryNoteDB, error) {
	if note.ClientRequestID != nil {
		var existing LibraryNoteDB
		err := conn.Unscoped().Where("user_id = ? AND client_request_id = ?", note.UserID, *note.ClientRequestID).First(&existing).Error
		if err == nil {
			if existing.DeletedAt.Valid || existing.TaskID != note.TaskID || existing.RoundID != note.RoundID ||
				existing.Content != note.Content || !existing.EventTime.Equal(note.EventTime) {
				return nil, ErrLibraryNoteRequestConflict
			}
			return &existing, nil
		}
		if !errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, err
		}
	}
	if err := conn.Create(note).Error; err != nil {
		return nil, err
	}
	return note, nil
}

func GetLibraryNotes(conn *gorm.DB, userID string, taskID uint32, roundIDs []string) ([]LibraryNoteDB, error) {
	if len(roundIDs) == 0 {
		return make([]LibraryNoteDB, 0), nil
	}
	var notes []LibraryNoteDB
	err := conn.Where("user_id = ? AND task_id = ? AND round_id IN ?", userID, taskID, roundIDs).
		Order("event_time ASC, id ASC").Limit(MaxLibraryNotesPerTask + 1).Find(&notes).Error
	if err != nil {
		return nil, err
	}
	if len(notes) > MaxLibraryNotesPerTask {
		return nil, ErrTooManyLibraryNotes
	}
	if notes == nil {
		notes = make([]LibraryNoteDB, 0)
	}
	return notes, nil
}

func GetLibraryNote(conn *gorm.DB, userID string, taskID uint32, noteID string) (*LibraryNoteDB, error) {
	var note LibraryNoteDB
	if err := conn.Where("id = ? AND user_id = ? AND task_id = ?", noteID, userID, taskID).First(&note).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrLibraryNoteNotFound
		}
		return nil, err
	}
	return &note, nil
}

func ChangeLibraryNote(conn *gorm.DB, userID string, taskID uint32, noteID string, revision uint32, content string, eventTime time.Time) (*LibraryNoteDB, error) {
	now := time.Now().UTC()
	result := conn.Model(&LibraryNoteDB{}).
		Where("id = ? AND user_id = ? AND task_id = ? AND revision = ? AND deleted_at IS NULL", noteID, userID, taskID, revision).
		Updates(map[string]any{
			"content": content, "event_time": eventTime, "revision": gorm.Expr("revision + 1"), "updated_at": now,
		})
	if result.Error != nil {
		return nil, result.Error
	}
	if result.RowsAffected != 1 {
		var count int64
		if err := conn.Model(&LibraryNoteDB{}).Where("id = ? AND user_id = ? AND task_id = ?", noteID, userID, taskID).Count(&count).Error; err != nil {
			return nil, err
		}
		if count == 0 {
			return nil, ErrLibraryNoteNotFound
		}
		return nil, ErrLibraryNoteRevisionConflict
	}
	var updated LibraryNoteDB
	if err := conn.Where("id = ?", noteID).First(&updated).Error; err != nil {
		return nil, err
	}
	return &updated, nil
}

func DeleteLibraryNote(conn *gorm.DB, userID string, taskID uint32, noteID string, revision uint32) error {
	now := time.Now().UTC()
	result := conn.Model(&LibraryNoteDB{}).
		Where("id = ? AND user_id = ? AND task_id = ? AND revision = ? AND deleted_at IS NULL", noteID, userID, taskID, revision).
		Updates(map[string]any{"deleted_at": now, "revision": gorm.Expr("revision + 1"), "updated_at": now})
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected == 1 {
		return nil
	}
	var count int64
	if err := conn.Model(&LibraryNoteDB{}).Where("id = ? AND user_id = ? AND task_id = ?", noteID, userID, taskID).Count(&count).Error; err != nil {
		return err
	}
	if count == 0 {
		return ErrLibraryNoteNotFound
	}
	return ErrLibraryNoteRevisionConflict
}
