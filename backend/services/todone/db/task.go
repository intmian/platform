package db

import (
	"gorm.io/gorm"
	"time"
)

type TaskType int

const (
	TaskTypeTodo  TaskType = iota // 普通的可完成任务
	TaskTypeDoing                 // 连续的任务
)

type TaskDB struct {
	UserID           string `gorm:"index"`
	TaskID           uint32 `gorm:"primaryKey"`
	Title            string
	Note             string
	ParentSubGroupID uint32 `gorm:"index"`
	ParentTaskID     uint32
	Deleted          bool
	Done             bool
	CreatedAt        time.Time `gorm:"column:time_created_at"`
	UpdatedAt        time.Time `gorm:"column:time_updated_at"`

	// 额外信息
	TaskType TaskType
	Started  bool // 是否开始
	// 开始时间
	BeginTime time.Time `gorm:"column:time_begin_time"`
	// 结束时间或者截止时间
	EndTime time.Time `gorm:"column:time_end_time"`
	Wait4   string
}

func CreateTask(db *gorm.DB, userID string, parentSubGroupID, parentTaskID uint32, title, note string, started bool) (*TaskDB, error) {
	task := TaskDB{
		UserID:           userID,
		ParentSubGroupID: parentSubGroupID,
		ParentTaskID:     parentTaskID,
		Title:            title,
		Note:             note,
		Deleted:          false,
		Done:             false,
		Started:          started,
		CreatedAt:        time.Now(),
		UpdatedAt:        time.Now(),
	}
	result := db.Create(&task)
	return &task, result.Error
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

func GetTaskByIds(db *gorm.DB, taskIDs []uint32) ([]TaskDB, error) {
	var tasks []TaskDB
	tasks = make([]TaskDB, 0)
	result := db.Where("task_id in (?)", taskIDs).Find(&tasks)
	return tasks, result.Error
}

func GetTasksByParentSubGroupID(db *gorm.DB, parentSubGroupID uint32, limit int, offset int, containDone bool) []TaskDB {
	var tasks []TaskDB
	tasks = make([]TaskDB, 0)
	whereDB := &TaskDB{
		ParentSubGroupID: parentSubGroupID,
		Deleted:          false,
	}
	if containDone {
		whereDB.Done = false
	}

	if !containDone {
		if limit > 0 {
			db.Where("parent_sub_group_id = ? and done = ? and deleted = ?", parentSubGroupID, false, false).Limit(limit).Offset(offset).Find(&tasks)
		} else {
			db.Where("parent_sub_group_id = ? and done = ? and deleted = ?", parentSubGroupID, false, false).Find(&tasks)
		}
	} else {
		if limit > 0 {
			db.Where("parent_sub_group_id = ? and deleted = ?", parentSubGroupID, false).Limit(limit).Offset(offset).Find(&tasks)
		} else {
			db.Where("parent_sub_group_id = ? and deleted = ?", parentSubGroupID, false).Find(&tasks)
		}
	}
	return tasks
}

func GetTasksByParentTaskID(db *gorm.DB, parentTaskID uint32) []TaskDB {
	var tasks []TaskDB
	tasks = make([]TaskDB, 0)
	db.Where("parent_task_id = ? and deleted = ?", parentTaskID, false).Order("`Index` DESC").Find(&tasks)
	return tasks
}

func GetHasSubTask(db *gorm.DB, taskID uint32) bool {
	var count int64
	db.Model(&TaskDB{}).Where("parent_task_id = ? and deleted = ?", taskID, false).Count(&count)
	return count > 0
}

func GetSubTaskByParentTaskIDMultiple(db *gorm.DB, parentTaskID []uint32) map[uint32][]TaskDB {
	var tasks []TaskDB
	tasks = make([]TaskDB, 0)
	db.Where("parent_task_id in (?) and deleted = ?", parentTaskID, false).Find(&tasks)
	res := make(map[uint32][]TaskDB)
	for _, task := range tasks {
		res[task.ParentTaskID] = append(res[task.ParentTaskID], task)
	}
	return res
}

func GetHasSubTaskByParentTaskIDMultiple(db *gorm.DB, parentTaskID []uint32) map[uint32]bool {
	var tasks []TaskDB
	tasks = make([]TaskDB, 0)
	db.Where("parent_task_id in (?) and deleted = ?", parentTaskID, false).Find(&tasks)
	res := make(map[uint32]bool)
	for _, ID := range parentTaskID {
		res[ID] = false
	}
	for _, task := range tasks {
		res[task.ParentTaskID] = true
	}
	return res
}

func GetSubTaskMaxIndex(db *gorm.DB, parentTaskID uint32) float32 {
	// 如果没有子任务，返回0
	var maxIndex float32
	db.Model(&TaskDB{}).Where("parent_task_id = ?", parentTaskID).Select("max(`index`)").Row().Scan(&maxIndex)
	return maxIndex
}

func GetParentSubGroupMaxIndex(db *gorm.DB, parentSubGroupID uint32) float32 {
	var maxIndex float32
	err := db.Model(&TaskDB{}).Where("parent_sub_group_id = ?", parentSubGroupID).Select("max(`index`)").Row().Scan(&maxIndex)
	if err != nil {
		println("GetParentSubGroupMaxIndex error:", err.Error())
	}
	return maxIndex
}

func UpdateTasksParentTaskID(db *gorm.DB, parentTaskID uint32, taskIDs []uint32) error {
	return db.Model(&TaskDB{}).Where("task_id in (?)", taskIDs).Update("parent_task_id", parentTaskID).Error
}

func UpdateTasksSubGroupID(db *gorm.DB, subGroupID uint32, taskIDs []uint32) error {
	return db.Model(&TaskDB{}).Where("task_id in (?)", taskIDs).Update("parent_sub_group_id", subGroupID).Error
}
