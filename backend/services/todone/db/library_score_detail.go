package db

import (
	"errors"
	"time"

	"gorm.io/gorm"
)

var (
	ErrLibraryScoreDetailNotFound         = errors.New("library score detail not found")
	ErrLibraryScoreDetailRevisionConflict = errors.New("library score detail revision conflict")
	ErrLibraryScoreDetailRequestConflict  = errors.New("library score detail request conflict")
)

type LibraryScoreDetailDB struct {
	ID                 string `gorm:"primaryKey"`
	UserID             string `gorm:"not null;index:idx_library_score_details_scope,priority:1;uniqueIndex:idx_library_score_details_request,priority:1"`
	TaskID             uint32 `gorm:"not null;index:idx_library_score_details_scope,priority:2"`
	RoundID            string `gorm:"not null;index:idx_library_score_details_scope,priority:3"`
	Mode               string `gorm:"not null"`
	Comment            string
	ObjValue           *uint8
	ObjAdjustment      int8
	ObjComment         string
	SubValue           *uint8
	SubAdjustment      int8
	SubComment         string
	InnovateValue      *uint8
	InnovateAdjustment int8
	InnovateComment    string
	Revision           uint32  `gorm:"not null"`
	ClientRequestID    *string `gorm:"uniqueIndex:idx_library_score_details_request,priority:2"`
	CreatedAt          time.Time
	UpdatedAt          time.Time
	DeletedAt          gorm.DeletedAt `gorm:"index"`
}

func (LibraryScoreDetailDB) TableName() string { return "library_score_details" }

func sameLibraryScoreDetail(a, b *LibraryScoreDetailDB) bool {
	if a.ID != b.ID || a.UserID != b.UserID || a.TaskID != b.TaskID || a.RoundID != b.RoundID ||
		a.Mode != b.Mode || a.Comment != b.Comment || a.ObjAdjustment != b.ObjAdjustment ||
		a.ObjComment != b.ObjComment || a.SubAdjustment != b.SubAdjustment || a.SubComment != b.SubComment ||
		a.InnovateAdjustment != b.InnovateAdjustment || a.InnovateComment != b.InnovateComment {
		return false
	}
	return equalOptionalUint8(a.ObjValue, b.ObjValue) && equalOptionalUint8(a.SubValue, b.SubValue) &&
		equalOptionalUint8(a.InnovateValue, b.InnovateValue)
}

func equalOptionalUint8(a, b *uint8) bool {
	if a == nil || b == nil {
		return a == nil && b == nil
	}
	return *a == *b
}

func CreateLibraryScoreDetail(conn *gorm.DB, detail *LibraryScoreDetailDB) (*LibraryScoreDetailDB, error) {
	if detail.ClientRequestID != nil {
		var existing LibraryScoreDetailDB
		err := conn.Unscoped().Where("user_id = ? AND client_request_id = ?", detail.UserID, *detail.ClientRequestID).First(&existing).Error
		if err == nil {
			if existing.DeletedAt.Valid || !sameLibraryScoreDetail(&existing, detail) {
				return nil, ErrLibraryScoreDetailRequestConflict
			}
			return &existing, nil
		}
		if !errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, err
		}
	}
	var existing LibraryScoreDetailDB
	err := conn.Unscoped().Where("id = ?", detail.ID).First(&existing).Error
	if err == nil {
		if existing.DeletedAt.Valid || !sameLibraryScoreDetail(&existing, detail) {
			return nil, ErrLibraryScoreDetailRequestConflict
		}
		return &existing, nil
	}
	if !errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, err
	}
	if err = conn.Create(detail).Error; err != nil {
		return nil, err
	}
	return detail, nil
}

func GetLibraryScoreDetail(conn *gorm.DB, userID string, taskID uint32, scoreID string) (*LibraryScoreDetailDB, error) {
	var detail LibraryScoreDetailDB
	if err := conn.Where("id = ? AND user_id = ? AND task_id = ?", scoreID, userID, taskID).First(&detail).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrLibraryScoreDetailNotFound
		}
		return nil, err
	}
	return &detail, nil
}

func ChangeLibraryScoreDetail(conn *gorm.DB, detail *LibraryScoreDetailDB, expectedRevision uint32) (*LibraryScoreDetailDB, error) {
	now := time.Now().UTC()
	result := conn.Model(&LibraryScoreDetailDB{}).
		Where("id = ? AND user_id = ? AND task_id = ? AND revision = ? AND deleted_at IS NULL", detail.ID, detail.UserID, detail.TaskID, expectedRevision).
		Updates(map[string]any{
			"mode": detail.Mode, "comment": detail.Comment,
			"obj_value": detail.ObjValue, "obj_adjustment": detail.ObjAdjustment, "obj_comment": detail.ObjComment,
			"sub_value": detail.SubValue, "sub_adjustment": detail.SubAdjustment, "sub_comment": detail.SubComment,
			"innovate_value": detail.InnovateValue, "innovate_adjustment": detail.InnovateAdjustment,
			"innovate_comment": detail.InnovateComment,
			"revision":         gorm.Expr("revision + 1"), "updated_at": now,
		})
	if result.Error != nil {
		return nil, result.Error
	}
	if result.RowsAffected != 1 {
		var count int64
		if err := conn.Model(&LibraryScoreDetailDB{}).Where("id = ? AND user_id = ? AND task_id = ?", detail.ID, detail.UserID, detail.TaskID).Count(&count).Error; err != nil {
			return nil, err
		}
		if count == 0 {
			return nil, ErrLibraryScoreDetailNotFound
		}
		return nil, ErrLibraryScoreDetailRevisionConflict
	}
	return GetLibraryScoreDetail(conn, detail.UserID, detail.TaskID, detail.ID)
}
