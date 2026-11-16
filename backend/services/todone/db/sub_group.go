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
	db.Where("parent_group_id = ?", parentGroupID).Order("`Index`, id").Find(&subGroups) // 老数据序号大量重复，按创建先后兜底
	return subGroups
}

func DeleteSubGroup(db *gorm.DB, subGroupID uint32) error {
	return db.Where("id = ?", subGroupID).Delete(&SubGroupDB{}).Error
}

func DeleteSubGroupByParentGroupID(db *gorm.DB, parentGroupID uint32) error {
	return db.Where("parent_group_id = ?", parentGroupID).Delete(&SubGroupDB{}).Error
}

func GetParentGroupIDMaxIndex(db *gorm.DB, parentGroupID uint32) float32 {
	// index 是 SQL 关键字，必须加反引号；之前写成 max(index) 一直报错被吞掉，所有新卡片的序号都成了 1。
	// COALESCE 让没有子分组时返回 0 而不是 NULL（NULL 扫不进 float32）。
	var maxIndex float32
	err := db.Model(&SubGroupDB{}).Where("parent_group_id = ?", parentGroupID).
		Select("COALESCE(MAX(`index`), 0)").Row().Scan(&maxIndex)
	if err != nil {
		println("GetParentGroupIDMaxIndex error:", err.Error())
	}
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
