package db

import (
	"fmt"
	"time"

	"gorm.io/gorm"
)

// RoutineNodeKind 例行清单配置挂载的层级。
type RoutineNodeKind uint8

const (
	RoutineNodeGroup RoutineNodeKind = iota
	RoutineNodeSubGroup
	RoutineNodeTask
)

// RoutineNodeDB 例行清单的节点配置与当前状态。
// 只保存当前状态，不保留历史：Mark 为当前完成标记，PrevMark 仅用于撤销最近一次勾选。
type RoutineNodeDB struct {
	ID        string `gorm:"primaryKey"` // kind:nodeID
	UserID    string `gorm:"not null;index:idx_routine_nodes_group,priority:1"`
	GroupID   uint32 `gorm:"not null;index:idx_routine_nodes_group,priority:2"`
	Kind      RoutineNodeKind
	NodeID    uint32
	Folder    bool   // 分组节点：只用于组织子项，自身不参与勾选
	Optional  bool   // 可选项（默认必选）
	Temp      bool   // 仅本轮的临时项
	Rule      string // 周期规则 JSON，空表示继承上级
	Mark      string // 当前完成标记，语义由前端按生效规则解释
	PrevMark  string
	UpdatedAt time.Time
}

func (RoutineNodeDB) TableName() string { return "routine_nodes" }

func RoutineNodeID(kind RoutineNodeKind, nodeID uint32) string {
	return fmt.Sprintf("%d:%d", kind, nodeID)
}

func GetRoutineNodes(conn *gorm.DB, userID string, groupID uint32) ([]RoutineNodeDB, error) {
	nodes := make([]RoutineNodeDB, 0)
	err := conn.Where("user_id = ? AND group_id = ?", userID, groupID).Find(&nodes).Error
	return nodes, err
}

// SaveRoutineNodes 批量写入节点（存在则整行更新，不存在则创建）。
func SaveRoutineNodes(conn *gorm.DB, nodes []RoutineNodeDB) error {
	if len(nodes) == 0 {
		return nil
	}
	ids := make([]string, 0, len(nodes))
	for i := range nodes {
		nodes[i].ID = RoutineNodeID(nodes[i].Kind, nodes[i].NodeID)
		nodes[i].UpdatedAt = time.Now()
		ids = append(ids, nodes[i].ID)
	}
	existing := make(map[string]bool)
	for start := 0; start < len(ids); start += MaxInSize {
		end := min(start+MaxInSize, len(ids))
		var found []string
		if err := conn.Model(&RoutineNodeDB{}).Where("id IN ?", ids[start:end]).Pluck("id", &found).Error; err != nil {
			return err
		}
		for _, id := range found {
			existing[id] = true
		}
	}
	for _, node := range nodes {
		if existing[node.ID] {
			err := conn.Model(&RoutineNodeDB{}).Where("id = ? AND user_id = ?", node.ID, node.UserID).Updates(map[string]any{
				"folder":     node.Folder,
				"optional":   node.Optional,
				"temp":       node.Temp,
				"rule":       node.Rule,
				"mark":       node.Mark,
				"prev_mark":  node.PrevMark,
				"updated_at": node.UpdatedAt,
			}).Error
			if err != nil {
				return err
			}
			continue
		}
		n := node
		if err := conn.Create(&n).Error; err != nil {
			return err
		}
	}
	return nil
}

func DeleteRoutineNodes(conn *gorm.DB, userID string, kind RoutineNodeKind, nodeIDs []uint32) error {
	if len(nodeIDs) == 0 {
		return nil
	}
	ids := make([]string, 0, len(nodeIDs))
	for _, id := range nodeIDs {
		ids = append(ids, RoutineNodeID(kind, id))
	}
	for start := 0; start < len(ids); start += MaxInSize {
		end := min(start+MaxInSize, len(ids))
		if err := conn.Where("user_id = ? AND id IN ?", userID, ids[start:end]).Delete(&RoutineNodeDB{}).Error; err != nil {
			return err
		}
	}
	return nil
}
