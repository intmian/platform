package db

import (
	"fmt"
	"time"

	"gorm.io/gorm"
)

// GroupFavoriteDB 收藏的分组或子分组（SubGroupID 为 0 表示整个分组）。单独一张表而不是给 groups 加列：
// 老行的新列会是 NULL，D1 适配器又不能声明默认值。取消收藏直接删行。
type GroupFavoriteDB struct {
	ID         string `gorm:"primaryKey"` // userID:groupID 或 userID:groupID:subGroupID
	UserID     string `gorm:"not null;index"`
	GroupID    uint32 `gorm:"not null"`
	SubGroupID uint32 `gorm:"not null"`
	CreatedAt  time.Time
}

func (GroupFavoriteDB) TableName() string { return "group_favorites" }

func groupFavoriteID(userID string, groupID, subGroupID uint32) string {
	if subGroupID == 0 {
		return fmt.Sprintf("%s:%d", userID, groupID)
	}
	return fmt.Sprintf("%s:%d:%d", userID, groupID, subGroupID)
}

func GetGroupFavorites(conn *gorm.DB, userID string) ([]GroupFavoriteDB, error) {
	res := make([]GroupFavoriteDB, 0)
	err := conn.Where("user_id = ?", userID).Order("created_at").Find(&res).Error
	return res, err
}

func SetGroupFavorite(conn *gorm.DB, userID string, groupID, subGroupID uint32, favorite bool) error {
	id := groupFavoriteID(userID, groupID, subGroupID)
	if !favorite {
		return conn.Where("id = ? AND user_id = ?", id, userID).Delete(&GroupFavoriteDB{}).Error
	}
	var count int64
	if err := conn.Model(&GroupFavoriteDB{}).Where("id = ?", id).Count(&count).Error; err != nil {
		return err
	}
	if count > 0 {
		return nil
	}
	return conn.Create(&GroupFavoriteDB{ID: id, UserID: userID, GroupID: groupID, SubGroupID: subGroupID, CreatedAt: time.Now()}).Error
}

// chunks 把 ID 切成不超过 MaxInSize 的批次，D1 的 IN 列表有上限。
func chunks(ids []uint32) [][]uint32 {
	out := make([][]uint32, 0, len(ids)/MaxInSize+1)
	for start := 0; start < len(ids); start += MaxInSize {
		out = append(out, ids[start:min(start+MaxInSize, len(ids))])
	}
	return out
}

func GetSubGroupsByGroupIDs(conn *gorm.DB, groupIDs []uint32) ([]SubGroupDB, error) {
	res := make([]SubGroupDB, 0)
	for _, part := range chunks(groupIDs) {
		var found []SubGroupDB
		if err := conn.Where("parent_group_id IN ?", part).Find(&found).Error; err != nil {
			return nil, err
		}
		res = append(res, found...)
	}
	return res, nil
}

// overviewTaskColumns 总视图不需要 Note（娱乐库的大 JSON 也在这一列），只取列表要用的字段。
const overviewTaskColumns = "user_id, task_id, title, parent_sub_group_id, parent_task_id, deleted, done, task_type, started, time_begin_time, time_end_time, wait4"

func GetUnfinishedTasksBySubGroupIDs(conn *gorm.DB, userID string, subGroupIDs []uint32) ([]TaskDB, error) {
	res := make([]TaskDB, 0)
	for _, part := range chunks(subGroupIDs) {
		var found []TaskDB
		err := conn.Select(overviewTaskColumns).
			Where("parent_sub_group_id IN ? AND user_id = ? AND done = ? AND deleted = ?", part, userID, false, false).
			Find(&found).Error
		if err != nil {
			return nil, err
		}
		res = append(res, found...)
	}
	return res, nil
}

func GetTagsByUser(conn *gorm.DB, userID string) ([]TagsDB, error) {
	res := make([]TagsDB, 0)
	err := conn.Where("user_id = ?", userID).Find(&res).Error
	return res, err
}

func GetRoutineNodesByUser(conn *gorm.DB, userID string) ([]RoutineNodeDB, error) {
	res := make([]RoutineNodeDB, 0)
	err := conn.Where("user_id = ?", userID).Find(&res).Error
	return res, err
}
