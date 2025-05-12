package db

import "gorm.io/gorm"

type TagsDB struct {
	UserID string `gorm:"index"` // 主要是为了筛选用户有哪些tag
	TaskID uint32 `gorm:"index"`
	Tag    string
}

func AddTags(db *gorm.DB, userID string, taskID uint32, tag string) error {
	tags := TagsDB{
		UserID: userID,
		TaskID: taskID,
		Tag:    tag,
	}
	result := db.Create(&tags)
	return result.Error
}

func GetTags(db *gorm.DB, userID, taskID uint32) []string {
	var tags []TagsDB
	db.Where("user_id = ? and task_id = ?", userID, taskID).Find(&tags)
	var res []string
	for _, tag := range tags {
		res = append(res, tag.Tag)
	}
	return res
}

func GetTagsByTaskID(db *gorm.DB, taskID uint32) []string {
	var tags []TagsDB
	db.Where("task_id = ?", taskID).Find(&tags)
	var res []string
	for _, tag := range tags {
		res = append(res, tag.Tag)
	}
	if res == nil {
		return make([]string, 0)
	}
	return res
}

func GetTagsByMultipleTaskID(db *gorm.DB, taskIDs []uint32) map[uint32][]string {
	var tags []TagsDB
	tags = make([]TagsDB, 0)
	db.Where("task_id in ?", taskIDs).Find(&tags)
	res := make(map[uint32][]string)
	for _, taskID := range taskIDs {
		res[taskID] = make([]string, 0)
	}
	for _, tag := range tags {
		res[tag.TaskID] = append(res[tag.TaskID], tag.Tag)
	}
	return res
}

func DeleteTag(db *gorm.DB, taskID uint32, tag string) error {
	return db.Where("task_id = ? and tag = ?", taskID, tag).Delete(&TagsDB{}).Error
}

func DeleteTagByTaskID(db *gorm.DB, taskID uint32) error {
	return db.Where("task_id = ?", taskID).Delete(&TagsDB{}).Error
}
