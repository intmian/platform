package platform

import (
	"archive/zip"
	"bytes"
	"encoding/base64"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/intmian/mian_go_lib/tool/misc"
	"github.com/intmian/mian_go_lib/tool/token"
	"github.com/intmian/mian_go_lib/xstorage"
)

func newTestMoneyBookMgr(t *testing.T) *moneyBookMgr {
	t.Helper()
	dir := t.TempDir()
	storage, err := xstorage.NewXStorage(xstorage.XStorageSetting{
		Property: misc.CreateProperty(xstorage.UseCache, xstorage.UseDisk, xstorage.MultiSafe, xstorage.FullInitLoad),
		SaveType: xstorage.SqlLiteDB,
		DBAddr:   filepath.Join(dir, "money.db"),
	})
	if err != nil {
		t.Fatalf("new storage failed: %v", err)
	}
	plat := &PlatForm{storage: storage}
	mgr := newMoneyBookMgr(plat)
	plat.moneyBookMgr = mgr
	return mgr
}

func testMoneyItems(bookID string) []MoneyItem {
	return []MoneyItem{
		{
			ID:                 "alipay",
			BookID:             bookID,
			Name:               "支付宝",
			Type:               moneyItemTypeCashAccount,
			Enabled:            true,
			Sort:               1,
			IncludeInReconcile: true,
			IncludeInCash:      true,
			IncludeInNetAsset:  true,
		},
		{
			ID:                 "wechat",
			BookID:             bookID,
			Name:               "微信",
			Type:               moneyItemTypeCashAccount,
			Enabled:            true,
			Sort:               2,
			IncludeInReconcile: true,
			IncludeInCash:      true,
			IncludeInNetAsset:  true,
		},
		{
			ID:                 "credit",
			BookID:             bookID,
			Name:               "信用卡",
			Type:               moneyItemTypeDebtAccount,
			Enabled:            true,
			Sort:               3,
			IncludeInReconcile: true,
			IncludeInLiability: true,
		},
		{
			ID:                        "fund",
			BookID:                    bookID,
			Name:                      "基金",
			Type:                      moneyItemTypeInvestment,
			Enabled:                   true,
			Sort:                      4,
			IncludeInInvestmentProfit: true,
			IncludeInNetAsset:         true,
		},
		{
			ID:                        "loan",
			BookID:                    bookID,
			Name:                      "房贷",
			Type:                      moneyItemTypeLiability,
			Enabled:                   true,
			Sort:                      5,
			IncludeInLiability:        true,
			IncludeInNetAsset:         false,
			IncludeInReconcile:        false,
			IncludeInCash:             false,
			IncludeInInvestmentProfit: false,
		},
	}
}

func TestComputeMoneyRecord(t *testing.T) {
	book := MoneyBook{ID: "book", Name: "家庭账本", PrimaryBalanceAccountID: "alipay", Enabled: true}
	items := testMoneyItems(book.ID)
	prev := ReconciliationRecord{
		ID:     "prev",
		BookID: book.ID,
		Date:   "2026-03-01",
		Status: moneyBookStatusConfirmed,
		Entries: []ReconciliationEntry{
			{ItemID: "fund", CurrentValueCents: 1000000},
		},
	}
	record := ReconciliationRecord{
		ID:     "record",
		BookID: book.ID,
		Date:   "2026-04-01",
		Status: moneyBookStatusDraft,
		Entries: []ReconciliationEntry{
			{ItemID: "alipay", BookValueCents: 100000, ActualValueCents: 98000, CurrentValueCents: 98000},
			{ItemID: "wechat", BookValueCents: 20000, ActualValueCents: 25000, CurrentValueCents: 25000},
			{ItemID: "credit", BookValueCents: 30000, ActualValueCents: 20000, CurrentValueCents: 20000},
			{ItemID: "fund", PreviousValueCents: 1000000, CurrentValueCents: 1100000},
			{ItemID: "loan", CurrentValueCents: 2000000},
		},
	}
	result, err := ComputeMoneyRecord(items, &prev, record, 31)
	if err != nil {
		t.Fatalf("compute failed: %v", err)
	}
	for _, entry := range result.Entries {
		if entry.ItemID == "credit" && (entry.BookValueCents != -30000 || entry.ActualValueCents != -20000 || entry.CurrentValueCents != -20000) {
			t.Fatalf("credit liability should be normalized to negative values: %+v", entry)
		}
		if entry.ItemID == "loan" && entry.CurrentValueCents != -2000000 {
			t.Fatalf("loan liability should be normalized to negative current value: %+v", entry)
		}
	}
}

