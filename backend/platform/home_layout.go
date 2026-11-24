package platform

import (
	"bytes"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/intmian/mian_go_lib/xstorage"
)

// 桌面布局：每个用户一份，内容由前端定义，后端只按原始 JSON 存取，用版本号做乐观锁。

const (
	homeLayoutMaxBytes     = 256 * 1024
	homeLayoutCodeConflict = 2
	homeLayoutConflictMsg  = "version conflict"
	homeLayoutBodyMaxBytes = homeLayoutMaxBytes + 4*1024
)

type homeLayoutRecord struct {
	Version   int
	UpdatedAt int64 // unix ms
	Layout    json.RawMessage
}

type homeLayoutSetReq struct {
	Version int
	Layout  json.RawMessage
}

func homeLayoutKey(user string) string {
	return xstorage.Join("misc", "home", "layout", user)
}

func (m *webMgr) loadHomeLayoutLocked(user string) (homeLayoutRecord, error) {
	var rec homeLayoutRecord
	err := m.plat.storage.GetFromJson(homeLayoutKey(user), &rec)
	if err != nil {
		if errors.Is(err, xstorage.ErrNoData) {
			return homeLayoutRecord{}, nil
		}
		return homeLayoutRecord{}, err
	}
	return rec, nil
}

func (m *webMgr) homeLayoutGet(c *gin.Context) {
	valid := m.getValid(c)
	if valid.User == "" {
		ErrReturn(c, "no permission")
		return
	}
	m.homeLayoutMu.Lock()
	rec, err := m.loadHomeLayoutLocked(valid.User)
	m.homeLayoutMu.Unlock()
	if err != nil {
		ErrReturn(c, "inner error")
		return
	}
	OkReturn(c, rec)
}

func (m *webMgr) homeLayoutSet(c *gin.Context) {
	valid := m.getValid(c)
	if valid.User == "" {
		ErrReturn(c, "no permission")
		return
	}
	body, err := io.ReadAll(http.MaxBytesReader(c.Writer, c.Request.Body, homeLayoutBodyMaxBytes))
	if err != nil {
		ErrReturn(c, "layout too large")
		return
	}
	var req homeLayoutSetReq
	if err = json.Unmarshal(body, &req); err != nil {
		ErrReturn(c, "illegal param")
		return
	}
	if len(req.Layout) > homeLayoutMaxBytes {
		ErrReturn(c, "layout too large")
		return
	}
	// 没传 Layout 按 null 存；Unmarshal 已经保证 RawMessage 是合法 JSON
	if len(req.Layout) == 0 {
		req.Layout = json.RawMessage("null")
	} else {
		// 压掉空白，存储里不留无意义的缩进
		var buf bytes.Buffer
		if err = json.Compact(&buf, req.Layout); err != nil {
			ErrReturn(c, "illegal param")
			return
		}
		req.Layout = buf.Bytes()
	}

	m.homeLayoutMu.Lock()
	defer m.homeLayoutMu.Unlock()
	cur, err := m.loadHomeLayoutLocked(valid.User)
	if err != nil {
		ErrReturn(c, "inner error")
		return
	}
	if req.Version != cur.Version {
		c.JSON(200, uniReturn{Code: homeLayoutCodeConflict, Msg: homeLayoutConflictMsg, Data: cur})
		return
	}
	next := homeLayoutRecord{
		Version:   cur.Version + 1,
		UpdatedAt: time.Now().UnixMilli(),
		Layout:    req.Layout,
	}
	if err = m.plat.storage.SetToJson(homeLayoutKey(valid.User), next); err != nil {
		ErrReturn(c, "inner error")
		return
	}
	OkReturn(c, next)
}
