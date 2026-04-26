package platform

import (
	"github.com/gin-gonic/gin"
	"github.com/intmian/platform/backend/share"
)

type moneyBookListResp struct {
	Books []MoneyBook `json:"books"`
}

type moneyBookCreateReq struct {
	Name string `json:"name"`
}

type moneyBookMutationResp struct {
	Book MoneyBook `json:"book"`
}

type moneyBookUpdateReq struct {
	ID                      string   `json:"id"`
	Name                    string   `json:"name"`
	PrimaryBalanceAccountID string   `json:"primaryBalanceAccountId"`
	Enabled                 bool     `json:"enabled"`
	ViewerUsers             []string `json:"viewerUsers"`
}

type moneyBookDeleteReq struct {
	ID string `json:"id"`
}

type moneyBookGrantDashboardReq struct {
	BookID      string   `json:"bookId"`
	ViewerUsers []string `json:"viewerUsers"`
}

type moneyItemListReq struct {
	BookID string `json:"bookId"`
}

type moneyItemListResp struct {
	Items []MoneyItem `json:"items"`
}

type moneyItemUpdateReq struct {
	BookID string      `json:"bookId"`
	Items  []MoneyItem `json:"items"`
}

type moneyBatchCreateReq struct {
	BookID          string `json:"bookId"`
	Date            string `json:"date"`
	IntervalDays    int    `json:"intervalDays"`
	CopyFromBatchID string `json:"copyFromBatchId"`
}

type moneyBatchReq struct {
	BookID  string `json:"bookId"`
	BatchID string `json:"batchId"`
}

type moneyBatchResp struct {
	Batch ReconciliationBatch `json:"batch"`
}

type moneyBatchUpdateReq struct {
	BookID string              `json:"bookId"`
	Batch  ReconciliationBatch `json:"batch"`
}

type moneyBatchListReq struct {
	BookID string `json:"bookId"`
}

type moneyBatchListResp struct {
	Items []moneyBatchIndexItem `json:"items"`
}

type moneyDashboardReq struct {
	BookID string `json:"bookId"`
}

type moneyDashboardResp struct {
	Book               MoneyBook                     `json:"book"`
	LatestBatchID      string                        `json:"latestBatchId"`
	LatestDate         string                        `json:"latestDate"`
	Summary            MoneySummary                  `json:"summary"`
	Trends             []moneyDashboardTrendItem     `json:"trends"`
	AssetStructure     []moneyDashboardStructureItem `json:"assetStructure"`
	LiabilityStructure []moneyDashboardStructureItem `json:"liabilityStructure"`
	Events             []MoneyEvent                  `json:"events"`
}

type moneyDashboardTrendItem struct {
	Date                  string  `json:"date"`
	CashCents             int64   `json:"cashCents"`
	NetAssetCents         int64   `json:"netAssetCents"`
	LiabilityCents        int64   `json:"liabilityCents"`
	TotalAssetCents       int64   `json:"totalAssetCents"`
	InvestmentProfitCents int64   `json:"investmentProfitCents"`
	AssetLiabilityRate    float64 `json:"assetLiabilityRate"`
}

type moneyDashboardStructureItem struct {
	Name       string `json:"name"`
	ValueCents int64  `json:"valueCents"`
}

type moneyImportExcelPreviewReq struct {
	BookID     string `json:"bookId"`
	FileName   string `json:"fileName"`
	FileBase64 string `json:"fileBase64"`
}

type moneyImportExcelPreviewResp struct {
	Preview moneyImportPreview `json:"preview"`
}

type moneyImportExcelConfirmReq struct {
	BookID    string `json:"bookId"`
	PreviewID string `json:"previewId"`
}

type moneyImportConfirmResp struct {
	Created       []moneyBatchIndexItem `json:"created"`
	SkippedSheets []string              `json:"skippedSheets"`
}

func isMoneyAdmin(valid share.Valid) bool {
	return valid.HasPermission(share.PermissionAdmin)
}

func (m *webMgr) requireMoneyAdmin(c *gin.Context) (share.Valid, bool) {
	valid := m.getValid(c)
	if !isMoneyAdmin(valid) {
		ErrReturn(c, "no permission")
		return valid, false
	}
	return valid, true
}

