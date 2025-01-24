package db

import "gorm.io/gorm"

type TagsDB struct {
	userID uint32 // 主要是为了筛选用户有哪些tag
	taskID uint32
	tag    string
}

func AddTags(db *gorm.DB, userID, taskID uint32, tag string) error {
	tags := TagsDB{
		userID: userID,
		taskID: taskID,
		tag:    tag,
	}
	result := db.Create(&tags)
	return result.Error
}

func GetTags(db *gorm.DB, userID, taskID uint32) []string {
	var tags []TagsDB
	db.Where("user_id = ? and task_id = ?", userID, taskID).Find(&tags)
	var res []string
	for _, tag := range tags {
		res = append(res, tag.tag)
	}
	return res
}

func GetTagsByTaskID(db *gorm.DB, taskID uint32) []string {
	var tags []TagsDB
	db.Where("task_id = ?", taskID).Find(&tags)
	var res []string
	for _, tag := range tags {
		res = append(res, tag.tag)
	}
	return res
}

func DeleteTag(db *gorm.DB, taskID uint32, tag string) error {
	return db.Where("task_id = ? and tag = ?", taskID, tag).Delete(&TagsDB{}).Error
}

func DeleteTagByTaskID(db *gorm.DB, taskID uint32) error {
	return db.Where("task_id = ?", taskID).Delete(&TagsDB{}).Error
}
