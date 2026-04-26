package platform

import (
	"encoding/base64"
	"encoding/xml"
	"errors"
	"fmt"
	"io"
	"math"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"archive/zip"

	"github.com/google/uuid"
	"github.com/intmian/mian_go_lib/xstorage"
)

const (
	moneySchemaVersion = 1

	moneyBookStatusDraft     = "draft"
	moneyBookStatusConfirmed = "confirmed"

	moneyItemTypeCashAccount     = "cash_account"
	moneyItemTypeDebtAccount     = "debt_account"
	moneyItemTypeInvestment      = "investment"
	moneyItemTypeForeignCash     = "foreign_cash"
	moneyItemTypeForeignExchange = "foreign_exchange"
	moneyItemTypeCrypto          = "crypto"
	moneyItemTypeFixedAsset      = "fixed_asset"
	moneyItemTypeLiability       = "liability"
	moneyItemTypeReceivable      = "receivable"

	moneySourceManual      = "manual"
	moneySourceExcelImport = "excel_import"
)

type MoneyBook struct {
	SchemaVersion           int       `json:"schemaVersion"`
	ID                      string    `json:"id"`
	Name                    string    `json:"name"`
	PrimaryBalanceAccountID string    `json:"primaryBalanceAccountId"`
	Enabled                 bool      `json:"enabled"`
	ViewerUsers             []string  `json:"viewerUsers"`
	CreatedAt               time.Time `json:"createdAt"`
	UpdatedAt               time.Time `json:"updatedAt"`
}

type moneyBookIndexItem struct {
	ID        string    `json:"id"`
	Name      string    `json:"name"`
	Enabled   bool      `json:"enabled"`
	UpdatedAt time.Time `json:"updatedAt"`
}

type MoneyItem struct {
	ID                        string `json:"id"`
	BookID                    string `json:"bookId"`
	Name                      string `json:"name"`
	Type                      string `json:"type"`
	Enabled                   bool   `json:"enabled"`
	Sort                      int    `json:"sort"`
	IncludeInReconcile        bool   `json:"includeInReconcile"`
	IncludeInCash             bool   `json:"includeInCash"`
	IncludeInInvestmentProfit bool   `json:"includeInInvestmentProfit"`
	IncludeInNetAsset         bool   `json:"includeInNetAsset"`
	IncludeInLiability        bool   `json:"includeInLiability"`
	Note                      string `json:"note"`
}

type ReconciliationBatch struct {
	SchemaVersion      int                   `json:"schemaVersion"`
	ID                 string                `json:"id"`
	BookID             string                `json:"bookId"`
	Date               string                `json:"date"`
	Status             string                `json:"status"`
	IntervalDays       int                   `json:"intervalDays"`
	Entries            []ReconciliationEntry `json:"entries"`
	BalanceSuggestions []BalanceSuggestion   `json:"balanceSuggestions"`
	Summary            MoneySummary          `json:"summary"`
	Events             []MoneyEvent          `json:"events"`
	Source             string                `json:"source"`
	SourceRef          string                `json:"sourceRef"`
	CreatedBy          string                `json:"createdBy"`
	ConfirmedBy        string                `json:"confirmedBy"`
	CreatedAt          time.Time             `json:"createdAt"`
	UpdatedAt          time.Time             `json:"updatedAt"`
	ConfirmedAt        time.Time             `json:"confirmedAt"`
}

type ReconciliationEntry struct {
	ItemID             string  `json:"itemId"`
	ItemNameSnapshot   string  `json:"itemNameSnapshot"`
	ItemTypeSnapshot   string  `json:"itemTypeSnapshot"`
	PreviousValueCents int64   `json:"previousValueCents"`
	CurrentValueCents  int64   `json:"currentValueCents"`
	BookValueCents     int64   `json:"bookValueCents"`
	ActualValueCents   int64   `json:"actualValueCents"`
	ChangeCents        int64   `json:"changeCents"`
	AnnualizedRate     float64 `json:"annualizedRate"`
	Note               string  `json:"note"`
}

type BalanceSuggestion struct {
	ID               string `json:"id"`
	Type             string `json:"type"`
	FromItemID       string `json:"fromItemId"`
	FromItemName     string `json:"fromItemName"`
	ToItemID         string `json:"toItemId"`
	ToItemName       string `json:"toItemName"`
	BookValueCents   int64  `json:"bookValueCents"`
	ActualValueCents int64  `json:"actualValueCents"`
	DiffCents        int64  `json:"diffCents"`
	Message          string `json:"message"`
}

type MoneySummary struct {
	CashCents                  int64    `json:"cashCents"`
	NetAssetCents              int64    `json:"netAssetCents"`
	LiabilityCents             int64    `json:"liabilityCents"`
	TotalAssetCents            int64    `json:"totalAssetCents"`
	NetAssetChangeCents        int64    `json:"netAssetChangeCents"`
	InvestmentProfitCents      int64    `json:"investmentProfitCents"`
	NetAssetLiabilityRate      float64  `json:"netAssetLiabilityRate"`
	AssetLiabilityRate         float64  `json:"assetLiabilityRate"`
	PositiveAssetCents         int64    `json:"positiveAssetCents"`
	UnknownIncomeCents         int64    `json:"unknownIncomeCents"`
	UnknownExpenseCents        int64    `json:"unknownExpenseCents"`
	CalculationWarningMessages []string `json:"calculationWarningMessages"`
}

type MoneyEvent struct {
	ID      string `json:"id"`
	Date    string `json:"date"`
	Content string `json:"content"`
}

type moneyBatchIndexItem struct {
	ID                    string    `json:"id"`
	BookID                string    `json:"bookId"`
	Date                  string    `json:"date"`
	Status                string    `json:"status"`
	NetAssetCents         int64     `json:"netAssetCents"`
	NetAssetChangeCents   int64     `json:"netAssetChangeCents"`
	InvestmentProfitCents int64     `json:"investmentProfitCents"`
	AssetLiabilityRate    float64   `json:"assetLiabilityRate"`
	CreatedBy             string    `json:"createdBy"`
	ConfirmedBy           string    `json:"confirmedBy"`
	CreatedAt             time.Time `json:"createdAt"`
	ConfirmedAt           time.Time `json:"confirmedAt"`
	Source                string    `json:"source"`
	SourceRef             string    `json:"sourceRef"`
}

type moneyBookMgr struct {
	plat *PlatForm
	mu   sync.Mutex
}