func TestComputeMoneyRecordLiabilityInputSign(t *testing.T) {
	book := MoneyBook{ID: "book", Name: "家庭账本", PrimaryBalanceAccountID: "alipay", Enabled: true}
	items := testMoneyItems(book.ID)
	prev := ReconciliationRecord{
		ID:     "prev",
		BookID: book.ID,
		Date:   "2026-03-01",
		Status: moneyBookStatusConfirmed,
	}
	for _, actualValue := range []int64{1200, -1200} {
		record := ReconciliationRecord{
			ID:     "record",
			BookID: book.ID,
			Date:   "2026-04-01",
			Status: moneyBookStatusDraft,
			Entries: []ReconciliationEntry{
				{ItemID: "alipay", BookValueCents: 0, ActualValueCents: 0, CurrentValueCents: 0},
				{ItemID: "credit", BookValueCents: 0, ActualValueCents: actualValue, CurrentValueCents: actualValue},
			},
		}
		result, err := ComputeMoneyRecord(items, &prev, record, 31)
		if err != nil {
			t.Fatalf("compute failed: %v", err)
		}
		if len(result.Entries) != 2 || result.Entries[1].CurrentValueCents != -1200 || result.Entries[1].ActualValueCents != -1200 {
			t.Fatalf("liability input should be normalized for actual=%d: %+v", actualValue, result.Entries)
		}
	}
}

func TestMoneyBookRecordLifecycleAndLocking(t *testing.T) {
	mgr := newTestMoneyBookMgr(t)
	book, err := mgr.createBook("家庭账本", "admin")
	if err != nil {
		t.Fatalf("create book failed: %v", err)
	}
	items := testMoneyItems(book.ID)
	_, err = mgr.updateItems(book.ID, items)
	if err != nil {
		t.Fatalf("update items failed: %v", err)
	}
	book.PrimaryBalanceAccountID = "alipay"
	book.Enabled = true
	_, err = mgr.updateBook(moneyBookUpdateReq{
		ID:                      book.ID,
		Name:                    book.Name,
		PrimaryBalanceAccountID: "alipay",
		Enabled:                 true,
	})
	if err != nil {
		t.Fatalf("update book failed: %v", err)
	}
	record, err := mgr.createRecord(moneyRecordCreateReq{BookID: book.ID, Date: "2026-04-01"}, "admin")
	if err != nil {
		t.Fatalf("create record failed: %v", err)
	}
	for i := range record.Entries {
		switch record.Entries[i].ItemID {
		case "alipay":
			record.Entries[i].BookValueCents = 100000
			record.Entries[i].ActualValueCents = 100000
			record.Entries[i].CurrentValueCents = 100000
		case "fund":
			record.Entries[i].CurrentValueCents = 1000000
		}
	}
	record, err = mgr.updateRecord(moneyRecordUpdateReq{BookID: book.ID, Record: record.ReconciliationRecord})
	if err != nil {
		t.Fatalf("update record failed: %v", err)
	}
	confirmed, err := mgr.confirmRecord(book.ID, record.ID, "admin")
	if err != nil {
		t.Fatalf("confirm failed: %v", err)
	}
	if confirmed.Status != moneyBookStatusConfirmed || confirmed.ConfirmedBy != "admin" {
		t.Fatalf("unexpected confirmed record: %+v", confirmed)
	}
	confirmed.Entries[0].Note = "confirmed can be edited"
	editedConfirmed, err := mgr.updateRecord(moneyRecordUpdateReq{BookID: book.ID, Record: confirmed.ReconciliationRecord})
	if err != nil {
		t.Fatalf("confirmed record should be editable: %v", err)
	}
	if editedConfirmed.Status != moneyBookStatusConfirmed || editedConfirmed.ConfirmedBy != "admin" {
		t.Fatalf("confirmed metadata should be preserved: %+v", editedConfirmed)
	}
	next, err := mgr.createRecord(moneyRecordCreateReq{BookID: book.ID, Date: "2026-05-01"}, "admin")
	if err != nil {
		t.Fatalf("create next failed: %v", err)
	}
	if next.IntervalDays != 30 {
		t.Fatalf("expected interval from previous confirmed date, got %d", next.IntervalDays)
	}
	foundFund := false
	for _, entry := range next.Entries {
		if entry.ItemID == "fund" {
			foundFund = true
			if entry.PreviousValueCents != 1000000 || entry.CurrentValueCents != 1000000 {
				t.Fatalf("previous value not carried: %+v", entry)
			}
		}
	}
	if !foundFund {
		t.Fatal("fund entry not found")
	}
	draftID := next.ID
	if err = mgr.deleteRecord(book.ID, draftID); err != nil {
		t.Fatalf("delete draft failed: %v", err)
	}
	records, err := mgr.listRecords(book.ID)
	if err != nil {
		t.Fatalf("list records after delete failed: %v", err)
	}
	for _, item := range records {
		if item.ID == draftID {
			t.Fatalf("deleted draft should be removed from list: %+v", item)
		}
	}
	if err = mgr.deleteRecord(book.ID, confirmed.ID); err == nil || !strings.Contains(err.Error(), "only draft") {
		t.Fatalf("confirmed record should not be deleted, got %v", err)
	}
}

