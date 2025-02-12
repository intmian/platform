package logic

import (
	"github.com/intmian/platform/backend/services/todone/db"
	"github.com/intmian/platform/backend/services/todone/protocol"
	"math"
)

type GroupLogic struct {
	dbData    *db.GroupDB
	subGroups []*SubGroupLogic
}

type SubGroupLogic struct {
	dbData *db.SubGroupDB
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

	// 没有缓存，从数据库中获取
	connect := db.GTodoneDBMgr.GetConnect(db.ConnectionTypeSubGroup)
	subGroupsDB := db.GetSubGroupByParentSortByIndex(connect, g.dbData.ID)
	for _, subGroupDB := range subGroupsDB {
		g.subGroups = append(g.subGroups, &SubGroupLogic{
			dbData: &subGroupDB,
		})
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
	connect := db.GTodoneDBMgr.GetConnect(db.ConnectionTypeSubGroup)
	maxIndex := db.GetParentGroupIDMaxIndex(connect, g.dbData.ID)
	if math.Floor(float64(maxIndex)) == float64(maxIndex) {
		return maxIndex + 1
	} else {
		return float32(math.Ceil(float64(maxIndex))) + 1
	}
}

func (g *GroupLogic) CreateSubGroupLogic(title, note string) (*SubGroupLogic, error) {
	connect := db.GTodoneDBMgr.GetConnect(db.ConnectionTypeSubGroup)
	index := g.GeneSubGroupIndex()
	id, err := db.CreateSubGroup(connect, g.dbData.ID, title, note, index)
	if err != nil {
		return nil, err
	}
	subGroupLogic := &SubGroupLogic{
		dbData: &db.SubGroupDB{
			ID:            id,
			ParentGroupID: g.dbData.ID,
			Title:         title,
			Note:          note,
			Index:         index,
		},
	}
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