func newMoneyBookMgr(plat *PlatForm) *moneyBookMgr {
	return &moneyBookMgr{plat: plat}
}

func moneyBooksKey() string {
	return "misc.money.books"
}

func moneyBookKey(bookID string) string {
	return fmt.Sprintf("misc.money.book.%s", bookID)
}

func moneyItemsKey(bookID string) string {
	return fmt.Sprintf("misc.money.book.%s.items", bookID)
}

func moneyBatchesKey(bookID string) string {
	return fmt.Sprintf("misc.money.book.%s.batches", bookID)
}

func moneyBatchKey(bookID, batchID string) string {
	return fmt.Sprintf("misc.money.book.%s.batch.%s", bookID, batchID)
}

func moneyImportPreviewKey(bookID, previewID string) string {
	return fmt.Sprintf("misc.money.book.%s.import.preview.%s", bookID, previewID)
}

func normalizeMoneyDate(raw string) string {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return time.Now().Format("2006-01-02")
	}
	if t, err := time.Parse("2006-01-02", raw); err == nil {
		return t.Format("2006-01-02")
	}
	return raw
}

func (m *moneyBookMgr) loadBookIndexLocked() ([]moneyBookIndexItem, error) {
	var items []moneyBookIndexItem
	err := m.plat.storage.GetFromJson(moneyBooksKey(), &items)
	if err != nil {
		if errors.Is(err, xstorage.ErrNoData) {
			return []moneyBookIndexItem{}, nil
		}
		return nil, err
	}
	return items, nil
}

func (m *moneyBookMgr) saveBookIndexLocked(items []moneyBookIndexItem) error {
	sort.Slice(items, func(i, j int) bool {
		return items[i].UpdatedAt.After(items[j].UpdatedAt)
	})
	return m.plat.storage.SetToJson(moneyBooksKey(), items)
}

func (m *moneyBookMgr) loadBookLocked(bookID string) (MoneyBook, error) {
	var book MoneyBook
	err := m.plat.storage.GetFromJson(moneyBookKey(bookID), &book)
	if err != nil {
		return MoneyBook{}, err
	}
	return book, nil
}

func (m *moneyBookMgr) saveBookLocked(book MoneyBook) error {
	if err := m.plat.storage.SetToJson(moneyBookKey(book.ID), book); err != nil {
		return err
	}
	index, err := m.loadBookIndexLocked()
	if err != nil {
		return err
	}
	found := false
	for i := range index {
		if index[i].ID == book.ID {
			index[i].Name = book.Name
			index[i].Enabled = book.Enabled
			index[i].UpdatedAt = book.UpdatedAt
			found = true
			break
		}
	}
	if !found {
		index = append(index, moneyBookIndexItem{
			ID:        book.ID,
			Name:      book.Name,
			Enabled:   book.Enabled,
			UpdatedAt: book.UpdatedAt,
		})
	}
	return m.saveBookIndexLocked(index)
}

func (m *moneyBookMgr) listBooks(user string, admin bool) ([]MoneyBook, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	index, err := m.loadBookIndexLocked()
	if err != nil {
		return nil, err
	}
	books := make([]MoneyBook, 0, len(index))
	for _, rec := range index {
		book, err := m.loadBookLocked(rec.ID)
		if err != nil {
			continue
		}
		if !book.Enabled && !admin {
			continue
		}
		if admin || containsString(book.ViewerUsers, user) {
			books = append(books, book)
		}
	}
	return books, nil
}