func TestMoneyRecordIntervalAndReconcileActualValue(t *testing.T) {
	mgr := newTestMoneyBookMgr(t)
	book, err := mgr.createBook("家庭账本", "admin")
	if err != nil {
		t.Fatalf("create book failed: %v", err)
	}
	items := testMoneyItems(book.ID)
	if _, err = mgr.updateItems(book.ID, items); err != nil {
		t.Fatalf("update items failed: %v", err)
	}
	if _, err = mgr.updateBook(moneyBookUpdateReq{
		ID:                      book.ID,
		Name:                    book.Name,
		PrimaryBalanceAccountID: "alipay",
		Enabled:                 true,
	}); err != nil {
		t.Fatalf("update book failed: %v", err)
	}
	first, err := mgr.createRecord(moneyRecordCreateReq{BookID: book.ID, Date: "2026-04-01"}, "admin")
	if err != nil {
		t.Fatalf("create first failed: %v", err)
	}
	for i := range first.Entries {
		if first.Entries[i].ItemID == "alipay" {
			first.Entries[i].ActualValueCents = 100000
			first.Entries[i].CurrentValueCents = 999999
		}
	}
	first, err = mgr.updateRecord(moneyRecordUpdateReq{BookID: book.ID, Record: first.ReconciliationRecord})
	if err != nil {
		t.Fatalf("update first failed: %v", err)
	}
	confirmed, err := mgr.confirmRecord(book.ID, first.ID, "admin")
	if err != nil {
		t.Fatalf("confirm first failed: %v", err)
	}
	for _, entry := range confirmed.Entries {
		if entry.ItemID == "alipay" && entry.CurrentValueCents != entry.ActualValueCents {
			t.Fatalf("reconcile current should equal actual: %+v", entry)
		}
	}
	second, err := mgr.createRecord(moneyRecordCreateReq{BookID: book.ID, Date: "2026-04-10"}, "admin")
	if err != nil {
		t.Fatalf("create second failed: %v", err)
	}
	if second.IntervalDays != 9 {
		t.Fatalf("expected real interval 9 days, got %d", second.IntervalDays)
	}
}

func TestMoneyDashboardPermission(t *testing.T) {
	mgr := newTestMoneyBookMgr(t)
	book, err := mgr.createBook("家庭账本", "admin")
	if err != nil {
		t.Fatalf("create book failed: %v", err)
	}
	book, err = mgr.grantDashboard(book.ID, []string{"viewer"})
	if err != nil {
		t.Fatalf("grant failed: %v", err)
	}
	if _, err = mgr.dashboard(book.ID, "viewer", false); err != nil {
		t.Fatalf("viewer should access dashboard: %v", err)
	}
	if _, err = mgr.dashboard(book.ID, "guest", false); err == nil || err.Error() != "no permission" {
		t.Fatalf("guest should be denied, got %v", err)
	}
	if _, err = mgr.dashboard(book.ID, "admin", true); err != nil {
		t.Fatalf("admin should access dashboard: %v", err)
	}
}

