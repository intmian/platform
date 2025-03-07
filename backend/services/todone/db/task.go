package db

import (
	"gorm.io/gorm"
	"time"
)

type TaskDB struct {
	UserID           string
	TaskID           uint32 `gorm:"primaryKey"`
	Title            string
	Note             string
	ParentSubGroupID uint32
	ParentTaskID     uint32
	Index            float32
	Deleted          bool
	Done             bool
	CreatedAt        time.Time
	UpdatedAt        time.Time
}

func CreateTask(db *gorm.DB, userID string, parentSubGroupID, parentTaskID uint32, title, note string, index float32) (uint32, error) {
	task := TaskDB{
		UserID:           userID,
		ParentSubGroupID: parentSubGroupID,
		ParentTaskID:     parentTaskID,
		Title:            title,
		Note:             note,
		Index:            index,
		Deleted:          false,
		Done:             false,
		CreatedAt:        time.Now(),
		UpdatedAt:        time.Now(),
	}
	result := db.Create(&task)
	return task.TaskID, result.Error
}

func UpdateTask(db *gorm.DB, task *TaskDB) error {
	task.UpdatedAt = time.Now()
	return db.Save(task).Error
}

func GetTaskByID(db *gorm.DB, taskID uint32) (*TaskDB, error) {
	var task TaskDB
	result := db.Where("task_id = ?", taskID).First(&task)
	return &task, result.Error
}

func GetTasksByParentSubGroupID(db *gorm.DB, parentSubGroupID uint32, limit int, offset int, justNoDone bool) []TaskDB {
	var tasks []TaskDB
	if justNoDone {
		db.Where("parent_sub_group_id = ? and done = ? and deleted = ?", parentSubGroupID, false, false).Limit(limit).Offset(offset).Find(&tasks)
	} else {
		db.Where("parent_sub_group_id = ? and deleted = ?", parentSubGroupID, false).Limit(limit).Offset(offset).Find(&tasks)
	}
	return tasks
}

func GetTasksByParentTaskID(db *gorm.DB, parentTaskID uint32, limit int, offset int, done bool) []TaskDB {
	var tasks []TaskDB
	db.Where("parent_task_id = ? and done = ? and deleted = ?", parentTaskID, done, false).Limit(limit).Offset(offset).Find(&tasks)
	return tasks
}

func GetSubTaskMaxIndex(db *gorm.DB, parentTaskID uint32) float32 {
	// 如果没有子任务，返回0
	var maxIndex float32
	db.Model(&TaskDB{}).Where("parent_task_id = ?", parentTaskID).Select("max(index)").Row().Scan(&maxIndex)
	return maxIndex
}

func GetParentSubGroupMaxIndex(db *gorm.DB, parentSubGroupID uint32) float32 {
	var maxIndex float32
	db.Model(&TaskDB{}).Where("parent_sub_group_id = ?", parentSubGroupID).Select("max(index)").Row().Scan(&maxIndex)
	return maxIndex
}
