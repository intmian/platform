package platform

import (
	"encoding/json"
	"fmt"
	"github.com/gin-gonic/gin"
	"github.com/intmian/mian_go_lib/tool/misc"
	"github.com/intmian/mian_go_lib/tool/token"
	share3 "github.com/intmian/platform/backend/services/account/share"
	"github.com/intmian/platform/backend/share"
	"github.com/shirou/gopsutil/cpu"
	"github.com/shirou/gopsutil/mem"
	"github.com/shirou/gopsutil/process"
	"sort"
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

	// 异步执行一些登录成功后的操作
	go m.onLogin(c, body.Username, permission, retr, err)

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

func (m *webMgr) onLogin(c *gin.Context, userName string, permission []string, retr share3.CheckTokenRet, err error) {
	// 打印登录日志，如果是admin，还需要推送
	loginInfo := "login usr[%s] permission%v time[%s] ip[%s](%s)"
	// 获取真实ip，因为可能是通过cf cdn转发过来的
	realIP := c.GetHeader("CF-Connecting-IP")
	if realIP == "" {
		realIP = c.GetHeader("X-Forwarded-For")
		if realIP == "" {
			realIP = c.ClientIP()
		}
	}
	loginInfo = fmt.Sprintf(loginInfo, userName, permission, time.Now().Format("2006-01-02 15:04:05"), realIP, misc.GetIpAddr(realIP))
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
	if r.Permissions == nil {
		c.JSON(200, gin.H{
			"code": 1,
			"msg":  "token invalid",
		})
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

func (m *webMgr) getSystemUsage(c *gin.Context) {
	v, _ := mem.VirtualMemory()
	swap, _ := mem.SwapMemory()
	cpuPercent, _ := cpu.Percent(0, false)
	cpuInfo, _ := cpu.Info()
	cpuTimes, _ := cpu.Times(false)
	processes, _ := process.Processes()

	type ProcessInfo struct {
		Pid    int32   `json:"pid"`
		Name   string  `json:"name"`
		Memory float32 `json:"memory"`
	}

	var processInfos []ProcessInfo
	for _, p := range processes {
		memPercent, _ := p.MemoryPercent()
		name, _ := p.Name()
		processInfos = append(processInfos, ProcessInfo{
			Pid:    p.Pid,
			Name:   name,
			Memory: memPercent,
		})
	}

	sort.Slice(processInfos, func(i, j int) bool {
		return processInfos[i].Memory > processInfos[j].Memory
	})

	if len(processInfos) > 10 {
		processInfos = processInfos[:10]
	}

	c.JSON(200, gin.H{
		"memory": gin.H{
			"total":       v.Total,
			"used":        v.Used,
			"free":        v.Free,
			"shared":      v.Shared,
			"buffers":     v.Buffers,
			"cached":      v.Cached,
			"available":   v.Available,
			"usedPercent": v.UsedPercent,
		},
		"swap": gin.H{
			"total":       swap.Total,
			"used":        swap.Used,
			"free":        swap.Free,
			"usedPercent": swap.UsedPercent,
		},
		"cpu": gin.H{
			"percent": cpuPercent[0],
			"info":    cpuInfo,
			"times":   cpuTimes,
		},
		"top10": processInfos,
	})
}

type ProcessInfo struct {
	Pid    int32   `json:"pid"`
	Name   string  `json:"name"`
	Cpu    float64 `json:"cpu"`
	Memory float32 `json:"memory"`
}

// 获取内存或 CPU 排名前10的进程
func topProcesses(processInfos []ProcessInfo, criteria string) []ProcessInfo {
	switch criteria {
	case "memory":
		sort.Slice(processInfos, func(i, j int) bool {
			return processInfos[i].Memory > processInfos[j].Memory
		})
	case "cpu":
		sort.Slice(processInfos, func(i, j int) bool {
			return processInfos[i].Cpu > processInfos[j].Cpu
		})
	}

	if len(processInfos) > 10 {
		return append([]ProcessInfo{}, processInfos[:10]...)
	}
	return append([]ProcessInfo{}, processInfos...)
}

func (m *webMgr) getSystemUsageSSE(c *gin.Context) {
	c.Header("Content-Type", "text/event-stream")
	c.Header("Cache-Control", "no-cache")
	c.Header("Connection", "keep-alive")
	c.Writer.Flush()

	// 定义获取系统信息的函数
	getSystemStats := func() (gin.H, error) {
		v, err := mem.VirtualMemory()
		if err != nil {
			return nil, err
		}
		swap, err := mem.SwapMemory()
		if err != nil {
			return nil, err
		}
		cpuPercent, err := cpu.Percent(0, false)
		if err != nil {
			return nil, err
		}
		cpuInfo, err := cpu.Info()
		if err != nil {
			return nil, err
		}
		cpuTimes, err := cpu.Times(false)
		if err != nil {
			return nil, err
		}
		processes, err := process.Processes()
		if err != nil {
			return nil, err
		}

		// 获取进程信息并生成ProcessInfo
		var processInfos []ProcessInfo
		for _, p := range processes {
			memPercent, _ := p.MemoryPercent()
			name, _ := p.Name()
			pCpuPercent, _ := p.CPUPercent()
			processInfos = append(processInfos, ProcessInfo{
				Pid:    p.Pid,
				Name:   name,
				Cpu:    pCpuPercent,
				Memory: memPercent,
			})
		}

		// 对进程按照内存使用和 CPU 使用分别排序，获取前10
		processInfosMemory := topProcesses(processInfos, "memory")
		processInfosCpu := topProcesses(processInfos, "cpu")

		// 组装返回数据
		data := gin.H{
			"memory": gin.H{
				"total":       v.Total,
				"used":        v.Used,
				"free":        v.Free,
				"shared":      v.Shared,
				"buffers":     v.Buffers,
				"cached":      v.Cached,
				"available":   v.Available,
				"usedPercent": v.UsedPercent,
			},
			"swap": gin.H{
				"total":       swap.Total,
				"used":        swap.Used,
				"free":        swap.Free,
				"usedPercent": swap.UsedPercent,
			},
			"cpu": gin.H{
				"percent": cpuPercent[0],
				"info":    cpuInfo,
				"times":   cpuTimes,
			},
			"top10Mem": processInfosMemory,
			"top10Cpu": processInfosCpu,
		}

		return data, nil
	}

	// 循环发送 SSE 数据
	for {
		data, err := getSystemStats()
		if err != nil {
			// 处理错误
			fmt.Fprintf(c.Writer, "data: {\"error\": \"failed to retrieve system stats\"}\n\n")
			c.Writer.Flush()
			return
		}

		// 转换为 JSON 格式并发送数据
		jsonData, err := json.Marshal(data)
		if err != nil {
			fmt.Fprintf(c.Writer, "data: {\"error\": \"failed to marshal data\"}\n\n")
			c.Writer.Flush()
			return
		}

		// 检查连接是否还有效
		if _, err := c.Writer.Write([]byte("data: " + string(jsonData) + "\n\n")); err != nil {
			// 如果写入出错，说明连接已关闭，退出循环
			fmt.Println("Client disconnected:", err)
			return
		}

		c.Writer.Flush()

		// 防止阻塞并控制数据发送频率
		time.Sleep(5 * time.Second)
	}
}
