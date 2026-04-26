package platform

import (
	"archive/zip"
	"bytes"
	"encoding/base64"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
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

func TestComputeMoneyBatch(t *testing.T) {
	book := MoneyBook{ID: "book", Name: "家庭账本", PrimaryBalanceAccountID: "alipay", Enabled: true}
	items := testMoneyItems(book.ID)
	prev := ReconciliationBatch{
		ID:     "prev",
		BookID: book.ID,
		Date:   "2026-03-01",
		Status: moneyBookStatusConfirmed,
		Summary: MoneySummary{
			NetAssetCents: 5000000,
		},
		Entries: []ReconciliationEntry{
			{ItemID: "fund", CurrentValueCents: 1000000},
		},
	}
	batch := ReconciliationBatch{
		ID:           "batch",
		BookID:       book.ID,
		Date:         "2026-04-01",
		Status:       moneyBookStatusDraft,
		IntervalDays: 31,
		Entries: []ReconciliationEntry{
			{ItemID: "alipay", BookValueCents: 100000, ActualValueCents: 98000, CurrentValueCents: 98000},
			{ItemID: "wechat", BookValueCents: 20000, ActualValueCents: 25000, CurrentValueCents: 25000},
			{ItemID: "credit", BookValueCents: 30000, ActualValueCents: 20000, CurrentValueCents: 20000},
			{ItemID: "fund", PreviousValueCents: 1000000, CurrentValueCents: 1100000},
			{ItemID: "loan", CurrentValueCents: 2000000},
		},
	}
	result, err := ComputeMoneyBatch(book, items, &prev, batch)
	if err != nil {
		t.Fatalf("compute failed: %v", err)
	}
	if result.Summary.CashCents != 123000 {
		t.Fatalf("unexpected cash: %d", result.Summary.CashCents)
	}
	if result.Summary.LiabilityCents != 2020000 {
		t.Fatalf("unexpected liability: %d", result.Summary.LiabilityCents)
	}
	if result.Summary.InvestmentProfitCents != 100000 {
		t.Fatalf("unexpected investment profit: %d", result.Summary.InvestmentProfitCents)
	}
	if result.Summary.NetAssetCents != -797000 {
		t.Fatalf("unexpected net asset: %d", result.Summary.NetAssetCents)
	}
	if len(result.BalanceSuggestions) != 3 {
		t.Fatalf("expected 3 suggestions, got %d: %+v", len(result.BalanceSuggestions), result.BalanceSuggestions)
	}
	if result.Summary.UnknownIncomeCents != 13000 {
		t.Fatalf("expected unknown income 13000, got %d", result.Summary.UnknownIncomeCents)
	}
}

func TestMoneyBookBatchLifecycleAndLocking(t *testing.T) {
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
	batch, err := mgr.createBatch(moneyBatchCreateReq{BookID: book.ID, Date: "2026-04-01", IntervalDays: 30}, "admin")
	if err != nil {
		t.Fatalf("create batch failed: %v", err)
	}
	for i := range batch.Entries {
		switch batch.Entries[i].ItemID {
		case "alipay":
			batch.Entries[i].BookValueCents = 100000
			batch.Entries[i].ActualValueCents = 100000
			batch.Entries[i].CurrentValueCents = 100000
		case "fund":
			batch.Entries[i].CurrentValueCents = 1000000
		}
	}
	batch, err = mgr.updateBatch(moneyBatchUpdateReq{BookID: book.ID, Batch: batch})
	if err != nil {
		t.Fatalf("update batch failed: %v", err)
	}
	confirmed, err := mgr.confirmBatch(book.ID, batch.ID, "admin")
	if err != nil {
		t.Fatalf("confirm failed: %v", err)
	}
	if confirmed.Status != moneyBookStatusConfirmed || confirmed.ConfirmedBy != "admin" {
		t.Fatalf("unexpected confirmed batch: %+v", confirmed)
	}
	_, err = mgr.updateBatch(moneyBatchUpdateReq{BookID: book.ID, Batch: confirmed})
	if err == nil || !strings.Contains(err.Error(), "locked") {
		t.Fatalf("expected locked update error, got %v", err)
	}
	next, err := mgr.createBatch(moneyBatchCreateReq{BookID: book.ID, Date: "2026-05-01"}, "admin")
	if err != nil {
		t.Fatalf("create next failed: %v", err)
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
	resp, err = mgr.confirmExcelImport(moneyImportExcelConfirmReq{BookID: book.ID, PreviewID: preview.ID}, "admin")
	if err != nil {
		t.Fatalf("second confirm failed: %v", err)
	}
	if len(resp.Created) != 0 || len(resp.SkippedSheets) != 1 {
		t.Fatalf("expected duplicate skip, got %+v", resp)
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
	router.POST("/misc/money/dashboard/get", web.moneyDashboardGet)
	router.POST("/misc/money/batch/list", web.moneyBatchList)

	createResp := performMoneyPost(t, router, web, "admin", []string{"admin"}, "/misc/money/book/create", map[string]string{"name": "家庭账本"})
	if createResp.Code != 0 {
		t.Fatalf("create failed: %+v", createResp)
	}
	var createData moneyBookMutationResp
	marshalBack(t, createResp.Data, &createData)
	bookID := createData.Book.ID

	grantResp := performMoneyPost(t, router, web, "admin", []string{"admin"}, "/misc/money/book/grant-dashboard", moneyBookGrantDashboardReq{
		BookID:      bookID,
		ViewerUsers: []string{"viewer"},
	})
	if grantResp.Code != 0 {
		t.Fatalf("grant failed: %+v", grantResp)
	}

	viewerDashboard := performMoneyPost(t, router, web, "viewer", []string{}, "/misc/money/dashboard/get", moneyDashboardReq{BookID: bookID})
	if viewerDashboard.Code != 0 {
		t.Fatalf("viewer dashboard should pass: %+v", viewerDashboard)
	}
	viewerBatchList := performMoneyPost(t, router, web, "viewer", []string{}, "/misc/money/batch/list", moneyBatchListReq{BookID: bookID})
	if viewerBatchList.Code == 0 || viewerBatchList.Msg != "no permission" {
		t.Fatalf("viewer batch list should be denied: %+v", viewerBatchList)
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
