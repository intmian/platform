package db

import "gorm.io/gorm"

type GroupDB struct {
	ID        uint32 `gorm:"primaryKey"`
	UserID    string `gorm:"index"`
	Title     string
	Note      string
	ParentDir uint32
	Deleted   bool
	Index     float32 `gorm:"index"`
}

func CreateGroup(db *gorm.DB, userID string, title, note string, parentDirID uint32) (*GroupDB, error) {
	group := GroupDB{
		UserID:    userID,
		Title:     title,
		Note:      note,
		ParentDir: parentDirID,
	}
	result := db.Create(&group)
	return &group, result.Error
}

func GetGroup(db *gorm.DB, groupID uint32) (*GroupDB, error) {
	var group GroupDB
	result := db.Where("id = ?", groupID).First(&group)
	return &group, result.Error
}

func ChangeGroup(db *gorm.DB, orm *GroupDB) error {
	return db.Save(orm).Error
}

func ChangeGroupTitle(db *gorm.DB, groupID uint32, title string) error {
	return db.Model(&GroupDB{}).Where("id = ?", groupID).Update("title", title).Error
}

func ChangeGroupNote(db *gorm.DB, groupID uint32, note string) error {
	return db.Model(&GroupDB{}).Where("id = ?", groupID).Update("note", note).Error
}

func DeleteGroup(db *gorm.DB, groupID uint32) error {
	// 将deleted字段置为true
	return db.Model(&GroupDB{}).Where("id = ?", groupID).Update("deleted", true).Error
}

func GetGroupsByUser(db *gorm.DB, userID string) ([]GroupDB, error) {
	var groups []GroupDB
	result := db.Where("user_id = ? AND deleted = ?", userID, false).Find(&groups)
	return groups, result.Error
}
