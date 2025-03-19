package logic

import (
	"errors"
	"github.com/intmian/platform/backend/services/todone/db"
	"github.com/intmian/platform/backend/services/todone/protocol"
	"math"
)

type GroupLogic struct {
	dbData    *db.GroupDB
	subGroups []*SubGroupLogic
}

func NewGroupLogic(ID uint32) *GroupLogic {
	return &GroupLogic{
		dbData: &db.GroupDB{
			ID: ID,
		},
	}
}

func (g *GroupLogic) OnBindOutData(dbData *db.GroupDB) {
	g.dbData = dbData
}

func (g *GroupLogic) GetGroupData() (*db.GroupDB, error) {
	if g.dbData != nil {
		return g.dbData, nil
	}

	connect := db.GTodoneDBMgr.GetConnect(db.ConnectTypeGroup)
	groupDB, err := db.GetGroup(connect, g.dbData.ID)
	if err != nil || groupDB == nil {
		return nil, err
	}
	g.dbData = groupDB
	return groupDB, nil
}

func (g *GroupLogic) GetSubGroups() ([]*SubGroupLogic, error) {
	if g.subGroups != nil {
		return g.subGroups, nil
	}

	// 没有缓存，从数据库中获取，并缓存
	connect := db.GTodoneDBMgr.GetConnect(db.ConnectTypeSubGroup)
	subGroupsDB := db.GetSubGroupByParentSortByIndex(connect, g.dbData.ID)
	for _, subGroupDB := range subGroupsDB {
		newSubGroupDB := subGroupDB
		g.subGroups = append(g.subGroups, NewSubGroupLogic(newSubGroupDB))
	}

	return g.subGroups, nil
}

func (g *GroupLogic) GetSubGroupLogic(subGroupID uint32) *SubGroupLogic {
	for _, subGroup := range g.subGroups {
		if subGroup.dbData.ID == subGroupID {
			return subGroup
		}
	}
	return nil
}

func (g *GroupLogic) GeneSubGroupIndex() float32 {
	connect := db.GTodoneDBMgr.GetConnect(db.ConnectTypeSubGroup)
	maxIndex := db.GetParentGroupIDMaxIndex(connect, g.dbData.ID)
	if math.Floor(float64(maxIndex)) == float64(maxIndex) {
		return maxIndex + 1
	} else {
		return float32(math.Ceil(float64(maxIndex))) + 1
	}
}

func (g *GroupLogic) CreateSubGroupLogic(title, note string) (*SubGroupLogic, error) {
	connect := db.GTodoneDBMgr.GetConnect(db.ConnectTypeSubGroup)
	index := g.GeneSubGroupIndex()
	id, err := db.CreateSubGroup(connect, g.dbData.ID, title, note, index)
	if err != nil {
		return nil, err
	}
	dbData := &db.SubGroupDB{
		ID:            id,
		ParentGroupID: g.dbData.ID,
		Title:         title,
		Note:          note,
		Index:         index,
	}
	subGroupLogic := NewSubGroupLogic(dbData)
	g.subGroups = append(g.subGroups, subGroupLogic)
	return subGroupLogic, nil
}

func (g *GroupLogic) ToProtocol() protocol.PGroup {
	return protocol.PGroup{
		ID:    g.dbData.ID,
		Title: g.dbData.Title,
		Note:  g.dbData.Note,
		Index: g.dbData.Index,
	}
}

func (g *GroupLogic) ChangeData(title, note string, index float32) error {
	if title != "" {
		g.dbData.Title = title
	}
	if note != "" {
		g.dbData.Note = note
	}
	if index != 0 {
		g.dbData.Index = index
	}
	err := g.Save()
	if err != nil {
		return err
	}
	return nil
}

func (g *GroupLogic) Save() error {
	connect := db.GTodoneDBMgr.GetConnect(db.ConnectTypeGroup)
	return db.ChangeGroup(connect, g.dbData)
}

func (g *GroupLogic) Delete() error {
	connect := db.GTodoneDBMgr.GetConnect(db.ConnectTypeGroup)
	return db.DeleteGroup(connect, g.dbData.ID)
}

func (g *GroupLogic) DeleteSubGroup(subGroupID uint32) error {
	subGroup := g.GetSubGroupLogic(subGroupID)
	if subGroup == nil {
		return errors.New("sub group not exist")
	}
	err := subGroup.Delete()
	if err != nil {
		return errors.Join(err, errors.New("delete sub group failed"))
	}
	// 从内存中删除
	for i, subGroup := range g.subGroups {
		if subGroup.dbData.ID == subGroupID {
			g.subGroups = append(g.subGroups[:i], g.subGroups[i+1:]...)
			break
		}
	}
	return nil
}