func TestMoneyBookDeleteHidesBook(t *testing.T) {
	mgr := newTestMoneyBookMgr(t)
	book, err := mgr.createBook("家庭账本", "admin")
	if err != nil {
		t.Fatalf("create book failed: %v", err)
	}
	if err = mgr.deleteBook(book.ID); err != nil {
		t.Fatalf("delete book failed: %v", err)
	}
	books, err := mgr.listBooks("admin", true)
	if err != nil {
		t.Fatalf("list books failed: %v", err)
	}
	for _, item := range books {
		if item.ID == book.ID {
			t.Fatalf("deleted book should be hidden from list: %+v", item)
		}
	}
}

func TestExcelImportPreviewAndConfirmDedup(t *testing.T) {
	mgr := newTestMoneyBookMgr(t)
	book, err := mgr.createBook("家庭账本", "admin")
	if err != nil {
		t.Fatalf("create book failed: %v", err)
	}
	payload := base64.StdEncoding.EncodeToString(buildTinyXLSX(t))
	preview, err := mgr.previewExcelImport(moneyImportExcelPreviewReq{
		BookID:     book.ID,
		FileName:   "家庭账户.xlsx",
		FileBase64: payload,
	})
	if err != nil {
		t.Fatalf("preview failed: %v", err)
	}
	if len(preview.Sheets) != 1 {
		t.Fatalf("expected 1 sheet, got %d", len(preview.Sheets))
	}
	if preview.Sheets[0].Date != "2026-04-06" {
		t.Fatalf("unexpected date: %s", preview.Sheets[0].Date)
	}
	resp, err := mgr.confirmExcelImport(moneyImportExcelConfirmReq{BookID: book.ID, PreviewID: preview.ID}, "admin")
	if err != nil {
		t.Fatalf("confirm failed: %v", err)
	}
	if len(resp.Created) != 1 {
		t.Fatalf("expected 1 created, got %+v", resp)
	}
	imported, err := mgr.getRecord(book.ID, resp.Created[0].ID)
	if err != nil {
		t.Fatalf("get imported record failed: %v", err)
	}
	if len(imported.Entries) == 0 {
		t.Fatal("imported record should contain computable entries")
	}
	resp, err = mgr.confirmExcelImport(moneyImportExcelConfirmReq{BookID: book.ID, PreviewID: preview.ID}, "admin")
	if err != nil {
		t.Fatalf("second confirm failed: %v", err)
	}
	if len(resp.Created) != 0 || len(resp.SkippedSheets) != 1 {
		t.Fatalf("expected duplicate skip, got %+v", resp)
	}
}

func TestExcelImportRealWorkbookWhenProvided(t *testing.T) {
	path := os.Getenv("MONEY_REAL_XLSX")
	if path == "" {
		t.Skip("MONEY_REAL_XLSX not set")
	}
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read real workbook failed: %v", err)
	}
	mgr := newTestMoneyBookMgr(t)
	book, err := mgr.createBook("真实 Excel 导入验证", "admin")
	if err != nil {
		t.Fatalf("create book failed: %v", err)
	}
	preview, err := mgr.previewExcelImport(moneyImportExcelPreviewReq{
		BookID:     book.ID,
		FileName:   filepath.Base(path),
		FileBase64: base64.StdEncoding.EncodeToString(data),
	})
	if err != nil {
		t.Fatalf("preview real workbook failed: %v", err)
	}
	if len(preview.Sheets) == 0 {
		t.Fatalf("expected at least one date sheet, warnings=%v", preview.Warnings)
	}
	for _, sheet := range preview.Sheets {
		if !sheet.Valid {
			t.Fatalf("sheet should be valid: %+v", sheet)
		}
		if sheet.Date == "" || sheet.RowsRead == 0 {
			t.Fatalf("sheet missing date or rows: %+v", sheet)
		}
	}
	resp, err := mgr.confirmExcelImport(moneyImportExcelConfirmReq{BookID: book.ID, PreviewID: preview.ID}, "admin")
	if err != nil {
		t.Fatalf("confirm real workbook failed: %v", err)
	}
	if len(resp.Created) != len(preview.Sheets) {
		t.Fatalf("created count mismatch: sheets=%d created=%d skipped=%v", len(preview.Sheets), len(resp.Created), resp.SkippedSheets)
	}
	again, err := mgr.confirmExcelImport(moneyImportExcelConfirmReq{BookID: book.ID, PreviewID: preview.ID}, "admin")
	if err != nil {
		t.Fatalf("confirm real workbook again failed: %v", err)
	}
	if len(again.Created) != 0 || len(again.SkippedSheets) != len(preview.Sheets) {
		t.Fatalf("expected duplicate skip for all sheets, got %+v", again)
	}
	t.Logf("real workbook sheets=%d first=%s last=%s", len(preview.Sheets), preview.Sheets[0].SheetName, preview.Sheets[len(preview.Sheets)-1].SheetName)
}

