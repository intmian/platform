package platform

import (
	"github.com/gin-gonic/gin"
)

func (m *webMgr) initSvrRoot(r *gin.Engine) {
	r.GET("/share-link/:username/:token", m.shareLinkDownload)
	// 服务的直通接口
	r.POST("/service/:name/:cmd", m.serviceHandle)
	r.POST("/debug/:name/:cmd", m.serviceDebugHandle)

	// 目前所有的配置全部注册在主服务处，后续可以拆分为配置服，用来同步配置
	r.POST("/cfg/plat/set", m.cfgPlatSet)
	r.POST("/cfg/:svr/set", m.cfgServiceSet)
	r.POST("/cfg/:svr/:user/set", m.cfgServiceUserSet)
	r.POST("/cfg/plat/get", m.cfgPlatGet)
	r.POST("/cfg/:svr/get", m.cfgServiceGet)
	r.POST("/cfg/:svr/:user/get", m.cfgServiceUserGet)

	// 未来可能迁移到misc
	r.POST("/misc/gpt-rewrite", m.gptRewrite)
	r.POST("/misc/r2-presigned-url", m.getR2PresignedURL)
	r.POST("/misc/subscription/list", m.subscriptionList)
	r.POST("/misc/subscription/create", m.subscriptionCreate)
	r.POST("/misc/subscription/update", m.subscriptionUpdate)
	r.POST("/misc/subscription/delete", m.subscriptionDelete)
	r.POST("/misc/subscription/rotate", m.subscriptionRotate)
	r.POST("/misc/subscription/check", m.subscriptionCheck)
	r.POST("/misc/money/book/list", m.moneyBookList)
	r.POST("/misc/money/book/create", m.moneyBookCreate)
	r.POST("/misc/money/book/update", m.moneyBookUpdate)
	r.POST("/misc/money/book/delete", m.moneyBookDelete)
	r.POST("/misc/money/book/export-json", m.moneyBookExportJSON)
	r.POST("/misc/money/book/import-json", m.moneyBookImportJSON)
	r.POST("/misc/money/book/grant-dashboard", m.moneyBookGrantDashboard)
	r.POST("/misc/money/item/list", m.moneyItemList)
	r.POST("/misc/money/item/update", m.moneyItemUpdate)
	r.POST("/misc/money/record/create", m.moneyRecordCreate)
	r.POST("/misc/money/record/get", m.moneyRecordGet)
	r.POST("/misc/money/record/update", m.moneyRecordUpdate)
	r.POST("/misc/money/record/delete", m.moneyRecordDelete)
	r.POST("/misc/money/record/compute", m.moneyRecordCompute)
	r.POST("/misc/money/record/confirm", m.moneyRecordConfirm)
	r.POST("/misc/money/record/list", m.moneyRecordList)
	r.POST("/misc/money/dashboard/get", m.moneyDashboardGet)
	r.POST("/misc/money/import/excel/preview", m.moneyImportExcelPreview)
	r.POST("/misc/money/import/excel/confirm", m.moneyImportExcelConfirm)
}