func (m *webMgr) moneyBookList(c *gin.Context) {
	valid := m.getValid(c)
	if valid.User == "" && !valid.FromSys {
		ErrReturn(c, "no permission")
		return
	}
	books, err := m.plat.moneyBookMgr.listBooks(valid.User, isMoneyAdmin(valid))
	if err != nil {
		ErrReturn(c, "inner error")
		return
	}
	OkReturn(c, moneyBookListResp{Books: books})
}

func (m *webMgr) moneyBookCreate(c *gin.Context) {
	valid, ok := m.requireMoneyAdmin(c)
	if !ok {
		return
	}
	var req moneyBookCreateReq
	if err := c.ShouldBindJSON(&req); err != nil {
		ErrReturn(c, "illegal param")
		return
	}
	book, err := m.plat.moneyBookMgr.createBook(req.Name, valid.User)
	if err != nil {
		ErrReturn(c, err.Error())
		return
	}
	OkReturn(c, moneyBookMutationResp{Book: book})
}

func (m *webMgr) moneyBookUpdate(c *gin.Context) {
	if _, ok := m.requireMoneyAdmin(c); !ok {
		return
	}
	var req moneyBookUpdateReq
	if err := c.ShouldBindJSON(&req); err != nil {
		ErrReturn(c, "illegal param")
		return
	}
	book, err := m.plat.moneyBookMgr.updateBook(req)
	if err != nil {
		ErrReturn(c, err.Error())
		return
	}
	OkReturn(c, moneyBookMutationResp{Book: book})
}

func (m *webMgr) moneyBookDelete(c *gin.Context) {
	if _, ok := m.requireMoneyAdmin(c); !ok {
		return
	}
	var req moneyBookDeleteReq
	if err := c.ShouldBindJSON(&req); err != nil {
		ErrReturn(c, "illegal param")
		return
	}
	if err := m.plat.moneyBookMgr.deleteBook(req.ID); err != nil {
		ErrReturn(c, err.Error())
		return
	}
	OkReturn(c, map[string]bool{"suc": true})
}

func (m *webMgr) moneyBookGrantDashboard(c *gin.Context) {
	if _, ok := m.requireMoneyAdmin(c); !ok {
		return
	}
	var req moneyBookGrantDashboardReq
	if err := c.ShouldBindJSON(&req); err != nil {
		ErrReturn(c, "illegal param")
		return
	}
	book, err := m.plat.moneyBookMgr.grantDashboard(req.BookID, req.ViewerUsers)
	if err != nil {
		ErrReturn(c, err.Error())
		return
	}
	OkReturn(c, moneyBookMutationResp{Book: book})
}

func (m *webMgr) moneyItemList(c *gin.Context) {
	if _, ok := m.requireMoneyAdmin(c); !ok {
		return
	}
	var req moneyItemListReq
	if err := c.ShouldBindJSON(&req); err != nil {
		ErrReturn(c, "illegal param")
		return
	}
	items, err := m.plat.moneyBookMgr.listItems(req.BookID)
	if err != nil {
		ErrReturn(c, err.Error())
		return
	}
	OkReturn(c, moneyItemListResp{Items: items})
}

func (m *webMgr) moneyItemUpdate(c *gin.Context) {
	if _, ok := m.requireMoneyAdmin(c); !ok {
		return
	}
	var req moneyItemUpdateReq
	if err := c.ShouldBindJSON(&req); err != nil {
		ErrReturn(c, "illegal param")
		return
	}
	items, err := m.plat.moneyBookMgr.updateItems(req.BookID, req.Items)
	if err != nil {
		ErrReturn(c, err.Error())
		return
	}
	OkReturn(c, moneyItemListResp{Items: items})
}

func (m *webMgr) moneyBatchCreate(c *gin.Context) {
	valid, ok := m.requireMoneyAdmin(c)
	if !ok {
		return
	}
	var req moneyBatchCreateReq
	if err := c.ShouldBindJSON(&req); err != nil {
		ErrReturn(c, "illegal param")
		return
	}
	batch, err := m.plat.moneyBookMgr.createBatch(req, valid.User)
	if err != nil {
		ErrReturn(c, err.Error())
		return
	}
	OkReturn(c, moneyBatchResp{Batch: batch})
}

