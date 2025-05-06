package db

import "gorm.io/gorm"

type DirDB struct {
	UserID   string `gorm:"index"`
	ID       uint32 `gorm:"primaryKey"`
	Title    string
	Note     string
	ParentID uint32
	Index    float32 `gorm:"index"`
}

func CreateDir(db *gorm.DB, userID string, parentID uint32, title, note string) (*DirDB, error) {
	dir := DirDB{
		UserID:   userID,
		Title:    title,
		Note:     note,
		ParentID: parentID,
	}
	// 返回插入的ID
	result := db.Create(&dir)
	return &dir, result.Error
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

func GetDirsByUserID(db *gorm.DB, userID string) ([]DirDB, error) {
	var dirs []DirDB
	result := db.Where("user_id = ?", userID).Find(&dirs)
	return dirs, result.Error
}