func TestMoneyBookArchiveExportImport(t *testing.T) {
	mgr := newTestMoneyBookMgr(t)
	book, err := mgr.createBook("家庭账本", "admin")
	if err != nil {
		t.Fatalf("create book failed: %v", err)
	}
	items := testMoneyItems(book.ID)
	if _, err = mgr.updateItems(book.ID, items); err != nil {
		t.Fatalf("update items failed: %v", err)
	}
	book, err = mgr.updateBook(moneyBookUpdateReq{
		ID:                      book.ID,
		Name:                    book.Name,
		PrimaryBalanceAccountID: "alipay",
		Enabled:                 true,
		ViewerUsers:             []string{"viewer2", "viewer1"},
	})
	if err != nil {
		t.Fatalf("update book failed: %v", err)
	}
	record, err := mgr.createRecord(moneyRecordCreateReq{BookID: book.ID, Date: "2026-04-01"}, "admin")
	if err != nil {
		t.Fatalf("create record failed: %v", err)
	}
	for i := range record.Entries {
		if record.Entries[i].ItemID == "alipay" {
			record.Entries[i].ActualValueCents = 100000
		}
	}
	if _, err = mgr.updateRecord(moneyRecordUpdateReq{BookID: book.ID, Record: record.ReconciliationRecord}); err != nil {
		t.Fatalf("update record failed: %v", err)
	}
	if _, err = mgr.confirmRecord(book.ID, record.ID, "admin"); err != nil {
		t.Fatalf("confirm record failed: %v", err)
	}
	archive, err := mgr.exportBookArchive(book.ID)
	if err != nil {
		t.Fatalf("export archive failed: %v", err)
	}
	if len(archive.Items) != len(items) || len(archive.Records) != 1 {
		t.Fatalf("unexpected archive content: items=%d records=%d", len(archive.Items), len(archive.Records))
	}
	archiveBytes, err := json.Marshal(archive)
	if err != nil {
		t.Fatalf("marshal archive failed: %v", err)
	}
	archiveJSON := string(archiveBytes)
	for _, unexpected := range []string{"intervalDays", "summary"} {
		if strings.Contains(archiveJSON, unexpected) {
			t.Fatalf("archive should not persist derived field %q: %s", unexpected, archiveJSON)
		}
	}
	imported, err := mgr.importBookArchive(archive, "admin")
	if err != nil {
		t.Fatalf("import archive failed: %v", err)
	}
	if imported.ID == book.ID || !strings.Contains(imported.Name, "导入") {
		t.Fatalf("import should clone to a new book: %+v", imported)
	}
	importedItems, err := mgr.listItems(imported.ID)
	if err != nil {
		t.Fatalf("list imported items failed: %v", err)
	}
	if len(importedItems) != len(items) {
		t.Fatalf("imported item count mismatch: %d", len(importedItems))
	}
	importedRecords, err := mgr.listRecords(imported.ID)
	if err != nil {
		t.Fatalf("list imported records failed: %v", err)
	}
	if len(importedRecords) != 1 || importedRecords[0].Status != moneyBookStatusConfirmed {
		t.Fatalf("imported records mismatch: %+v", importedRecords)
	}
}

