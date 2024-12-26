package auto

import (
	"errors"
	"github.com/gin-gonic/gin"
	"github.com/intmian/mian_go_lib/tool/misc"
	"github.com/intmian/platform/backend/services/auto/mods"
	"github.com/intmian/platform/backend/services/auto/setting"
	"github.com/intmian/platform/backend/services/auto/task"
	"github.com/intmian/platform/backend/services/auto/tool"
	backendshare "github.com/intmian/platform/backend/share"
	"time"
)

type Service struct {
	share backendshare.ServiceShare
}

func (s *Service) DebugCommand(req backendshare.DebugReq) interface{} {
	//TODO implement me
	panic("implement me")
}

func (s *Service) GetProp() backendshare.ServiceProp {
	return misc.CreateProperty(backendshare.SvrPropMicro)
}

func (s *Service) HandleRpc(msg backendshare.Msg, valid backendshare.Valid) (interface{}, error) {
	if !(valid.HasPermission("admin") || valid.HasPermission("auto")) {
		return nil, errors.New("no permission")
	}
	switch msg.Cmd() {
	case CmdGetReport:
		return backendshare.HandleRpcTool("getReport", msg, valid, s.OnGetReport)
	case CmdGetWholeReport:
		return backendshare.HandleRpcTool("getWholeReport", msg, valid, s.OnGetWholeReport)
	case CmdGetReportList:
		return backendshare.HandleRpcTool("getReportList", msg, valid, s.OnGetReportList)
	case CmdGenerateReport:
		return backendshare.HandleRpcTool("generateReport", msg, valid, s.OnGenerateReport)
	}
	return nil, nil
}

func (s *Service) Handle(msg backendshare.Msg, valid backendshare.Valid) {
	if !(valid.HasPermission("admin") || valid.HasPermission("auto")) {
		return
	}

	return
}

func (s *Service) Start(share backendshare.ServiceShare) error {
	s.share = share
	setting.GSetting = share.Storage
	tool.Init(share.Push, share.Log)
	tool.GLog.Info("AUTO", "初始化开始")
	task.Init()
	tool.GLog.Info("AUTO", "task初始化完成")
	// 网页被做到了外部，因此这里不需要了
	//ok, isDebug, err := xstorage.Get[bool](setting.GSetting, "web.debug")
	//if ok && isDebug {
	//	gin.SetMode(gin.DebugMode)
	//} else {
	//	gin.SetMode(gin.ReleaseMode)
	//}
	//gin.DisableConsoleColor()
	//f, _ := os.Create("static/gin.log")
	//gin.DefaultWriter = io.MultiWriter(f)
	//r := gin.Default()
	//http.RegisterWeb(r)
	//tool.GLog.Info("SYS", "web初始化完成")
	//ok, port, err := xstorage.Get[string](setting.GSetting, "web.port")
	//if !ok {
	//	err = r.Run(":8080")
	//} else {
	//	err = r.Run(":" + port)
	//}
	//if err != nil {
	//	tool.GLog.Info("SYS", "web启动失败")
	//}

	tool.GLog.Info("AUTO", "初始化完成")

	return nil
}

func (s *Service) Stop() error {
	task.GMgr.AllStop()
	return nil
}

func (s *Service) RegisterWeb(gin *gin.Engine) {
	// TODO:目前先只通过重启服务的方式进行，后续再说
}

func (s *Service) DeregisterWeb(gin *gin.Engine) {

}

func (s *Service) OnGetReport(valid backendshare.Valid, req GetReportReq) (ret GetReportRet, err error) {
	// 将请求的日期转换为时间
	day, err := time.Parse("2006-01-02", req.DayString)
	if err != nil {
		return
	}
	// 获取当天的报告
	rep, err := mods.GDay.GetDayReport(day)
	if err != nil {
		return
	}
	ret.Suc = true
	ret.Report = *rep
	return
}

func (s *Service) OnGetWholeReport(valid backendshare.Valid, req GetWholeReportReq) (ret GetWholeReportRet, err error) {
	// 获取整体报告
	rep, err := mods.GDay.GetWholeReport()
	if err != nil {
		return
	}
	ret.Suc = true
	ret.Report = *rep
	return
}

func (s *Service) OnGetReportList(valid backendshare.Valid, req GetReportListReq) (ret GetReportListRet, err error) {
	// 获取报告列表
	list, err := mods.GDay.GetReportList()
	if err != nil {
		return
	}
	ret.Suc = true
	ret.List = list
	return
}

func (s *Service) OnGenerateReport(valid backendshare.Valid, req GenerateReportReq) (ret GenerateReportRet, err error) {
	// 生成报告
	_, err = mods.GDay.GenerateDayReport()
	if err != nil {
		return
	}
	ret.Suc = true
	return
}
