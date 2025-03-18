package logic

import (
	"github.com/intmian/platform/backend/services/todone/db"
	"github.com/intmian/platform/backend/services/todone/protocol"
	"math"
	"time"
)

type SubGroupLogic struct {
	dbData *db.SubGroupDB
}

func (s *SubGroupLogic) GetID() uint32 {
	return s.dbData.ID
}

func (s *SubGroupLogic) ToProtocol() protocol.PSubGroup {
	return protocol.PSubGroup{
		ID:    s.dbData.ID,
		Title: s.dbData.Title,
		Note:  s.dbData.Note,
		Index: s.dbData.Index,
	}
}

func (s *SubGroupLogic) GetTasksByPage(page int, num int, containDone bool) ([]*TaskLogic, error) {
	connect := db.GTodoneDBMgr.GetConnect(db.ConnectTypeTask)
	tasksDB := db.GetTasksByParentSubGroupID(connect, s.dbData.ID, page, num, containDone)

	var res []*TaskLogic
	for _, taskDB := range tasksDB {
		task := NewTaskLogic(taskDB.TaskID)
		task.OnBindOutData(&taskDB)
	}
	return res, nil
}

func (s *SubGroupLogic) GeneTaskIndex() float32 {
	connect := db.GTodoneDBMgr.GetConnect(db.ConnectTypeTask)
	maxIndex := db.GetParentSubGroupMaxIndex(connect, s.dbData.ID)
	if math.Floor(float64(maxIndex)) == float64(maxIndex) {
		return maxIndex + 1
	} else {
		return float32(math.Ceil(float64(maxIndex))) + 1
	}
}

func (s *SubGroupLogic) CreateTask(userID string, title, note string) (*TaskLogic, error) {
	nextIndex := s.GeneTaskIndex()
	connect := db.GTodoneDBMgr.GetConnect(db.ConnectTypeTask)
	ID, err := db.CreateTask(connect, userID, s.dbData.ID, 0, title, note, nextIndex)
	if err != nil {
		return nil, err
	}
	task := NewTaskLogic(ID)
	task.OnBindOutData(&db.TaskDB{
		TaskID:           ID,
		ParentSubGroupID: s.dbData.ID,
		Title:            title,
		Note:             note,
		Index:            nextIndex,
		Deleted:          false,
		Done:             false,
		CreatedAt:        time.Now(),
		UpdatedAt:        time.Now(),
	})
	return task, nil
}
