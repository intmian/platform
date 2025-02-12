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

func GetSubGroupByParentSortByIndex(db *gorm.DB, parentGroupID uint32) []SubGroupDB {
	var subGroups []SubGroupDB
	db.Where("parent_group_id = ?", parentGroupID).Order("Index").Find(&subGroups)
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