func TestMoneyAPIAdminAndViewerPermissions(t *testing.T) {
	gin.SetMode(gin.TestMode)
	mgr := newTestMoneyBookMgr(t)
	web := &webMgr{plat: mgr.plat}
	web.jwt.SetSalt("test-salt", "2026-04")
	router := gin.New()
	router.POST("/misc/money/book/create", web.moneyBookCreate)
	router.POST("/misc/money/book/grant-dashboard", web.moneyBookGrantDashboard)
	router.POST("/misc/money/book/export-json", web.moneyBookExportJSON)
	router.POST("/misc/money/book/import-json", web.moneyBookImportJSON)
	router.POST("/misc/money/dashboard/get", web.moneyDashboardGet)
	router.POST("/misc/money/record/list", web.moneyRecordList)

	createResp := performMoneyPost(t, router, web, "admin", []string{"admin"}, "/misc/money/book/create", map[string]string{"name": "家庭账本"})
	if createResp.Code != 0 {
		t.Fatalf("create failed: %+v", createResp)
	}
	var createData moneyBookMutationResp
	marshalBack(t, createResp.Data, &createData)
	bookID := createData.Book.ID
	items := testMoneyItems(bookID)
	if _, err := mgr.updateItems(bookID, items); err != nil {
		t.Fatalf("update items failed: %v", err)
	}
	if _, err := mgr.updateBook(moneyBookUpdateReq{
		ID:                      bookID,
		Name:                    createData.Book.Name,
		PrimaryBalanceAccountID: "alipay",
		Enabled:                 true,
	}); err != nil {
		t.Fatalf("update book failed: %v", err)
	}
	record, err := mgr.createRecord(moneyRecordCreateReq{BookID: bookID, Date: "2026-04-01"}, "admin")
	if err != nil {
		t.Fatalf("create record failed: %v", err)
	}
	for i := range record.Entries {
		switch record.Entries[i].ItemID {
		case "alipay":
			record.Entries[i].BookValueCents = 120000
			record.Entries[i].ActualValueCents = 120000
			record.Entries[i].CurrentValueCents = 120000
		case "credit":
			record.Entries[i].BookValueCents = 20000
			record.Entries[i].ActualValueCents = 20000
			record.Entries[i].CurrentValueCents = 20000
		}
	}
	record, err = mgr.updateRecord(moneyRecordUpdateReq{BookID: bookID, Record: record.ReconciliationRecord})
	if err != nil {
		t.Fatalf("update record failed: %v", err)
	}
	if _, err = mgr.confirmRecord(bookID, record.ID, "admin"); err != nil {
		t.Fatalf("confirm record failed: %v", err)
	}

	grantResp := performMoneyPost(t, router, web, "admin", []string{"admin"}, "/misc/money/book/grant-dashboard", moneyBookGrantDashboardReq{
		BookID:      bookID,
		ViewerUsers: []string{"viewer"},
	})
	if grantResp.Code != 0 {
		t.Fatalf("grant failed: %+v", grantResp)
	}
	exportResp := performMoneyPost(t, router, web, "admin", []string{"admin"}, "/misc/money/book/export-json", moneyBookExportReq{BookID: bookID})
	if exportResp.Code != 0 {
		t.Fatalf("export json should pass: %+v", exportResp)
	}
	var exportData moneyBookExportResp
	marshalBack(t, exportResp.Data, &exportData)
	importResp := performMoneyPost(t, router, web, "admin", []string{"admin"}, "/misc/money/book/import-json", moneyBookImportReq{Archive: exportData.Archive})
	if importResp.Code != 0 {
		t.Fatalf("import json should pass: %+v", importResp)
	}

	viewerDashboard := performMoneyPost(t, router, web, "viewer", []string{}, "/misc/money/dashboard/get", moneyDashboardReq{BookID: bookID})
	if viewerDashboard.Code != 0 {
		t.Fatalf("viewer dashboard should pass: %+v", viewerDashboard)
	}
	dashboardBytes, err := json.Marshal(viewerDashboard.Data)
	if err != nil {
		t.Fatalf("marshal dashboard response failed: %v", err)
	}
	if strings.Contains(string(dashboardBytes), "summary") {
		t.Fatalf("dashboard response should not return backend summary: %s", string(dashboardBytes))
	}
	var dashboardData moneyDashboardResp
	marshalBack(t, viewerDashboard.Data, &dashboardData)
	if len(dashboardData.Items) == 0 || len(dashboardData.Records) != 1 || len(dashboardData.Records[0].Entries) == 0 {
		t.Fatalf("viewer dashboard must include raw items and records for frontend-derived metrics: %+v", dashboardData)
	}
	if dashboardData.LatestRecordID == "" || dashboardData.LatestDate != "2026-04-01" {
		t.Fatalf("viewer dashboard latest record mismatch: %+v", dashboardData)
	}
	viewerExport := performMoneyPost(t, router, web, "viewer", []string{}, "/misc/money/book/export-json", moneyBookExportReq{BookID: bookID})
	if viewerExport.Code == 0 || viewerExport.Msg != "no permission" {
		t.Fatalf("viewer export should be denied: %+v", viewerExport)
	}
	viewerRecordList := performMoneyPost(t, router, web, "viewer", []string{}, "/misc/money/record/list", moneyRecordListReq{BookID: bookID})
	if viewerRecordList.Code == 0 || viewerRecordList.Msg != "no permission" {
		t.Fatalf("viewer record list should be denied: %+v", viewerRecordList)
	}
}

