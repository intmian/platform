package platform

import (
	"encoding/json"
	"fmt"
	"github.com/gin-gonic/gin"
	"github.com/intmian/mian_go_lib/tool/token"
	share3 "github.com/intmian/platform/backend/services/account/share"
	"github.com/intmian/platform/backend/share"
	"time"
)

// login 进行登录。需要去账号服务验证账号密码，然后在web mgr签名才行
func (m *webMgr) login(c *gin.Context) {
	// 从body中获得密码
	body := struct {
		Username string `json:"username"`
		Password string `json:"password"`
	}{}
	err := c.BindJSON(&body)
	if err != nil {
		c.JSON(200, gin.H{
			"code": 1,
			"msg":  err.Error(),
		})
		return

	}
	ret, err := m.plat.core.sendAndRec(share.FlagAccount, share.MakeMsg(share3.CmdCheckToken, share3.CheckTokenReq{
		Account: body.Username,
		Pwd:     body.Password,
	}), share.MakeSysValid())
	if ret == nil {
		c.JSON(200, gin.H{
			"code": 1,
			"msg":  "Password error",
		})
		return
	}
	retr := ret.(share3.CheckTokenRet)
	if err != nil || retr.Pers == nil {
		c.JSON(200, gin.H{
			"code": 1,
			"msg":  "Password error",
		})
		return
	}
	var permission []string
	for _, v := range retr.Pers {
		permission = append(permission, string(v))
	}

	// 打印登录日志，如果是admin，还需要推送
	loginInfo := "login usr[%s] permission%v time[%s] ip[%s]"
	loginInfo = fmt.Sprintf(loginInfo, body.Username, permission, time.Now().Format("2006-01-02 15:04:05"), c.ClientIP())
	m.plat.log.Info("PLAT", loginInfo)
	isAdmin := false
	for _, v := range retr.Pers {
		if v == share.PermissionAdmin {
			isAdmin = true
			break
		}
	}
	if isAdmin {
		err = m.plat.push.Push("账号安全", loginInfo, false)
		if err != nil {
			m.plat.log.Warning("PLAT", "push error [%s]", err.Error())
		}
	}

	// 生成token
	data := token.Data{
		User:       body.Username,
		Permission: permission,
		ValidTime:  int64(time.Hour*24*7/time.Second) + time.Now().Unix(),
	}

	t := m.jwt.GenToken(body.Username, data.Permission, data.ValidTime)
	data.Token = t
	// 保存token
	tokenS, _ := json.Marshal(data)
	c.SetCookie("token", string(tokenS), 60*60*24*7, "/", "", false, true)
	c.JSON(200, gin.H{
		"code": 0,
		"data": struct {
			User       string
			Permission []share.Permission
			ValidTime  int64
		}{
			User:       data.User,
			Permission: retr.Pers,
			ValidTime:  data.ValidTime,
		},
	})
}

func (m *webMgr) logout(c *gin.Context) {
	c.SetCookie("token", "", -1, "/", "", false, true)
}

func (m *webMgr) getValid(c *gin.Context) share.Valid {
	tokenS, err := c.Cookie("token")
	if err != nil {
		return share.Valid{}
	}
	var data token.Data
	err = json.Unmarshal([]byte(tokenS), &data)
	if err != nil {
		return share.Valid{}
	}
	var r share.Valid
	r.User = data.User
	for _, v := range data.Permission {
		if m.CheckSignature(&data, v) {
			r.Permissions = append(r.Permissions, share.Permission(v))
		}
	}
	r.ValidTime = data.ValidTime
	return r
}

func (m *webMgr) check(c *gin.Context) {
	// 从cookie中获得token
	tokenS, err := c.Cookie("token")
	if err != nil {
		c.JSON(200, gin.H{
			"code": 1,
			"msg":  "token not exist",
		})
		c.Abort()
		return
	}
	// 解析token
	var data token.Data
	err = json.Unmarshal([]byte(tokenS), &data)
	if err != nil {
		c.JSON(200, gin.H{
			"code": 1,
			"msg":  "token invalid",
		})
		c.Abort()
		return
	}

	var r share.Valid
	r.User = data.User
	for _, v := range data.Permission {
		if m.CheckSignature(&data, v) {
			r.Permissions = append(r.Permissions, share.Permission(v))
		}
	}
	r.ValidTime = data.ValidTime
	c.JSON(200, gin.H{
		"code": 0,
		"msg":  "ok",
		"data": struct {
			User       string
			Permission []share.Permission
			ValidTime  int64
		}{
			User:       r.User,
			Permission: r.Permissions,
			ValidTime:  r.ValidTime,
		},
	})
}

func (m *webMgr) checkAdmin(c *gin.Context) {
	// 从cookie中获得token
	tokenS, err := c.Cookie("token")
	if err != nil {
		c.JSON(200, gin.H{
			"code": 1,
			"msg":  "token not exist",
		})
		c.Abort()
		return
	}
	// 解析token
	var data token.Data
	err = json.Unmarshal([]byte(tokenS), &data)
	if err != nil {
		c.JSON(200, gin.H{
			"code": 1,
			"msg":  "token invalid",
		})
		c.Abort()
		return
	}
	if !m.CheckSignature(&data, "admin") {
		c.JSON(200, gin.H{
			"code": 1,
			"msg":  "token invalid",
		})
		c.Abort()
		return
	}
}

func (m *webMgr) getServices(c *gin.Context) {
	info := m.plat.core.getWebInfo()
	c.JSON(200, info)
}

func (m *webMgr) startService(c *gin.Context) {
	name := c.Param("name")
	flag := m.plat.getFlag(share.SvrName(name))
	if flag == share.FlagNone {
		c.JSON(200, gin.H{
			"code": 1,
			"msg":  "service not exist",
		})
		return
	}
	err := m.plat.core.startService(flag)
	if err != nil {
		c.JSON(200, gin.H{
			"code": 1,
			"msg":  err.Error(),
		})
		return
	}
	c.JSON(200, gin.H{
		"code": 0,
		"msg":  "ok",
	})
}

func (m *webMgr) stopService(c *gin.Context) {
	name := c.Param("name")
	flag := m.plat.getFlag(share.SvrName(name))
	if flag == share.FlagNone {
		c.JSON(200, gin.H{
			"code": 1,
			"msg":  "service not exist",
		})
		return
	}
	err := m.plat.core.stopService(flag)
	if err != nil {
		c.JSON(200, gin.H{
			"code": 1,
			"msg":  err.Error(),
		})
		return
	}
	c.JSON(200, gin.H{
		"code": 0,
		"msg":  "ok",
	})
}

func (m *webMgr) getLastLog(c *gin.Context) {
	logs, err := m.plat.news.GetTopic("PLAT")
	// 翻转
	for i, j := 0, len(logs)-1; i < j; i, j = i+1, j-1 {
		logs[i], logs[j] = logs[j], logs[i]
	}
	if err != nil {
		c.JSON(200, gin.H{
			"code": 1,
			"msg":  err.Error(),
		})
		return
	}
	c.JSON(200, logs)
}
