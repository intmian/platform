package logic

import (
	"errors"
	"github.com/intmian/platform/backend/services/todone/db"
)

type TaskLogic struct {
	dbData *db.TaskDB
	tagsDB []string

	id uint32
}

func NewTaskLogic(ID uint32) *TaskLogic {
	return &TaskLogic{
		id: ID,
	}
}

// OnBindOutData 外部创造时绑定就行
func (t *TaskLogic) OnBindOutData(dbData *db.TaskDB) {
	t.dbData = dbData
}

func (t *TaskLogic) GetTaskData() (*db.TaskDB, error) {
	if t.dbData != nil {
		return t.dbData, nil
	}

	// 从数据库中获取数据
	connect := db.GTodoneDBMgr.GetConnect(db.ConnectTypeTask)
	taskDB, err := db.GetTaskByID(connect, t.id)
	if err != nil || taskDB == nil {
		return nil, errors.Join(err, errors.New("get task data failed"))
	}
	t.dbData = taskDB
	return taskDB, nil
}

func (t *TaskLogic) GetTags() ([]string, error) {
	if t.tagsDB != nil {
		return t.tagsDB, nil
	}

	// 从数据库中获取数据
	connect := db.GTodoneDBMgr.GetConnect(db.ConnectionTypeTags)
	tagsDB := db.GetTagsByTaskID(connect, t.id)
	t.tagsDB = tagsDB
	return tagsDB, nil
}

func (t *TaskLogic) GetChildIDs(limit int, offset int, done bool) ([]uint32, error) {
	connect := db.GTodoneDBMgr.GetConnect(db.ConnectTypeTask)
	tasksDB := db.GetTasksByParentTaskID(connect, t.id, limit, offset, done)
	var res []uint32
	for _, task := range tasksDB {
		res = append(res, task.TaskID)
	}
	return res, nil
}

func (t *TaskLogic) AddTag(tag string) error {
	tags, err := t.GetTags()
	if err != nil {
		return errors.Join(err, errors.New("get tags failed"))
	}
	for _, t := range tags {
		if t == tag {
			return errors.New("tag already exists")
		}
	}
	t.tagsDB = append(t.tagsDB, tag)
	tagsDB := db.GTodoneDBMgr.GetConnect(db.ConnectionTypeTags)
	err = db.AddTags(tagsDB, t.dbData.UserID, t.id, tag)
	return nil
}

func (t *TaskLogic) RemoveTag(tag string) error {
	tags, err := t.GetTags()
	if err != nil {
		return errors.Join(err, errors.New("get tags failed"))
	}
	for i, tag2 := range tags {
		if tag2 == tag {
			t.tagsDB = append(tags[:i], tags[i+1:]...)
			break
		}
	}
	tagsDB := db.GTodoneDBMgr.GetConnect(db.ConnectionTypeTags)
	err = db.DeleteTag(tagsDB, t.id, tag)
	return nil
}

func (t *TaskLogic) RemoveAllTags() error {
	tagsDB := db.GTodoneDBMgr.GetConnect(db.ConnectionTypeTags)
	err := db.DeleteTagByTaskID(tagsDB, t.id)
	t.tagsDB = nil
	return err
}