func (m *webMgr) moneyBatchGet(c *gin.Context) {
	if _, ok := m.requireMoneyAdmin(c); !ok {
		return
	}
	var req moneyBatchReq
	if err := c.ShouldBindJSON(&req); err != nil {
		ErrReturn(c, "illegal param")
		return
	}
	batch, err := m.plat.moneyBookMgr.getBatch(req.BookID, req.BatchID)
	if err != nil {
		ErrReturn(c, err.Error())
		return
	}
	OkReturn(c, moneyBatchResp{Batch: batch})
}

func (m *webMgr) moneyBatchUpdate(c *gin.Context) {
	if _, ok := m.requireMoneyAdmin(c); !ok {
		return
	}
	var req moneyBatchUpdateReq
	if err := c.ShouldBindJSON(&req); err != nil {
		ErrReturn(c, "illegal param")
		return
	}
	batch, err := m.plat.moneyBookMgr.updateBatch(req)
	if err != nil {
		ErrReturn(c, err.Error())
		return
	}
	OkReturn(c, moneyBatchResp{Batch: batch})
}

func (m *webMgr) moneyBatchCompute(c *gin.Context) {
	if _, ok := m.requireMoneyAdmin(c); !ok {
		return
	}
	var req moneyBatchReq
	if err := c.ShouldBindJSON(&req); err != nil {
		ErrReturn(c, "illegal param")
		return
	}
	batch, err := m.plat.moneyBookMgr.computeBatch(req.BookID, req.BatchID, true)
	if err != nil {
		ErrReturn(c, err.Error())
		return
	}
	OkReturn(c, moneyBatchResp{Batch: batch})
}

func (m *webMgr) moneyBatchConfirm(c *gin.Context) {
	valid, ok := m.requireMoneyAdmin(c)
	if !ok {
		return
	}
	var req moneyBatchReq
	if err := c.ShouldBindJSON(&req); err != nil {
		ErrReturn(c, "illegal param")
		return
	}
	batch, err := m.plat.moneyBookMgr.confirmBatch(req.BookID, req.BatchID, valid.User)
	if err != nil {
		ErrReturn(c, err.Error())
		return
	}
	OkReturn(c, moneyBatchResp{Batch: batch})
}

func (m *webMgr) moneyBatchList(c *gin.Context) {
	if _, ok := m.requireMoneyAdmin(c); !ok {
		return
	}
	var req moneyBatchListReq
	if err := c.ShouldBindJSON(&req); err != nil {
		ErrReturn(c, "illegal param")
		return
	}
	items, err := m.plat.moneyBookMgr.listBatches(req.BookID)
	if err != nil {
		ErrReturn(c, err.Error())
		return
	}
	OkReturn(c, moneyBatchListResp{Items: items})
}

func (m *webMgr) moneyDashboardGet(c *gin.Context) {
	valid := m.getValid(c)
	if valid.User == "" && !valid.FromSys {
		ErrReturn(c, "no permission")
		return
	}
	var req moneyDashboardReq
	if err := c.ShouldBindJSON(&req); err != nil {
		ErrReturn(c, "illegal param")
		return
	}
	resp, err := m.plat.moneyBookMgr.dashboard(req.BookID, valid.User, isMoneyAdmin(valid))
	if err != nil {
		ErrReturn(c, err.Error())
		return
	}
	OkReturn(c, resp)
}

func (m *webMgr) moneyImportExcelPreview(c *gin.Context) {
	if _, ok := m.requireMoneyAdmin(c); !ok {
		return
	}
	var req moneyImportExcelPreviewReq
	if err := c.ShouldBindJSON(&req); err != nil {
		ErrReturn(c, "illegal param")
		return
	}
	preview, err := m.plat.moneyBookMgr.previewExcelImport(req)
	if err != nil {
		ErrReturn(c, err.Error())
		return
	}
	OkReturn(c, moneyImportExcelPreviewResp{Preview: preview})
}

func (m *webMgr) moneyImportExcelConfirm(c *gin.Context) {
	valid, ok := m.requireMoneyAdmin(c)
	if !ok {
		return
	}
	var req moneyImportExcelConfirmReq
	if err := c.ShouldBindJSON(&req); err != nil {
		ErrReturn(c, "illegal param")
		return
	}
	resp, err := m.plat.moneyBookMgr.confirmExcelImport(req, valid.User)
	if err != nil {
		ErrReturn(c, err.Error())
		return
	}
	OkReturn(c, resp)
}
