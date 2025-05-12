package logic

import "encoding/json"

type MapIdTree map[uint32][]uint32

func (m MapIdTree) Add(parentId uint32, id uint32) {
	if _, ok := m[parentId]; !ok {
		m[parentId] = make([]uint32, 0)
	}
	m[parentId] = append(m[parentId], id)
}

func (m MapIdTree) GetSequence(parent, id uint32) (bool, int) {
	if _, ok := m[parent]; !ok {
		return false, 0
	}
	for i, v := range m[parent] {
		if v == id {
			return true, i
		}
	}
	return false, 0
}

func (m MapIdTree) GetSequenceOrAdd(parent, id uint32) int {
	ok, seq := m.GetSequence(parent, id)
	if ok {
		return seq
	}
	m.Add(parent, id)
	return len(m[parent]) - 1
}

func (m MapIdTree) JSON() (string, error) {
	type mapIdTreeJson struct {
		Id  uint32   `json:"id"`
		Ids []uint32 `json:"ids"`
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
	if data == "" {
		return nil
	}
	type mapIdTreeJson struct {
		Id  uint32   `json:"id"`
		Ids []uint32 `json:"ids"`
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

func (m MapIdTree) Remove(parent, id uint32) {
	if _, ok := m[parent]; !ok {
		return
	}
	for i, v := range m[parent] {
		if v == id {
			m[parent] = append(m[parent][:i], m[parent][i+1:]...)
			break
		}
	}
}

// RemoveNotExist 删除parent下不存在的id，并且删除id的所有子孙节点
func (m MapIdTree) RemoveNotExist(parent uint32, ids []uint32) {
	if _, ok := m[parent]; !ok {
		return
	}
	newIds := make([]uint32, 0)
	for _, v := range m[parent] {
		find := false
		for _, id := range ids {
			if v == id {
				find = true
				break
			}
		}
		if find {
			newIds = append(newIds, v)
		} else {
			m.RemoveAsParent(v)
		}
	}
	m[parent] = newIds
}

func (m MapIdTree) RemoveAsParent(id uint32) {
	// 递归删除
	if _, ok := m[id]; !ok {
		return
	}
	for _, v := range m[id] {
		m.RemoveAsParent(v)
	}
	delete(m, id)
}
