package auto

import (
	"github.com/intmian/platform/backend/services/auto/mods"
	"github.com/intmian/platform/backend/share"
)

const CmdGetReport share.Cmd = "getReport"

type GetReportReq struct {
	DayString string
}

type GetReportRet struct {
	Suc    bool
	Report mods.DayReport
}

const CmdGetWholeReport share.Cmd = "getWholeReport"

type GetWholeReportReq struct {
}

type GetWholeReportRet struct {
	Suc    bool
	Report mods.WholeReport
}

const CmdGetReportList share.Cmd = "getReportList"

type GetReportListReq struct {
}

type GetReportListRet struct {
	Suc  bool
	List []string
}

const CmdGenerateReport share.Cmd = "generateReport"

type GenerateReportReq struct {
}

type GenerateReportRet struct {
	Suc bool
}
