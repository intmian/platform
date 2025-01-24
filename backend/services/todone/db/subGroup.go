package db

import "gorm.io/gorm"

type SubGroupDB struct {
	ID            uint32 `gorm:"primaryKey"`
	ParentGroupID uint32
	Title         string
	Note          string
	Index         float32
}

func CreateSubGroup(db *gorm.DB, parentGroupID uint32, title, note string, index float32) (uint32, error) {
	subGroup := SubGroupDB{
		ParentGroupID: parentGroupID,
		Title:         title,
		Note:          note,
		Index:         index,
	}
	result := db.Create(&subGroup)
	return subGroup.ID, result.Error
}

func GetSubGroupByParentGroupID(db *gorm.DB, parentGroupID uint32) []SubGroupDB {
	var subGroups []SubGroupDB
	db.Where("parent_group_id = ?", parentGroupID).Find(&subGroups)
	return subGroups
}

func DeleteSubGroup(db *gorm.DB, subGroupID uint32) error {
	return db.Where("id = ?", subGroupID).Delete(&SubGroupDB{}).Error
}

func DeleteSubGroupByParentGroupID(db *gorm.DB, parentGroupID uint32) error {
	return db.Where("parent_group_id = ?", parentGroupID).Delete(&SubGroupDB{}).Error
}