func performMoneyPost(t *testing.T, router *gin.Engine, web *webMgr, user string, permissions []string, path string, body interface{}) uniReturn {
	t.Helper()
	bodyBytes, err := json.Marshal(body)
	if err != nil {
		t.Fatalf("marshal body failed: %v", err)
	}
	req := httptest.NewRequest(http.MethodPost, path, bytes.NewReader(bodyBytes))
	req.Header.Set("Content-Type", "application/json")
	data := token.Data{
		User:       user,
		Permission: permissions,
		ValidTime:  time.Now().Add(time.Hour).Unix(),
	}
	data.Token = web.jwt.GenToken(data.User, data.Permission, data.ValidTime)
	cookieBytes, err := json.Marshal(data)
	if err != nil {
		t.Fatalf("marshal cookie failed: %v", err)
	}
	req.Header.Set("Cookie", "token="+url.QueryEscape(string(cookieBytes)))
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, req)
	if recorder.Code != http.StatusOK {
		t.Fatalf("unexpected status %d: %s", recorder.Code, recorder.Body.String())
	}
	var ret uniReturn
	if err = json.Unmarshal(recorder.Body.Bytes(), &ret); err != nil {
		t.Fatalf("unmarshal response failed: %v body=%s", err, recorder.Body.String())
	}
	return ret
}

func marshalBack(t *testing.T, value interface{}, out interface{}) {
	t.Helper()
	data, err := json.Marshal(value)
	if err != nil {
		t.Fatalf("marshal back failed: %v", err)
	}
	if err = json.Unmarshal(data, out); err != nil {
		t.Fatalf("unmarshal back failed: %v", err)
	}
}

func buildTinyXLSX(t *testing.T) []byte {
	t.Helper()
	var buf bytes.Buffer
	zw := zip.NewWriter(&buf)
	files := map[string]string{
		"xl/workbook.xml": `<?xml version="1.0" encoding="UTF-8"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets><sheet name="26-04-06" sheetId="1" r:id="rId1"/></sheets>
</workbook>`,
		"xl/_rels/workbook.xml.rels": `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
</Relationships>`,
		"xl/worksheets/sheet1.xml": `<?xml version="1.0" encoding="UTF-8"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetData>
    <row r="1"><c r="A1" t="inlineStr"><is><t>现金</t></is></c><c r="B1"><v>1234.56</v></c></row>
    <row r="2"><c r="A2" t="inlineStr"><is><t>净资产</t></is></c><c r="B2"><v>10000</v></c></row>
    <row r="3"><c r="A3" t="inlineStr"><is><t>负债</t></is></c><c r="B3"><v>2000</v></c></row>
  </sheetData>
</worksheet>`,
	}
	for name, content := range files {
		w, err := zw.Create(name)
		if err != nil {
			t.Fatalf("create zip entry failed: %v", err)
		}
		if _, err = w.Write([]byte(content)); err != nil {
			t.Fatalf("write zip entry failed: %v", err)
		}
	}
	if err := zw.Close(); err != nil {
		t.Fatalf("close zip failed: %v", err)
	}
	return buf.Bytes()
}
