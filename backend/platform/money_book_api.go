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

type moneyBookExportReq struct {
	BookID string `json:"bookId"`
}

type moneyBookExportResp struct {
	Archive moneyBookArchive `json:"archive"`
}

type moneyBookImportReq struct {
	Archive moneyBookArchive `json:"archive"`
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

type moneyRecordCreateReq struct {
	BookID           string `json:"bookId"`
	Date             string `json:"date"`
	CopyFromRecordID string `json:"copyFromRecordId"`
}

type moneyRecordReq struct {
	BookID   string `json:"bookId"`
	RecordID string `json:"recordId"`
}

type moneyRecordResp struct {
	Record ReconciliationRecordView `json:"record"`
}

type moneyRecordUpdateReq struct {
	BookID string               `json:"bookId"`
	Record ReconciliationRecord `json:"record"`
}

type moneyRecordListReq struct {
	BookID string `json:"bookId"`
}

type moneyRecordListResp struct {
	Items []moneyRecordListItem `json:"items"`
}

type moneyDashboardReq struct {
	BookID string `json:"bookId"`
}

type moneyDashboardResp struct {
	Book           MoneyBook                  `json:"book"`
	Items          []MoneyItem                `json:"items"`
	LatestRecordID string                     `json:"latestRecordId"`
	LatestDate     string                     `json:"latestDate"`
	Records        []ReconciliationRecordView `json:"records"`
	Events         []MoneyEvent               `json:"events"`
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
	Created       []moneyRecordIndexItem `json:"created"`
	SkippedSheets []string               `json:"skippedSheets"`
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

func (m *webMgr) moneyBookExportJSON(c *gin.Context) {
	if _, ok := m.requireMoneyAdmin(c); !ok {
		return
	}
	var req moneyBookExportReq
	if err := c.ShouldBindJSON(&req); err != nil {
		ErrReturn(c, "illegal param")
		return
	}
	archive, err := m.plat.moneyBookMgr.exportBookArchive(req.BookID)
	if err != nil {
		ErrReturn(c, err.Error())
		return
	}
	OkReturn(c, moneyBookExportResp{Archive: archive})
}

func (m *webMgr) moneyBookImportJSON(c *gin.Context) {
	valid, ok := m.requireMoneyAdmin(c)
	if !ok {
		return
	}
	var req moneyBookImportReq
	if err := c.ShouldBindJSON(&req); err != nil {
		ErrReturn(c, "illegal param")
		return
	}
	book, err := m.plat.moneyBookMgr.importBookArchive(req.Archive, valid.User)
	if err != nil {
		ErrReturn(c, err.Error())
		return
	}
	OkReturn(c, moneyBookMutationResp{Book: book})
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

func (m *webMgr) moneyRecordCreate(c *gin.Context) {
	valid, ok := m.requireMoneyAdmin(c)
	if !ok {
		return
	}
	var req moneyRecordCreateReq
	if err := c.ShouldBindJSON(&req); err != nil {
		ErrReturn(c, "illegal param")
		return
	}
	record, err := m.plat.moneyBookMgr.createRecord(req, valid.User)
	if err != nil {
		ErrReturn(c, err.Error())
		return
	}
	OkReturn(c, moneyRecordResp{Record: record})
}

func (m *webMgr) moneyRecordGet(c *gin.Context) {
	if _, ok := m.requireMoneyAdmin(c); !ok {
		return
	}
	var req moneyRecordReq
	if err := c.ShouldBindJSON(&req); err != nil {
		ErrReturn(c, "illegal param")
		return
	}
	record, err := m.plat.moneyBookMgr.getRecord(req.BookID, req.RecordID)
	if err != nil {
		ErrReturn(c, err.Error())
		return
	}
	OkReturn(c, moneyRecordResp{Record: record})
}

func (m *webMgr) moneyRecordUpdate(c *gin.Context) {
	if _, ok := m.requireMoneyAdmin(c); !ok {
		return
	}
	var req moneyRecordUpdateReq
	if err := c.ShouldBindJSON(&req); err != nil {
		ErrReturn(c, "illegal param")
		return
	}
	record, err := m.plat.moneyBookMgr.updateRecord(req)
	if err != nil {
		ErrReturn(c, err.Error())
		return
	}
	OkReturn(c, moneyRecordResp{Record: record})
}

func (m *webMgr) moneyRecordDelete(c *gin.Context) {
	if _, ok := m.requireMoneyAdmin(c); !ok {
		return
	}
	var req moneyRecordReq
	if err := c.ShouldBindJSON(&req); err != nil {
		ErrReturn(c, "illegal param")
		return
	}
	if err := m.plat.moneyBookMgr.deleteRecord(req.BookID, req.RecordID); err != nil {
		ErrReturn(c, err.Error())
		return
	}
	OkReturn(c, map[string]bool{"suc": true})
}

func (m *webMgr) moneyRecordCompute(c *gin.Context) {
	if _, ok := m.requireMoneyAdmin(c); !ok {
		return
	}
	var req moneyRecordReq
	if err := c.ShouldBindJSON(&req); err != nil {
		ErrReturn(c, "illegal param")
		return
	}
	record, err := m.plat.moneyBookMgr.computeRecord(req.BookID, req.RecordID, true)
	if err != nil {
		ErrReturn(c, err.Error())
		return
	}
	OkReturn(c, moneyRecordResp{Record: record})
}

func (m *webMgr) moneyRecordConfirm(c *gin.Context) {
	valid, ok := m.requireMoneyAdmin(c)
	if !ok {
		return
	}
	var req moneyRecordReq
	if err := c.ShouldBindJSON(&req); err != nil {
		ErrReturn(c, "illegal param")
		return
	}
	record, err := m.plat.moneyBookMgr.confirmRecord(req.BookID, req.RecordID, valid.User)
	if err != nil {
		ErrReturn(c, err.Error())
		return
	}
	OkReturn(c, moneyRecordResp{Record: record})
}

func (m *webMgr) moneyRecordList(c *gin.Context) {
	if _, ok := m.requireMoneyAdmin(c); !ok {
		return
	}
	var req moneyRecordListReq
	if err := c.ShouldBindJSON(&req); err != nil {
		ErrReturn(c, "illegal param")
		return
	}
	items, err := m.plat.moneyBookMgr.listRecords(req.BookID)
	if err != nil {
		ErrReturn(c, err.Error())
		return
	}
	OkReturn(c, moneyRecordListResp{Items: items})
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
