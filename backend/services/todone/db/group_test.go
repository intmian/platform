package db

import (
	"encoding/json"
	"gorm.io/gorm"
	"math/rand"
	"testing"
)

func debugGetConnect(t *testing.T, conType ConnectType) *gorm.DB {
	setting := realWorkerTestSetting(t)
	mgr, err := NewMgr(setting)
	if err != nil {
		t.Fatal(err)
	}
	err = mgr.Connect(conType, &GroupDB{})
	if err != nil {
		t.Fatal(err)
	}
	return mgr.GetConnect(conType)
}

func TestGroupDB(t *testing.T) {
	conn := debugGetConnect(t, ConnectTypeGroup)

	group, err := CreateGroup(conn, "worker-test", "debug", "title", 0, GroupTypeNormal)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		_ = conn.Where("id = ?", group.ID).Delete(&GroupDB{}).Error
	})
	if group.ID == 0 {
		t.Fatal("ID should not be 0")
	}

	data, err := GetGroupsByUser(conn, "worker-test")
	if err != nil {
		t.Fatal(err)
	}
	if len(data) == 0 {
		t.Fatal("created group was not returned")
	}

}

type MapIdTree map[uint32][]uint32

func (m MapIdTree) Add(id uint32, parentId uint32) {
	if _, ok := m[parentId]; !ok {
		m[parentId] = make([]uint32, 0)
	}
	m[parentId] = append(m[parentId], id)
}

func (m MapIdTree) JSON() (string, error) {
	type mapIdTreeJson struct {
		Id   uint32   `json:"id"`
		Ids  []uint32 `json:"ids"`
		Tree []mapIdTreeJson
	}
	res := make([]mapIdTreeJson, 0)
	for k, v := range m {
		res = append(res, mapIdTreeJson{
			Id:  k,
			Ids: v,
		})
	}
	bs, err := json.Marshal(res)
	if err != nil {
		return "", err
	}
	return string(bs), nil
}

func (m MapIdTree) FromJSON(data string) error {
	type mapIdTreeJson struct {
		Id   uint32   `json:"id"`
		Ids  []uint32 `json:"ids"`
		Tree []mapIdTreeJson
	}
	var res []mapIdTreeJson
	err := json.Unmarshal([]byte(data), &res)
	if err != nil {
		return err
	}
	for _, v := range res {
		m[v.Id] = v.Ids
	}
	return nil
}

func TestTree(t *testing.T) {
	m := make(MapIdTree)

	for i := 1; i <= 100; i++ {
		parentId := uint32(rand.Intn(20))
		m.Add(uint32(i), parentId)
	}
	bs, err := json.Marshal(m)
	if err != nil {
		t.Fatal(err)
	}
	t.Logf("json字符串长度: %d", len(bs))
	t.Logf("json字符串: %s", string(bs))
}
