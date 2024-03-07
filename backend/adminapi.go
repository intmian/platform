package backend

import (
	"encoding/json"
	"github.com/gin-gonic/gin"
	"github.com/intmian/mian_go_lib/tool/token"
	"github.com/intmian/platform/backend/global"
	"github.com/intmian/platform/backend/share"
	"github.com/intmian/platform/backend/tool"
	share2 "github.com/intmian/platform/services/share"
	"time"
)

func login(c *gin.Context) {
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
	if body.Username != "admin" || body.Password != global.GBaseSetting.Copy().AdminPwd {
		c.JSON(200, gin.H{
			"code": 1,
			"msg":  "Password error",
		})
		return
	}
	// 生成token
	data := token.Data{
		User:       body.Username,
		Permission: []string{"admin"},
		ValidTime:  int64(time.Hour*24*7/time.Second) + time.Now().Unix(),
	}
	t := GWebMgr.Jwt.GenToken(body.Username, data.Permission, data.ValidTime)
	data.Token = t
	// 保存token
	tokenS, _ := json.Marshal(data)
	c.SetCookie("token", string(tokenS), 60*60*24*7, "/", "", false, true)
	c.JSON(200, gin.H{
		"code":     0,
		"username": body.Username,
	})
}

func logout(c *gin.Context) {
	c.SetCookie("token", "", -1, "/", "", false, true)
}

type Valid struct {
	FromSys    bool // 代表是由系统发起的请求，不需要验证
	User       string
	Permission map[string]bool
	ValidTime  int64
}

func getValid(c *gin.Context) Valid {
	tokenS, err := c.Cookie("token")
	if err != nil {
		return Valid{}
	}
	var data token.Data
	err = json.Unmarshal([]byte(tokenS), &data)
	if err != nil {
		return Valid{}
	}
	var r Valid
	r.User = data.User
	r.Permission = make(map[string]bool)
	for _, v := range data.Permission {
		if GWebMgr.CheckSignature(&data, v) {
			r.Permission[v] = true
		} else {
			r.Permission[v] = false
		}
	}
	r.ValidTime = data.ValidTime
	return r
}

func check(c *gin.Context) {
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

	var r Valid
	r.User = data.User
	r.Permission = make(map[string]bool)
	for _, v := range data.Permission {
		if GWebMgr.CheckSignature(&data, v) {
			r.Permission[v] = true
		} else {
			r.Permission[v] = false
		}
	}
	r.ValidTime = data.ValidTime
	c.JSON(200, gin.H{
		"code": 0,
		"msg":  "ok",
		"data": struct {
			User       string
			Permission map[string]bool
			ValidTime  int64
		}{
			User:       r.User,
			Permission: r.Permission,
			ValidTime:  r.ValidTime,
		},
	})
}

func checkAdmin(c *gin.Context) {
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
	if !GWebMgr.CheckSignature(&data, "admin") {
		c.JSON(200, gin.H{
			"code": 1,
			"msg":  "token invalid",
		})
		c.Abort()
		return
	}
}

func getServices(c *gin.Context) {
	info := GPlatCore.GetWebInfo()
	c.JSON(200, info)
}

func startService(c *gin.Context) {
	name := c.Param("name")
	flag := tool.GetFlag(share.SvrName(name))
	if flag == share.FlagNone {
		c.JSON(200, gin.H{
			"code": 1,
			"msg":  "service not exist",
		})
		return
	}
	err := GPlatCore.StartService(flag)
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

func stopService(c *gin.Context) {
	name := c.Param("name")
	flag := tool.GetFlag(share.SvrName(name))
	if flag == share.FlagNone {
		c.JSON(200, gin.H{
			"code": 1,
			"msg":  "service not exist",
		})
		return
	}
	err := GPlatCore.StopService(flag)
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

func getLastLog(c *gin.Context) {
	logs, err := global.GNews.GetTopic("PLAT")
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

func serviceHandle(c *gin.Context) {
	name := c.Param("name")
	cmd := c.Param("cmd")
	bodyStr, err := c.GetRawData()
	if err != nil {
		c.JSON(200, gin.H{
			"code": 1,
			"msg":  "Get body error",
		})
		return
	}
	flag := tool.GetFlag(share.SvrName(name))
	msg := share2.MakeMsgJson(cmd, string(bodyStr))
	valid := getValid(c)
	rec, err := GPlatCore.OnRecRpc(flag, msg, valid)
	if err != nil {
		c.JSON(200, gin.H{
			"code": 1,
			"msg":  "Rpc error",
		})
		return
	}
	c.JSON(200, rec)
}
