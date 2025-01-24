package db

import "gorm.io/gorm"

type DirDB struct {
	UserID   uint32
	ID       uint32 `gorm:"primaryKey"`
	Title    string
	Note     string
	ParentID uint32
}

func CreateDir(db *gorm.DB, userID, parentID uint32, title, note string) (uint32, error) {
	dir := DirDB{
		UserID:   userID,
		Title:    title,
		Note:     note,
		ParentID: parentID,
	}
	// 返回插入的ID
	result := db.Create(&dir)
	return dir.ID, result.Error
}

func GetDir(db *gorm.DB, dirID uint32) (*DirDB, error) {
	var dir DirDB
	result := db.Where("id = ?", dirID).First(&dir)
	return &dir, result.Error
}

func ChangeDir(db *gorm.DB, orm *DirDB) error {
	return db.Save(orm).Error
}

func ChangeDirTitle(db *gorm.DB, dirID uint32, title string) error {
	return db.Model(&DirDB{}).Where("id = ?", dirID).Update("title", title).Error
}

func ChangeDirNote(db *gorm.DB, dirID uint32, note string) error {
	return db.Model(&DirDB{}).Where("id = ?", dirID).Update("note", note).Error
}

func ChangeDirParent(db *gorm.DB, dirID, parentID uint32) error {
	return db.Model(&DirDB{}).Where("id = ?", dirID).Update("parent_id", parentID).Error
}

func DeleteDir(db *gorm.DB, dirID uint32) error {
	return db.Where("id = ?", dirID).Delete(&DirDB{}).Error
}