func (m *moneyBookMgr) createBook(name, user string) (MoneyBook, error) {
	name = strings.TrimSpace(name)
	if name == "" {
		return MoneyBook{}, errors.New("name is empty")
	}
	now := time.Now()
	book := MoneyBook{
		SchemaVersion: moneySchemaVersion,
		ID:            uuid.NewString(),
		Name:          name,
		Enabled:       true,
		ViewerUsers:   []string{},
		CreatedAt:     now,
		UpdatedAt:     now,
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	if err := m.saveBookLocked(book); err != nil {
		return MoneyBook{}, err
	}
	return book, nil
}

func (m *moneyBookMgr) updateBook(req moneyBookUpdateReq) (MoneyBook, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	book, err := m.loadBookLocked(req.ID)
	if err != nil {
		return MoneyBook{}, err
	}
	name := strings.TrimSpace(req.Name)
	if name == "" {
		return MoneyBook{}, errors.New("name is empty")
	}
	book.Name = name
	book.PrimaryBalanceAccountID = strings.TrimSpace(req.PrimaryBalanceAccountID)
	book.Enabled = req.Enabled
	book.ViewerUsers = normalizeStringList(req.ViewerUsers)
	book.UpdatedAt = time.Now()
	if err = m.saveBookLocked(book); err != nil {
		return MoneyBook{}, err
	}
	return book, nil
}

func (m *moneyBookMgr) deleteBook(bookID string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	book, err := m.loadBookLocked(bookID)
	if err != nil {
		return err
	}
	book.Enabled = false
	book.UpdatedAt = time.Now()
	return m.saveBookLocked(book)
}

func (m *moneyBookMgr) grantDashboard(bookID string, users []string) (MoneyBook, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	book, err := m.loadBookLocked(bookID)
	if err != nil {
		return MoneyBook{}, err
	}
	book.ViewerUsers = normalizeStringList(users)
	book.UpdatedAt = time.Now()
	if err = m.saveBookLocked(book); err != nil {
		return MoneyBook{}, err
	}
	return book, nil
}

func (m *moneyBookMgr) loadItemsLocked(bookID string) ([]MoneyItem, error) {
	var items []MoneyItem
	err := m.plat.storage.GetFromJson(moneyItemsKey(bookID), &items)
	if err != nil {
		if errors.Is(err, xstorage.ErrNoData) {
			return []MoneyItem{}, nil
		}
		return nil, err
	}
	sortMoneyItems(items)
	return items, nil
}

func (m *moneyBookMgr) saveItemsLocked(bookID string, items []MoneyItem) error {
	for i := range items {
		items[i] = normalizeMoneyItem(bookID, items[i], i)
	}
	sortMoneyItems(items)
	return m.plat.storage.SetToJson(moneyItemsKey(bookID), items)
}

func (m *moneyBookMgr) listItems(bookID string) ([]MoneyItem, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if _, err := m.loadBookLocked(bookID); err != nil {
		return nil, err
	}
	return m.loadItemsLocked(bookID)
}

func (m *moneyBookMgr) updateItems(bookID string, items []MoneyItem) ([]MoneyItem, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if _, err := m.loadBookLocked(bookID); err != nil {
		return nil, err
	}
	if err := m.saveItemsLocked(bookID, items); err != nil {
		return nil, err
	}
	return m.loadItemsLocked(bookID)
}

func normalizeMoneyItem(bookID string, item MoneyItem, idx int) MoneyItem {
	item.BookID = bookID
	item.Name = strings.TrimSpace(item.Name)
	if item.ID == "" {
		item.ID = uuid.NewString()
	}
	if item.Type == "" {
		item.Type = moneyItemTypeCashAccount
	}
	if item.Sort == 0 {
		item.Sort = idx + 1
	}
	return item
}

func sortMoneyItems(items []MoneyItem) {
	sort.SliceStable(items, func(i, j int) bool {
		if items[i].Sort == items[j].Sort {
			return items[i].Name < items[j].Name
		}
		return items[i].Sort < items[j].Sort
	})
}

func (m *moneyBookMgr) loadBatchIndexLocked(bookID string) ([]moneyBatchIndexItem, error) {
	var items []moneyBatchIndexItem
	err := m.plat.storage.GetFromJson(moneyBatchesKey(bookID), &items)
	if err != nil {
		if errors.Is(err, xstorage.ErrNoData) {
			return []moneyBatchIndexItem{}, nil
		}
		return nil, err
	}
	sortBatchIndexDesc(items)
	return items, nil
}

func (m *moneyBookMgr) saveBatchIndexLocked(bookID string, items []moneyBatchIndexItem) error {
	sortBatchIndexDesc(items)
	return m.plat.storage.SetToJson(moneyBatchesKey(bookID), items)
}

func sortBatchIndexDesc(items []moneyBatchIndexItem) {
	sort.SliceStable(items, func(i, j int) bool {
		if items[i].Date == items[j].Date {
			return items[i].CreatedAt.After(items[j].CreatedAt)
		}
		return items[i].Date > items[j].Date
	})
}

func (m *moneyBookMgr) loadBatchLocked(bookID, batchID string) (ReconciliationBatch, error) {
	var batch ReconciliationBatch
	err := m.plat.storage.GetFromJson(moneyBatchKey(bookID, batchID), &batch)
	if err != nil {
		return ReconciliationBatch{}, err
	}
	return batch, nil
}

func (m *moneyBookMgr) saveBatchLocked(batch ReconciliationBatch) error {
	if err := m.plat.storage.SetToJson(moneyBatchKey(batch.BookID, batch.ID), batch); err != nil {
		return err
	}
	index, err := m.loadBatchIndexLocked(batch.BookID)
	if err != nil {
		return err
	}
	rec := batch.toIndexItem()
	found := false
	for i := range index {
		if index[i].ID == batch.ID {
			index[i] = rec
			found = true
			break
		}
	}
	if !found {
		index = append(index, rec)
	}
	return m.saveBatchIndexLocked(batch.BookID, index)
}

func (b ReconciliationBatch) toIndexItem() moneyBatchIndexItem {
	return moneyBatchIndexItem{
		ID:                    b.ID,
		BookID:                b.BookID,
		Date:                  b.Date,
		Status:                b.Status,
		NetAssetCents:         b.Summary.NetAssetCents,
		NetAssetChangeCents:   b.Summary.NetAssetChangeCents,
		InvestmentProfitCents: b.Summary.InvestmentProfitCents,
		AssetLiabilityRate:    b.Summary.AssetLiabilityRate,
		CreatedBy:             b.CreatedBy,
		ConfirmedBy:           b.ConfirmedBy,
		CreatedAt:             b.CreatedAt,
		ConfirmedAt:           b.ConfirmedAt,
		Source:                b.Source,
		SourceRef:             b.SourceRef,
	}
}

func (m *moneyBookMgr) listBatches(bookID string) ([]moneyBatchIndexItem, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if _, err := m.loadBookLocked(bookID); err != nil {
		return nil, err
	}
	return m.loadBatchIndexLocked(bookID)
}

func (m *moneyBookMgr) createBatch(req moneyBatchCreateReq, user string) (ReconciliationBatch, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	book, err := m.loadBookLocked(req.BookID)
	if err != nil {
		return ReconciliationBatch{}, err
	}
	items, err := m.loadItemsLocked(book.ID)
	if err != nil {
		return ReconciliationBatch{}, err
	}
	var prev *ReconciliationBatch
	if req.CopyFromBatchID != "" {
		b, err := m.loadBatchLocked(book.ID, req.CopyFromBatchID)
		if err != nil {
			return ReconciliationBatch{}, err
		}
		prev = &b
	} else if b, ok, err := m.latestConfirmedBatchLocked(book.ID, "", ""); err != nil {
		return ReconciliationBatch{}, err
	} else if ok {
		prev = &b
	}
	now := time.Now()
	batch := ReconciliationBatch{
		SchemaVersion: moneySchemaVersion,
		ID:            uuid.NewString(),
		BookID:        book.ID,
		Date:          normalizeMoneyDate(req.Date),
		Status:        moneyBookStatusDraft,
		IntervalDays:  defaultIntervalDays(req.IntervalDays),
		Entries:       buildInitialEntries(items, prev),
		Events:        []MoneyEvent{},
		Source:        moneySourceManual,
		CreatedBy:     user,
		CreatedAt:     now,
		UpdatedAt:     now,
	}
	if err = m.saveBatchLocked(batch); err != nil {
		return ReconciliationBatch{}, err
	}
	return batch, nil
}

func defaultIntervalDays(days int) int {
	if days <= 0 {
		return 30
	}
	return days
}

func buildInitialEntries(items []MoneyItem, prev *ReconciliationBatch) []ReconciliationEntry {
	prevValues := map[string]int64{}
	if prev != nil {
		for _, entry := range prev.Entries {
			prevValues[entry.ItemID] = entry.CurrentValueCents
		}
	}
	entries := make([]ReconciliationEntry, 0, len(items))
	for _, item := range items {
		if !item.Enabled {
			continue
		}
		prevValue := prevValues[item.ID]
		entry := ReconciliationEntry{
			ItemID:             item.ID,
			ItemNameSnapshot:   item.Name,
			ItemTypeSnapshot:   item.Type,
			PreviousValueCents: prevValue,
			CurrentValueCents:  prevValue,
			BookValueCents:     prevValue,
			ActualValueCents:   prevValue,
		}
		entries = append(entries, entry)
	}
	return entries
}

func (m *moneyBookMgr) getBatch(bookID, batchID string) (ReconciliationBatch, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.loadBatchLocked(bookID, batchID)
}

func (m *moneyBookMgr) updateBatch(req moneyBatchUpdateReq) (ReconciliationBatch, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	batch, err := m.loadBatchLocked(req.BookID, req.Batch.ID)
	if err != nil {
		return ReconciliationBatch{}, err
	}
	if batch.Status != moneyBookStatusDraft {
		return ReconciliationBatch{}, errors.New("confirmed batch is locked")
	}
	req.Batch.SchemaVersion = moneySchemaVersion
	req.Batch.ID = batch.ID
	req.Batch.BookID = batch.BookID
	req.Batch.Status = moneyBookStatusDraft
	req.Batch.Source = batch.Source
	req.Batch.SourceRef = batch.SourceRef
	req.Batch.CreatedBy = batch.CreatedBy
	req.Batch.CreatedAt = batch.CreatedAt
	req.Batch.Date = normalizeMoneyDate(req.Batch.Date)
	req.Batch.IntervalDays = defaultIntervalDays(req.Batch.IntervalDays)
	req.Batch.UpdatedAt = time.Now()
	normalizeBatchEvents(&req.Batch)
	if err = m.saveBatchLocked(req.Batch); err != nil {
		return ReconciliationBatch{}, err
	}
	return req.Batch, nil
}

func normalizeBatchEvents(batch *ReconciliationBatch) {
	for i := range batch.Events {
		if batch.Events[i].ID == "" {
			batch.Events[i].ID = uuid.NewString()
		}
		if batch.Events[i].Date == "" {
			batch.Events[i].Date = batch.Date
		}
		batch.Events[i].Content = strings.TrimSpace(batch.Events[i].Content)
	}
	next := batch.Events[:0]
	for _, event := range batch.Events {
		if event.Content != "" {
			next = append(next, event)
		}
	}
	batch.Events = next
}

func (m *moneyBookMgr) computeBatch(bookID, batchID string, save bool) (ReconciliationBatch, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	book, err := m.loadBookLocked(bookID)
	if err != nil {
		return ReconciliationBatch{}, err
	}
	items, err := m.loadItemsLocked(bookID)
	if err != nil {
		return ReconciliationBatch{}, err
	}
	batch, err := m.loadBatchLocked(bookID, batchID)
	if err != nil {
		return ReconciliationBatch{}, err
	}
	prev, ok, err := m.latestConfirmedBatchLocked(bookID, batch.Date, batch.ID)
	if err != nil {
		return ReconciliationBatch{}, err
	}
	var prevPtr *ReconciliationBatch
	if ok {
		prevPtr = &prev
	}
	result, err := ComputeMoneyBatch(book, items, prevPtr, batch)
	if err != nil {
		return ReconciliationBatch{}, err
	}
	batch.Entries = result.Entries
	batch.BalanceSuggestions = result.BalanceSuggestions
	batch.Summary = result.Summary
	batch.UpdatedAt = time.Now()
	if save {
		if err = m.saveBatchLocked(batch); err != nil {
			return ReconciliationBatch{}, err
		}
	}
	return batch, nil
}

func (m *moneyBookMgr) confirmBatch(bookID, batchID, user string) (ReconciliationBatch, error) {
	batch, err := m.computeBatch(bookID, batchID, true)
	if err != nil {
		return ReconciliationBatch{}, err
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	batch, err = m.loadBatchLocked(bookID, batchID)
	if err != nil {
		return ReconciliationBatch{}, err
	}
	now := time.Now()
	batch.Status = moneyBookStatusConfirmed
	batch.ConfirmedBy = user
	batch.ConfirmedAt = now
	batch.UpdatedAt = now
	if err = m.saveBatchLocked(batch); err != nil {
		return ReconciliationBatch{}, err
	}
	return batch, nil
}

func (m *moneyBookMgr) latestConfirmedBatchLocked(bookID, beforeDate, excludeBatchID string) (ReconciliationBatch, bool, error) {
	index, err := m.loadBatchIndexLocked(bookID)
	if err != nil {
		return ReconciliationBatch{}, false, err
	}
	candidates := make([]moneyBatchIndexItem, 0, len(index))
	for _, item := range index {
		if item.Status != moneyBookStatusConfirmed || item.ID == excludeBatchID {
			continue
		}
		if beforeDate != "" && item.Date >= beforeDate {
			continue
		}
		candidates = append(candidates, item)
	}
	sort.SliceStable(candidates, func(i, j int) bool {
		return candidates[i].Date > candidates[j].Date
	})
	if len(candidates) == 0 {
		return ReconciliationBatch{}, false, nil
	}
	batch, err := m.loadBatchLocked(bookID, candidates[0].ID)
	if err != nil {
		return ReconciliationBatch{}, false, err
	}
	return batch, true, nil
}

func (m *moneyBookMgr) dashboard(bookID, user string, admin bool) (moneyDashboardResp, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	book, err := m.loadBookLocked(bookID)
	if err != nil {
		return moneyDashboardResp{}, err
	}
	if !admin && !containsString(book.ViewerUsers, user) {
		return moneyDashboardResp{}, errors.New("no permission")
	}
	index, err := m.loadBatchIndexLocked(bookID)
	if err != nil {
		return moneyDashboardResp{}, err
	}
	confirmed := make([]moneyBatchIndexItem, 0, len(index))
	for _, item := range index {
		if item.Status == moneyBookStatusConfirmed {
			confirmed = append(confirmed, item)
		}
	}
	sort.SliceStable(confirmed, func(i, j int) bool {
		return confirmed[i].Date < confirmed[j].Date
	})
	resp := moneyDashboardResp{
		Book:               book,
		Trends:             []moneyDashboardTrendItem{},
		Events:             []MoneyEvent{},
		AssetStructure:     []moneyDashboardStructureItem{},
		LiabilityStructure: []moneyDashboardStructureItem{},
	}
	for _, item := range confirmed {
		resp.Trends = append(resp.Trends, moneyDashboardTrendItem{
			Date:                  item.Date,
			CashCents:             0,
			NetAssetCents:         item.NetAssetCents,
			LiabilityCents:        0,
			TotalAssetCents:       0,
			InvestmentProfitCents: item.InvestmentProfitCents,
			AssetLiabilityRate:    item.AssetLiabilityRate,
		})
	}
	if len(confirmed) == 0 {
		return resp, nil
	}
	latestIndex := confirmed[len(confirmed)-1]
	latest, err := m.loadBatchLocked(bookID, latestIndex.ID)
	if err != nil {
		return moneyDashboardResp{}, err
	}
	resp.LatestBatchID = latest.ID
	resp.LatestDate = latest.Date
	resp.Summary = latest.Summary
	for i := range resp.Trends {
		if resp.Trends[i].Date == latest.Date {
			resp.Trends[i].CashCents = latest.Summary.CashCents
			resp.Trends[i].LiabilityCents = latest.Summary.LiabilityCents
			resp.Trends[i].TotalAssetCents = latest.Summary.TotalAssetCents
		}
	}
	for _, item := range confirmed {
		batch, err := m.loadBatchLocked(bookID, item.ID)
		if err != nil {
			continue
		}
		for _, event := range batch.Events {
			if strings.TrimSpace(event.Content) != "" {
				resp.Events = append(resp.Events, event)
			}
		}
	}
	resp.AssetStructure, resp.LiabilityStructure = buildDashboardStructure(latest)
	return resp, nil
}

func buildDashboardStructure(batch ReconciliationBatch) ([]moneyDashboardStructureItem, []moneyDashboardStructureItem) {
	assetMap := map[string]int64{}
	liabilityMap := map[string]int64{}
	for _, entry := range batch.Entries {
		switch entry.ItemTypeSnapshot {
		case moneyItemTypeLiability, moneyItemTypeDebtAccount:
			liabilityMap[moneyItemTypeLabel(entry.ItemTypeSnapshot)] += entry.CurrentValueCents
		default:
			if entry.CurrentValueCents > 0 {
				assetMap[moneyItemTypeLabel(entry.ItemTypeSnapshot)] += entry.CurrentValueCents
			}
		}
	}
	return mapToStructureItems(assetMap), mapToStructureItems(liabilityMap)
}

func mapToStructureItems(values map[string]int64) []moneyDashboardStructureItem {
	items := make([]moneyDashboardStructureItem, 0, len(values))
	for name, value := range values {
		if value != 0 {
			items = append(items, moneyDashboardStructureItem{Name: name, ValueCents: value})
		}
	}
	sort.SliceStable(items, func(i, j int) bool {
		return items[i].ValueCents > items[j].ValueCents
	})
	return items
}

func moneyItemTypeLabel(typ string) string {
	switch typ {
	case moneyItemTypeCashAccount:
		return "现金账户"
	case moneyItemTypeDebtAccount:
		return "对账负债账户"
	case moneyItemTypeInvestment:
		return "投资"
	case moneyItemTypeForeignCash:
		return "外币现钞"
	case moneyItemTypeForeignExchange:
		return "外币现汇"
	case moneyItemTypeCrypto:
		return "虚拟币"
	case moneyItemTypeFixedAsset:
		return "固定资产"
	case moneyItemTypeLiability:
		return "负债"
	case moneyItemTypeReceivable:
		return "债权"
	default:
		return "其他"
	}
}

type MoneyComputeResult struct {
	Entries            []ReconciliationEntry `json:"entries"`
	BalanceSuggestions []BalanceSuggestion   `json:"balanceSuggestions"`
	Summary            MoneySummary          `json:"summary"`
}

func ComputeMoneyBatch(book MoneyBook, items []MoneyItem, prev *ReconciliationBatch, batch ReconciliationBatch) (MoneyComputeResult, error) {
	if batch.IntervalDays <= 0 {
		return MoneyComputeResult{}, errors.New("intervalDays invalid")
	}
	itemMap := make(map[string]MoneyItem, len(items))
	for _, item := range items {
		itemMap[item.ID] = item
	}
	prevNetAsset := int64(0)
	prevValues := map[string]int64{}
	if prev != nil {
		prevNetAsset = prev.Summary.NetAssetCents
		for _, entry := range prev.Entries {
			prevValues[entry.ItemID] = entry.CurrentValueCents
		}
	}
	entries := make([]ReconciliationEntry, 0, len(batch.Entries))
	for _, entry := range batch.Entries {
		item, ok := itemMap[entry.ItemID]
		if !ok {
			item = MoneyItem{ID: entry.ItemID, Name: entry.ItemNameSnapshot, Type: entry.ItemTypeSnapshot, Enabled: true}
		}
		entry.ItemNameSnapshot = item.Name
		entry.ItemTypeSnapshot = item.Type
		if entry.PreviousValueCents == 0 {
			entry.PreviousValueCents = prevValues[entry.ItemID]
		}
		entry.ChangeCents = entry.CurrentValueCents - entry.PreviousValueCents
		if item.IncludeInInvestmentProfit && entry.CurrentValueCents != 0 {
			entry.AnnualizedRate = roundRate((float64(entry.ChangeCents) / float64(entry.CurrentValueCents)) * 365 / float64(batch.IntervalDays))
		} else {
			entry.AnnualizedRate = 0
		}
		entries = append(entries, entry)
	}
	result := MoneyComputeResult{Entries: entries}
	result.BalanceSuggestions, result.Summary.UnknownIncomeCents, result.Summary.UnknownExpenseCents = computeBalanceSuggestions(book, itemMap, entries)
	summary, warnings := computeMoneySummary(itemMap, entries, prevNetAsset, batch.IntervalDays)
	summary.UnknownIncomeCents = result.Summary.UnknownIncomeCents
	summary.UnknownExpenseCents = result.Summary.UnknownExpenseCents
	summary.CalculationWarningMessages = warnings
	result.Summary = summary
	return result, nil
}

func computeBalanceSuggestions(book MoneyBook, itemMap map[string]MoneyItem, entries []ReconciliationEntry) ([]BalanceSuggestion, int64, int64) {
	entryMap := map[string]ReconciliationEntry{}
	for _, entry := range entries {
		entryMap[entry.ItemID] = entry
	}
	primary, ok := entryMap[book.PrimaryBalanceAccountID]
	if !ok || book.PrimaryBalanceAccountID == "" {
		return []BalanceSuggestion{}, 0, 0
	}
	primaryItem := itemMap[primary.ItemID]
	primaryBook := effectiveReconcileValue(primaryItem, primary.BookValueCents)
	primaryActual := effectiveReconcileValue(primaryItem, primary.ActualValueCents)
	sumDiff := int64(0)
	suggestions := []BalanceSuggestion{}
	for _, entry := range entries {
		if entry.ItemID == book.PrimaryBalanceAccountID {
			continue
		}
		item := itemMap[entry.ItemID]
		if !item.IncludeInReconcile {
			continue
		}
		bookValue := effectiveReconcileValue(item, entry.BookValueCents)
		actualValue := effectiveReconcileValue(item, entry.ActualValueCents)
		diff := actualValue - bookValue
		if diff == 0 {
			continue
		}
		sumDiff += diff
		suggestion := BalanceSuggestion{
			ID:               uuid.NewString(),
			Type:             "transfer",
			BookValueCents:   entry.BookValueCents,
			ActualValueCents: entry.ActualValueCents,
			DiffCents:        absInt64(diff),
		}
		if diff > 0 {
			suggestion.FromItemID = primary.ItemID
			suggestion.FromItemName = primary.ItemNameSnapshot
			suggestion.ToItemID = entry.ItemID
			suggestion.ToItemName = entry.ItemNameSnapshot
			suggestion.Message = fmt.Sprintf("%s 转入 %s %s", primary.ItemNameSnapshot, entry.ItemNameSnapshot, formatCents(absInt64(diff)))
		} else {
			suggestion.FromItemID = entry.ItemID
			suggestion.FromItemName = entry.ItemNameSnapshot
			suggestion.ToItemID = primary.ItemID
			suggestion.ToItemName = primary.ItemNameSnapshot
			suggestion.Message = fmt.Sprintf("%s 转入 %s %s", entry.ItemNameSnapshot, primary.ItemNameSnapshot, formatCents(absInt64(diff)))
		}
		suggestions = append(suggestions, suggestion)
	}
	primaryTheoretical := primaryBook - sumDiff
	unknown := primaryActual - primaryTheoretical
	unknownIncome := int64(0)
	unknownExpense := int64(0)
	if unknown != 0 {
		suggestion := BalanceSuggestion{
			ID:               uuid.NewString(),
			BookValueCents:   primary.BookValueCents,
			ActualValueCents: primary.ActualValueCents,
			DiffCents:        absInt64(unknown),
		}
		if unknown > 0 {
			unknownIncome = unknown
			suggestion.Type = "unknown_income"
			suggestion.ToItemID = primary.ItemID
			suggestion.ToItemName = primary.ItemNameSnapshot
			suggestion.Message = fmt.Sprintf("未知来源收入 %s", formatCents(unknown))
		} else {
			unknownExpense = absInt64(unknown)
			suggestion.Type = "unknown_expense"
			suggestion.FromItemID = primary.ItemID
			suggestion.FromItemName = primary.ItemNameSnapshot
			suggestion.Message = fmt.Sprintf("未知去向支出 %s", formatCents(absInt64(unknown)))
		}
		suggestions = append(suggestions, suggestion)
	}
	return suggestions, unknownIncome, unknownExpense
}

func effectiveReconcileValue(item MoneyItem, value int64) int64 {
	if item.Type == moneyItemTypeDebtAccount {
		return -value
	}
	return value
}

func computeMoneySummary(itemMap map[string]MoneyItem, entries []ReconciliationEntry, prevNetAsset int64, intervalDays int) (MoneySummary, []string) {
	summary := MoneySummary{}
	warnings := []string{}
	for _, entry := range entries {
		item := itemMap[entry.ItemID]
		if item.IncludeInCash {
			summary.CashCents += entry.CurrentValueCents
		}
		if item.IncludeInLiability {
			summary.LiabilityCents += entry.CurrentValueCents
		}
		if item.IncludeInNetAsset && !item.IncludeInLiability {
			summary.PositiveAssetCents += entry.CurrentValueCents
		}
		if item.IncludeInInvestmentProfit {
			summary.InvestmentProfitCents += entry.CurrentValueCents - entry.PreviousValueCents
			if entry.CurrentValueCents == 0 {
				warnings = append(warnings, fmt.Sprintf("%s 当期值为 0，年化变化率按 0 处理", entry.ItemNameSnapshot))
			}
		}
	}
	summary.NetAssetCents = summary.PositiveAssetCents - summary.LiabilityCents
	summary.TotalAssetCents = summary.NetAssetCents + summary.LiabilityCents
	summary.NetAssetChangeCents = summary.NetAssetCents - prevNetAsset
	if summary.NetAssetCents != 0 {
		summary.NetAssetLiabilityRate = roundRate(float64(summary.LiabilityCents) / float64(summary.NetAssetCents))
	}
	if summary.TotalAssetCents != 0 {
		summary.AssetLiabilityRate = roundRate(float64(summary.LiabilityCents) / float64(summary.TotalAssetCents))
	}
	return summary, warnings
}

func roundRate(v float64) float64 {
	if math.IsNaN(v) || math.IsInf(v, 0) {
		return 0
	}
	return math.Round(v*10000) / 10000
}

func absInt64(v int64) int64 {
	if v < 0 {
		return -v
	}
	return v
}

func formatCents(v int64) string {
	return fmt.Sprintf("%.2f", float64(v)/100)
}

func containsString(items []string, want string) bool {
	for _, item := range items {
		if item == want {
			return true
		}
	}
	return false
}

func normalizeStringList(values []string) []string {
	seen := map[string]bool{}
	next := []string{}
	for _, value := range values {
		value = strings.TrimSpace(value)
		if value == "" || seen[value] {
			continue
		}
		seen[value] = true
		next = append(next, value)
	}
	sort.Strings(next)
	return next
}

type moneyImportPreview struct {
	ID        string                    `json:"id"`
	BookID    string                    `json:"bookId"`
	FileName  string                    `json:"fileName"`
	Sheets    []moneyImportPreviewSheet `json:"sheets"`
	Warnings  []string                  `json:"warnings"`
	CreatedAt time.Time                 `json:"createdAt"`
}

type moneyImportPreviewSheet struct {
	SheetName string       `json:"sheetName"`
	Date      string       `json:"date"`
	Valid     bool         `json:"valid"`
	Warnings  []string     `json:"warnings"`
	Summary   MoneySummary `json:"summary"`
	Events    []MoneyEvent `json:"events"`
	RowsRead  int          `json:"rowsRead"`
}

func (m *moneyBookMgr) previewExcelImport(req moneyImportExcelPreviewReq) (moneyImportPreview, error) {
	if strings.TrimSpace(req.BookID) == "" {
		return moneyImportPreview{}, errors.New("bookId is empty")
	}
	data, err := decodeBase64Payload(req.FileBase64)
	if err != nil {
		return moneyImportPreview{}, err
	}
	bookID := req.BookID
	m.mu.Lock()
	defer m.mu.Unlock()
	if _, err = m.loadBookLocked(bookID); err != nil {
		return moneyImportPreview{}, err
	}
	sheets, warnings, err := parseMoneyExcelWorkbook(data)
	if err != nil {
		return moneyImportPreview{}, err
	}
	preview := moneyImportPreview{
		ID:        uuid.NewString(),
		BookID:    bookID,
		FileName:  strings.TrimSpace(req.FileName),
		Sheets:    sheets,
		Warnings:  warnings,
		CreatedAt: time.Now(),
	}
	if err = m.plat.storage.SetToJson(moneyImportPreviewKey(bookID, preview.ID), preview); err != nil {
		return moneyImportPreview{}, err
	}
	return preview, nil
}

func decodeBase64Payload(raw string) ([]byte, error) {
	raw = strings.TrimSpace(raw)
	if idx := strings.Index(raw, ","); strings.HasPrefix(raw, "data:") && idx >= 0 {
		raw = raw[idx+1:]
	}
	if raw == "" {
		return nil, errors.New("file is empty")
	}
	return base64.StdEncoding.DecodeString(raw)
}

func (m *moneyBookMgr) confirmExcelImport(req moneyImportExcelConfirmReq, user string) (moneyImportConfirmResp, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	var preview moneyImportPreview
	if err := m.plat.storage.GetFromJson(moneyImportPreviewKey(req.BookID, req.PreviewID), &preview); err != nil {
		return moneyImportConfirmResp{}, err
	}
	if preview.BookID != req.BookID {
		return moneyImportConfirmResp{}, errors.New("preview not match")
	}
	index, err := m.loadBatchIndexLocked(req.BookID)
	if err != nil {
		return moneyImportConfirmResp{}, err
	}
	exists := map[string]bool{}
	for _, item := range index {
		if item.Source == moneySourceExcelImport && item.SourceRef != "" {
			exists[item.SourceRef] = true
		}
	}
	now := time.Now()
	created := []moneyBatchIndexItem{}
	skipped := []string{}
	for _, sheet := range preview.Sheets {
		if !sheet.Valid {
			skipped = append(skipped, sheet.SheetName)
			continue
		}
		if exists[sheet.SheetName] {
			skipped = append(skipped, sheet.SheetName)
			continue
		}
		batch := ReconciliationBatch{
			SchemaVersion: moneySchemaVersion,
			ID:            uuid.NewString(),
			BookID:        req.BookID,
			Date:          sheet.Date,
			Status:        moneyBookStatusConfirmed,
			IntervalDays:  30,
			Entries:       []ReconciliationEntry{},
			Summary:       sheet.Summary,
			Events:        sheet.Events,
			Source:        moneySourceExcelImport,
			SourceRef:     sheet.SheetName,
			CreatedBy:     user,
			ConfirmedBy:   user,
			CreatedAt:     now,
			UpdatedAt:     now,
			ConfirmedAt:   now,
		}
		if err = m.saveBatchLocked(batch); err != nil {
			return moneyImportConfirmResp{}, err
		}
		created = append(created, batch.toIndexItem())
		exists[sheet.SheetName] = true
	}
	return moneyImportConfirmResp{Created: created, SkippedSheets: skipped}, nil
}

type workbookXML struct {
	Sheets []workbookSheetXML `xml:"sheets>sheet"`
}

type workbookSheetXML struct {
	Name string `xml:"name,attr"`
	RID  string `xml:"http://schemas.openxmlformats.org/officeDocument/2006/relationships id,attr"`
}

type relsXML struct {
	Relationships []relXML `xml:"Relationship"`
}

type relXML struct {
	ID     string `xml:"Id,attr"`
	Target string `xml:"Target,attr"`
}

type sharedStringsXML struct {
	Items []sharedStringItemXML `xml:"si"`
}

type sharedStringItemXML struct {
	TextParts []string `xml:".//t"`
}

type worksheetXML struct {
	Rows []worksheetRowXML `xml:"sheetData>row"`
}

type worksheetRowXML struct {
	Cells []worksheetCellXML `xml:"c"`
}

type worksheetCellXML struct {
	Ref        string `xml:"r,attr"`
	Type       string `xml:"t,attr"`
	V          string `xml:"v"`
	InlineText string `xml:"is>t"`
}

func parseMoneyExcelWorkbook(data []byte) ([]moneyImportPreviewSheet, []string, error) {
	reader, err := zip.NewReader(strings.NewReader(string(data)), int64(len(data)))
	if err != nil {
		// strings.NewReader preserves bytes, but zip requires ReaderAt; use bytes reader via helper below.
		return parseMoneyExcelWorkbookBytes(data)
	}
	return parseMoneyExcelZip(reader)
}

func parseMoneyExcelWorkbookBytes(data []byte) ([]moneyImportPreviewSheet, []string, error) {
	reader, err := zip.NewReader(newBytesReaderAt(data), int64(len(data)))
	if err != nil {
		return nil, nil, err
	}
	return parseMoneyExcelZip(reader)
}

type bytesReaderAt struct {
	data []byte
}

func newBytesReaderAt(data []byte) *bytesReaderAt {
	return &bytesReaderAt{data: data}
}

func (r *bytesReaderAt) ReadAt(p []byte, off int64) (int, error) {
	if off >= int64(len(r.data)) {
		return 0, io.EOF
	}
	n := copy(p, r.data[off:])
	if n < len(p) {
		return n, io.EOF
	}
	return n, nil
}

func parseMoneyExcelZip(reader *zip.Reader) ([]moneyImportPreviewSheet, []string, error) {
	files := map[string]*zip.File{}
	for _, file := range reader.File {
		files[file.Name] = file
	}
	wbBytes, err := readZipFile(files, "xl/workbook.xml")
	if err != nil {
		return nil, nil, err
	}
	var wb workbookXML
	if err = xml.Unmarshal(wbBytes, &wb); err != nil {
		return nil, nil, err
	}
	relsBytes, err := readZipFile(files, "xl/_rels/workbook.xml.rels")
	if err != nil {
		return nil, nil, err
	}
	var rels relsXML
	if err = xml.Unmarshal(relsBytes, &rels); err != nil {
		return nil, nil, err
	}
	relTarget := map[string]string{}
	for _, rel := range rels.Relationships {
		target := rel.Target
		if !strings.HasPrefix(target, "xl/") {
			target = "xl/" + strings.TrimPrefix(target, "/")
		}
		relTarget[rel.ID] = target
	}
	sharedStrings := []string{}
	if ssBytes, err := readZipFile(files, "xl/sharedStrings.xml"); err == nil {
		var ss sharedStringsXML
		if err = xml.Unmarshal(ssBytes, &ss); err == nil {
			for _, item := range ss.Items {
				sharedStrings = append(sharedStrings, strings.Join(item.TextParts, ""))
			}
		}
	}
	warnings := []string{}
	sheets := []moneyImportPreviewSheet{}
	for _, sheet := range wb.Sheets {
		date, ok := parseMoneySheetDate(sheet.Name)
		if !ok {
			continue
		}
		target := relTarget[sheet.RID]
		if target == "" {
			warnings = append(warnings, fmt.Sprintf("%s 找不到 worksheet", sheet.Name))
			continue
		}
		wsBytes, err := readZipFile(files, target)
		if err != nil {
			warnings = append(warnings, fmt.Sprintf("%s 读取失败: %v", sheet.Name, err))
			continue
		}
		rows, err := parseWorksheetRows(wsBytes, sharedStrings)
		if err != nil {
			warnings = append(warnings, fmt.Sprintf("%s 解析失败: %v", sheet.Name, err))
			continue
		}
		preview := buildImportSheetPreview(sheet.Name, date, rows)
		sheets = append(sheets, preview)
	}
	if len(sheets) == 0 {
		warnings = append(warnings, "未识别到日期 sheet")
	}
	return sheets, warnings, nil
}

func readZipFile(files map[string]*zip.File, name string) ([]byte, error) {
	file := files[name]
	if file == nil {
		return nil, fmt.Errorf("%s not found", name)
	}
	rc, err := file.Open()
	if err != nil {
		return nil, err
	}
	defer rc.Close()
	return io.ReadAll(rc)
}

func parseWorksheetRows(data []byte, sharedStrings []string) ([][]string, error) {
	var ws worksheetXML
	if err := xml.Unmarshal(data, &ws); err != nil {
		return nil, err
	}
	rows := make([][]string, 0, len(ws.Rows))
	for _, row := range ws.Rows {
		values := []string{}
		for _, cell := range row.Cells {
			value := strings.TrimSpace(cell.V)
			if cell.Type == "inlineStr" {
				value = strings.TrimSpace(cell.InlineText)
			}
			if cell.Type == "s" {
				idx, _ := strconv.Atoi(value)
				if idx >= 0 && idx < len(sharedStrings) {
					value = sharedStrings[idx]
				}
			}
			values = append(values, value)
		}
		rows = append(rows, values)
	}
	return rows, nil
}

func parseMoneySheetDate(name string) (string, bool) {
	re := regexp.MustCompile(`^(\d{2})-(\d{1,2})-(\d{1,2})$`)
	match := re.FindStringSubmatch(strings.TrimSpace(name))
	if len(match) != 4 {
		return "", false
	}
	year, _ := strconv.Atoi(match[1])
	month, _ := strconv.Atoi(match[2])
	day, _ := strconv.Atoi(match[3])
	if month < 1 || month > 12 || day < 1 || day > 31 {
		return "", false
	}
	return fmt.Sprintf("20%02d-%02d-%02d", year, month, day), true
}

func buildImportSheetPreview(sheetName, date string, rows [][]string) moneyImportPreviewSheet {
	preview := moneyImportPreviewSheet{
		SheetName: sheetName,
		Date:      date,
		Valid:     true,
		Warnings:  []string{},
		Events:    []MoneyEvent{},
		RowsRead:  len(rows),
	}
	for _, row := range rows {
		joined := strings.Join(row, " ")
		if strings.Contains(joined, "大事记") {
			continue
		}
		if strings.Contains(joined, "现金") {
			if v, ok := firstNumberInRow(row); ok {
				preview.Summary.CashCents = yuanToCents(v)
			}
		}
		if strings.Contains(joined, "净资产变化") {
			if v, ok := firstNumberInRow(row); ok {
				preview.Summary.NetAssetChangeCents = yuanToCents(v)
			}
			continue
		}
		if strings.Contains(joined, "净资产负债率") {
			if v, ok := firstNumberInRow(row); ok {
				preview.Summary.NetAssetLiabilityRate = roundRate(v)
			}
			continue
		}
		if strings.Contains(joined, "资产负债率") {
			if v, ok := firstNumberInRow(row); ok {
				preview.Summary.AssetLiabilityRate = roundRate(v)
			}
			continue
		}
		if strings.Contains(joined, "净资产") {
			if v, ok := firstNumberInRow(row); ok {
				preview.Summary.NetAssetCents = yuanToCents(v)
			}
		}
		if strings.Contains(joined, "总资产") {
			if v, ok := firstNumberInRow(row); ok {
				preview.Summary.TotalAssetCents = yuanToCents(v)
			}
		}
		if strings.Contains(joined, "负债") {
			if v, ok := firstNumberInRow(row); ok {
				preview.Summary.LiabilityCents = yuanToCents(v)
			}
		}
		if strings.Contains(joined, "投资盈利") {
			if v, ok := firstNumberInRow(row); ok {
				preview.Summary.InvestmentProfitCents = yuanToCents(v)
			}
		}
		for _, cell := range row {
			cell = strings.TrimSpace(cell)
			if len(cell) > 3 && !looksNumeric(cell) && !strings.Contains(cell, "现金") && !strings.Contains(cell, "资产") && !strings.Contains(cell, "负债") {
				if strings.Contains(cell, "：") || strings.Contains(cell, ":") {
					preview.Events = append(preview.Events, MoneyEvent{ID: uuid.NewString(), Date: date, Content: cell})
				}
			}
		}
	}
	if preview.Summary.NetAssetCents == 0 && preview.Summary.CashCents == 0 && preview.Summary.TotalAssetCents == 0 {
		preview.Warnings = append(preview.Warnings, "未识别到汇总金额")
	}
	return preview
}

func firstNumberInRow(row []string) (float64, bool) {
	for _, cell := range row {
		v, ok := parseLooseNumber(cell)
		if ok {
			return v, true
		}
	}
	return 0, false
}

func parseLooseNumber(raw string) (float64, bool) {
	raw = strings.TrimSpace(raw)
	raw = strings.ReplaceAll(raw, ",", "")
	raw = strings.TrimSuffix(raw, "%")
	if raw == "" {
		return 0, false
	}
	v, err := strconv.ParseFloat(raw, 64)
	return v, err == nil
}

func looksNumeric(raw string) bool {
	_, ok := parseLooseNumber(raw)
	return ok
}

func yuanToCents(v float64) int64 {
	return int64(math.Round(v * 100))
}
