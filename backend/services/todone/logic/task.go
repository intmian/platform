package logic

import (
	"errors"
	"github.com/intmian/platform/backend/services/todone/db"
	"github.com/intmian/platform/backend/services/todone/protocol"
	"math"
	"time"
)

/*
因为task一般都以筛选条件进行查询，子任务也是一级级展开的，所以不需要mgr进行缓存，子任务也不保存在父任务的逻辑中，因为存在加载的问题
因为懒加载所以需要注意下加载问题
*/

type TaskLogic struct {
	dbData      *db.TaskDB
	hasChildren *bool
	children    []*TaskLogic
	tagsDB      []string

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

func (t *TaskLogic) BindOutTags(tags []string) {
	t.tagsDB = tags
}

func (t *TaskLogic) BindOutChildren(children []*TaskLogic) {
	t.children = children
}

func (t *TaskLogic) BindOutHasChildren(hasChildren bool) {
	t.hasChildren = &hasChildren
}

func (t *TaskLogic) GetTaskData() (*db.TaskDB, error) {
	if t.dbData != nil {
		return t.dbData, nil
	}

	// 从数据库中获取数据
	connect := db.GTodoneDBMgr.GetConnect(db.ConnectTypeTask)
	taskDB, err := db.GetTaskByID(connect, t.id)
	if err != nil || taskDB == nil {
		return nil, errors.Join(err, ErrGetTaskDataFailed)
	}
	t.dbData = taskDB
	return taskDB, nil
}

func (t *TaskLogic) GetTags() ([]string, error) {
	if t.tagsDB != nil {
		return t.tagsDB, nil
	}

	// 从数据库中获取数据
	connect := db.GTodoneDBMgr.GetConnect(db.ConnectTypeTags)
	tagsDB := db.GetTagsByTaskID(connect, t.id)
	t.tagsDB = tagsDB
	return tagsDB, nil
}

func (t *TaskLogic) GetChildren() ([]*TaskLogic, error) {
	if t.children != nil {
		return t.children, nil
	}

	res := t.LoadChildren()
	return res, nil
}

func (t *TaskLogic) LoadChildren() []*TaskLogic {
	connect := db.GTodoneDBMgr.GetConnect(db.ConnectTypeTask)
	tasksDB := db.GetTasksByParentTaskID(connect, t.id)
	var res []*TaskLogic
	for _, taskDB := range tasksDB {
		newDB := taskDB
		task := NewTaskLogic(newDB.TaskID)
		task.OnBindOutData(&newDB)
		res = append(res, task)
	}
	t.children = res
	return res
}

func (t *TaskLogic) AddTag(tag string) error {
	tags, err := t.GetTags()
	if err != nil {
		return errors.Join(err, ErrGetTagsFailed)
	}
	for _, t := range tags {
		if t == tag {
			return ErrTagAlreadyExists
		}
	}
	t.tagsDB = append(t.tagsDB, tag)
	tagsDB := db.GTodoneDBMgr.GetConnect(db.ConnectTypeTags)
	err = db.AddTags(tagsDB, t.dbData.UserID, t.id, tag)
	return nil
}

func (t *TaskLogic) RemoveTag(tag string) error {
	tags, err := t.GetTags()
	if err != nil {
		return errors.Join(err, ErrGetTagsFailed)
	}
	for i, tag2 := range tags {
		if tag2 == tag {
			t.tagsDB = append(tags[:i], tags[i+1:]...)
			break
		}
	}
	tagsDB := db.GTodoneDBMgr.GetConnect(db.ConnectTypeTags)
	err = db.DeleteTag(tagsDB, t.id, tag)
	return nil
}

func (t *TaskLogic) RemoveAllTags() error {
	tagsDB := db.GTodoneDBMgr.GetConnect(db.ConnectTypeTags)
	err := db.DeleteTagByTaskID(tagsDB, t.id)
	t.tagsDB = nil
	return err
}

func (t *TaskLogic) BindParentTask(parentID uint32) error {
	t.dbData.ParentTaskID = parentID
	connect := db.GTodoneDBMgr.GetConnect(db.ConnectTypeTask)
	return db.UpdateTask(connect, t.dbData)
}

func (t *TaskLogic) Delete() error {
	t.dbData.Deleted = true
	connect := db.GTodoneDBMgr.GetConnect(db.ConnectTypeTask)
	return db.UpdateTask(connect, t.dbData)
}

func (t *TaskLogic) ChangeDone(done bool) error {
	t.dbData.Done = done
	connect := db.GTodoneDBMgr.GetConnect(db.ConnectTypeTask)
	return db.UpdateTask(connect, t.dbData)
}

func (t *TaskLogic) GeneSubTaskIndex() float32 {
	connect := db.GTodoneDBMgr.GetConnect(db.ConnectTypeTask)
	maxIndex := db.GetSubTaskMaxIndex(connect, t.dbData.ParentTaskID)
	if math.Floor(float64(maxIndex)) == float64(maxIndex) {
		return maxIndex + 1
	} else {
		return float32(math.Ceil(float64(maxIndex))) + 1
	}
}

func (t *TaskLogic) HasSubTask() (bool, error) {
	if t.hasChildren != nil {
		return *t.hasChildren, nil
	}

	hasSubTask := t.LoadHasChildren()
	return hasSubTask, nil
}

func (t *TaskLogic) LoadHasChildren() bool {
	connect := db.GTodoneDBMgr.GetConnect(db.ConnectTypeTask)
	hasSubTask := db.GetHasSubTask(connect, t.id)
	t.hasChildren = &hasSubTask
	return hasSubTask
}

func (t *TaskLogic) ToProtocol() protocol.PTask {
	data, _ := t.GetTaskData()
	tags, _ := t.GetTags()
	hasSubTask, _ := t.HasSubTask()
	var pTask protocol.PTask
	if data == nil {
		return pTask
	}
	pTask.ID = data.TaskID
	pTask.Title = data.Title
	pTask.Note = data.Note
	pTask.Done = data.Done
	pTask.Index = data.Index
	pTask.Tags = tags
	pTask.HaveSubTask = hasSubTask

	pTask.TaskType = int(data.TaskType)
	pTask.Started = data.Started
	pTask.BeginTime = data.BeginTime
	pTask.EndTime = data.EndTime
	pTask.Wait4 = data.Wait4

	return pTask
}

func (t *TaskLogic) GetID() uint32 {
	return t.id
}

func (t *TaskLogic) ChangeFromProtocol(pTask protocol.PTask) error {
	data, err := t.GetTaskData()
	if err != nil {
		return errors.Join(err, ErrGetTaskDataFailed)
	}
	if pTask.Title != "" {
		data.Note = pTask.Title
	}
	if pTask.Note != "" {
		data.Note = pTask.Note
	}
	if pTask.Index != 0 {
		data.Index = pTask.Index
	}
	if pTask.Done != data.Done {
		data.Done = pTask.Done
	}
	connect := db.GTodoneDBMgr.GetConnect(db.ConnectTypeTask)
	return db.UpdateTask(connect, data)
}

func (t *TaskLogic) CreateSubTask(userID string, title, note string) (*TaskLogic, error) {
	nextIndex := t.GeneSubTaskIndex()
	connect := db.GTodoneDBMgr.GetConnect(db.ConnectTypeTask)
	ID, err := db.CreateTask(connect, userID, 0, t.id, title, note, nextIndex)
	if err != nil {
		return nil, err
	}
	task := NewTaskLogic(ID)
	task.OnBindOutData(&db.TaskDB{
		TaskID:       ID,
		ParentTaskID: t.id,
		Title:        title,
		Note:         note,
		Index:        nextIndex,
		Deleted:      false,
		Done:         false,
		CreatedAt:    time.Now(),
		UpdatedAt:    time.Now(),
	})
	return task, nil
}
