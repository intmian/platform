package db

import "gorm.io/gorm"

type SubGroupDB struct {
	ID            uint32 `gorm:"primaryKey"`
	ParentGroupID uint32 `gorm:"index"`
	Title         string
	Note          string
	Index         float32 `gorm:"index"`
	TaskSequence  string
}

func CreateSubGroup(db *gorm.DB, parentGroupID uint32, title, note string, index float32, TaskSequence string) (uint32, error) {
	subGroup := SubGroupDB{
		ParentGroupID: parentGroupID,
		Title:         title,
		Note:          note,
		Index:         index,
		TaskSequence:  TaskSequence,
	}
	result := db.Create(&subGroup)
	return subGroup.ID, result.Error
}

func GetSubGroupByParentSortByIndex(db *gorm.DB, parentGroupID uint32) []*SubGroupDB {
	var subGroups []*SubGroupDB
	subGroups = make([]*SubGroupDB, 0)
	db.Where("parent_group_id = ?", parentGroupID).Order("`Index`").Find(&subGroups)
	return subGroups
}

func DeleteSubGroup(db *gorm.DB, subGroupID uint32) error {
	return db.Where("id = ?", subGroupID).Delete(&SubGroupDB{}).Error
}

func DeleteSubGroupByParentGroupID(db *gorm.DB, parentGroupID uint32) error {
	return db.Where("parent_group_id = ?", parentGroupID).Delete(&SubGroupDB{}).Error
}

func GetParentGroupIDMaxIndex(db *gorm.DB, parentGroupID uint32) float32 {
	var maxIndex float32
	db.Model(&SubGroupDB{}).Where("parent_group_id = ?", parentGroupID).Select("max(index)").Scan(&maxIndex)
	return maxIndex
}

func UpdateSubGroup(db *gorm.DB, subGroupID uint32, title, note string, index float32, taskSequence string) error {
	return db.Model(&SubGroupDB{}).Where("id = ?", subGroupID).Updates(SubGroupDB{
		Title:        title,
		Note:         note,
		Index:        index,
		TaskSequence: taskSequence,
	}).Error
}
