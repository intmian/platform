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

	moneyImportItemCash             = "excel_import_cash"
	moneyImportItemOtherAsset       = "excel_import_other_asset"
	moneyImportItemLiability        = "excel_import_liability"
	moneyImportItemInvestmentProfit = "excel_import_investment_profit"
)

type MoneyBook struct {
	SchemaVersion           int       `json:"schemaVersion"`
	ID                      string    `json:"id"`
	Name                    string    `json:"name"`
	PrimaryBalanceAccountID string    `json:"primaryBalanceAccountId"`
	Enabled                 bool      `json:"enabled"`
	Deleted                 bool      `json:"deleted"`
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

type moneyBookArchive struct {
	SchemaVersion int                    `json:"schemaVersion"`
	ExportedAt    time.Time              `json:"exportedAt"`
	Book          MoneyBook              `json:"book"`
	Items         []MoneyItem            `json:"items"`
	Records       []ReconciliationRecord `json:"records"`
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

type ReconciliationRecord struct {
	SchemaVersion int                   `json:"schemaVersion"`
	ID            string                `json:"id"`
	BookID        string                `json:"bookId"`
	Date          string                `json:"date"`
	Status        string                `json:"status"`
	Entries       []ReconciliationEntry `json:"entries"`
	Events        []MoneyEvent          `json:"events"`
	Source        string                `json:"source"`
	SourceRef     string                `json:"sourceRef"`
	CreatedBy     string                `json:"createdBy"`
	ConfirmedBy   string                `json:"confirmedBy"`
	CreatedAt     time.Time             `json:"createdAt"`
	UpdatedAt     time.Time             `json:"updatedAt"`
	ConfirmedAt   time.Time             `json:"confirmedAt"`
}

type ReconciliationRecordView struct {
	ReconciliationRecord
	IntervalDays int `json:"intervalDays"`
}

type ReconciliationEntry struct {
	ItemID                         string  `json:"itemId"`
	ItemNameSnapshot               string  `json:"itemNameSnapshot"`
	ItemTypeSnapshot               string  `json:"itemTypeSnapshot"`
	IncludeInReconcileSnapshot     bool    `json:"includeInReconcileSnapshot"`
	IncludeInLiabilitySnapshot     bool    `json:"includeInLiabilitySnapshot"`
	PreviousValueCents             int64   `json:"previousValueCents"`
	CurrentValueCents              int64   `json:"currentValueCents"`
	BookValueCents                 int64   `json:"bookValueCents"`
	ActualValueCents               int64   `json:"actualValueCents"`
	ChangeCents                    int64   `json:"changeCents"`
	AnnualizedRate                 float64 `json:"annualizedRate"`
	InvestmentPrincipalChangeCents int64   `json:"investmentPrincipalChangeCents"`
	Note                           string  `json:"note"`
}

type moneyImportSummary struct {
	CashCents                  int64    `json:"cashCents"`
	NetAssetCents              int64    `json:"netAssetCents"`
	LiabilityCents             int64    `json:"liabilityCents"`
	TotalAssetCents            int64    `json:"totalAssetCents"`
	NetAssetChangeCents        int64    `json:"netAssetChangeCents"`
	InvestmentProfitCents      int64    `json:"investmentProfitCents"`
	NetAssetLiabilityRate      float64  `json:"netAssetLiabilityRate"`
	AssetLiabilityRate         float64  `json:"assetLiabilityRate"`
	PositiveAssetCents         int64    `json:"positiveAssetCents"`
	CalculationWarningMessages []string `json:"calculationWarningMessages"`
}

type MoneyEvent struct {
	ID      string `json:"id"`
	Date    string `json:"date"`
	Content string `json:"content"`
}

type moneyRecordIndexItem struct {
	ID          string    `json:"id"`
	BookID      string    `json:"bookId"`
	Date        string    `json:"date"`
	Status      string    `json:"status"`
	CreatedBy   string    `json:"createdBy"`
	ConfirmedBy string    `json:"confirmedBy"`
	CreatedAt   time.Time `json:"createdAt"`
	ConfirmedAt time.Time `json:"confirmedAt"`
	Source      string    `json:"source"`
	SourceRef   string    `json:"sourceRef"`
}

type moneyRecordListItem struct {
	ID          string    `json:"id"`
	BookID      string    `json:"bookId"`
	Date        string    `json:"date"`
	Status      string    `json:"status"`
	CreatedBy   string    `json:"createdBy"`
	ConfirmedBy string    `json:"confirmedBy"`
	CreatedAt   time.Time `json:"createdAt"`
	ConfirmedAt time.Time `json:"confirmedAt"`
	Source      string    `json:"source"`
	SourceRef   string    `json:"sourceRef"`
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

func moneyRecordsKey(bookID string) string {
	return fmt.Sprintf("misc.money.book.%s.records", bookID)
}

func moneyRecordKey(bookID, recordID string) string {
	return fmt.Sprintf("misc.money.book.%s.record.%s", bookID, recordID)
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
		if book.Deleted {
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
	book.Deleted = true
	book.UpdatedAt = time.Now()
	return m.saveBookLocked(book)
}

func (m *moneyBookMgr) exportBookArchive(bookID string) (moneyBookArchive, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	book, err := m.loadBookLocked(bookID)
	if err != nil {
		return moneyBookArchive{}, err
	}
	items, err := m.loadItemsLocked(bookID)
	if err != nil {
		return moneyBookArchive{}, err
	}
	index, err := m.loadRecordIndexLocked(bookID)
	if err != nil {
		return moneyBookArchive{}, err
	}
	records := make([]ReconciliationRecord, 0, len(index))
	for _, item := range index {
		record, err := m.loadRecordLocked(bookID, item.ID)
		if err != nil {
			return moneyBookArchive{}, err
		}
		records = append(records, record)
	}
	sort.SliceStable(records, func(i, j int) bool {
		if records[i].Date == records[j].Date {
			return records[i].CreatedAt.Before(records[j].CreatedAt)
		}
		return records[i].Date < records[j].Date
	})
	return moneyBookArchive{
		SchemaVersion: moneySchemaVersion,
		ExportedAt:    time.Now(),
		Book:          book,
		Items:         items,
		Records:       records,
	}, nil
}

func (m *moneyBookMgr) importBookArchive(archive moneyBookArchive, user string) (MoneyBook, error) {
	if archive.Book.Name == "" {
		return MoneyBook{}, errors.New("archive book name is empty")
	}
	now := time.Now()
	book := archive.Book
	book.ID = uuid.NewString()
	book.Name = strings.TrimSpace(book.Name) + "（导入）"
	book.Enabled = true
	book.Deleted = false
	book.CreatedAt = now
	book.UpdatedAt = now
	book.ViewerUsers = normalizeStringList(book.ViewerUsers)
	items := make([]MoneyItem, 0, len(archive.Items))
	for i, item := range archive.Items {
		item.BookID = book.ID
		if item.ID == "" {
			item.ID = uuid.NewString()
		}
		item.Sort = i + 1
		items = append(items, item)
	}
	records := make([]ReconciliationRecord, 0, len(archive.Records))
	for _, record := range archive.Records {
		if record.ID == "" {
			record.ID = uuid.NewString()
		}
		record.BookID = book.ID
		if record.SchemaVersion == 0 {
			record.SchemaVersion = moneySchemaVersion
		}
		if record.CreatedBy == "" {
			record.CreatedBy = user
		}
		if record.Status == moneyBookStatusConfirmed && record.ConfirmedBy == "" {
			record.ConfirmedBy = user
		}
		records = append(records, record)
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	if err := m.saveBookLocked(book); err != nil {
		return MoneyBook{}, err
	}
	if err := m.saveItemsLocked(book.ID, items); err != nil {
		return MoneyBook{}, err
	}
	for _, record := range records {
		if err := m.saveRecordLocked(record); err != nil {
			return MoneyBook{}, err
		}
	}
	return book, nil
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

func (m *moneyBookMgr) loadRecordIndexLocked(bookID string) ([]moneyRecordIndexItem, error) {
	var items []moneyRecordIndexItem
	err := m.plat.storage.GetFromJson(moneyRecordsKey(bookID), &items)
	if err != nil {
		if errors.Is(err, xstorage.ErrNoData) {
			return []moneyRecordIndexItem{}, nil
		}
		return nil, err
	}
	sortRecordIndexDesc(items)
	return items, nil
}

func (m *moneyBookMgr) saveRecordIndexLocked(bookID string, items []moneyRecordIndexItem) error {
	sortRecordIndexDesc(items)
	return m.plat.storage.SetToJson(moneyRecordsKey(bookID), items)
}

func sortRecordIndexDesc(items []moneyRecordIndexItem) {
	sort.SliceStable(items, func(i, j int) bool {
		if items[i].Date == items[j].Date {
			return items[i].CreatedAt.After(items[j].CreatedAt)
		}
		return items[i].Date > items[j].Date
	})
}

func (m *moneyBookMgr) loadRecordLocked(bookID, recordID string) (ReconciliationRecord, error) {
	var record ReconciliationRecord
	err := m.plat.storage.GetFromJson(moneyRecordKey(bookID, recordID), &record)
	if err != nil {
		return ReconciliationRecord{}, err
	}
	return record, nil
}

func (m *moneyBookMgr) saveRecordLocked(record ReconciliationRecord) error {
	if err := m.plat.storage.SetToJson(moneyRecordKey(record.BookID, record.ID), record); err != nil {
		return err
	}
	index, err := m.loadRecordIndexLocked(record.BookID)
	if err != nil {
		return err
	}
	rec := record.toIndexItem()
	found := false
	for i := range index {
		if index[i].ID == record.ID {
			index[i] = rec
			found = true
			break
		}
	}
	if !found {
		index = append(index, rec)
	}
	return m.saveRecordIndexLocked(record.BookID, index)
}

func (m *moneyBookMgr) deleteRecord(bookID, recordID string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	record, err := m.loadRecordLocked(bookID, recordID)
	if err != nil {
		return err
	}
	if record.Status != moneyBookStatusDraft {
		return errors.New("only draft record can be deleted")
	}
	index, err := m.loadRecordIndexLocked(bookID)
	if err != nil {
		return err
	}
	next := index[:0]
	for _, item := range index {
		if item.ID != recordID {
			next = append(next, item)
		}
	}
	if err = m.saveRecordIndexLocked(bookID, next); err != nil {
		return err
	}
	return m.plat.storage.Delete(moneyRecordKey(bookID, recordID))
}

func (b ReconciliationRecord) toIndexItem() moneyRecordIndexItem {
	return moneyRecordIndexItem{
		ID:          b.ID,
		BookID:      b.BookID,
		Date:        b.Date,
		Status:      b.Status,
		CreatedBy:   b.CreatedBy,
		ConfirmedBy: b.ConfirmedBy,
		CreatedAt:   b.CreatedAt,
		ConfirmedAt: b.ConfirmedAt,
		Source:      b.Source,
		SourceRef:   b.SourceRef,
	}
}

func (m *moneyBookMgr) listRecords(bookID string) ([]moneyRecordListItem, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if _, err := m.loadBookLocked(bookID); err != nil {
		return nil, err
	}
	index, err := m.loadRecordIndexLocked(bookID)
	if err != nil {
		return nil, err
	}
	items := make([]moneyRecordListItem, 0, len(index))
	for _, rec := range index {
		items = append(items, moneyRecordListItem{
			ID:          rec.ID,
			BookID:      rec.BookID,
			Date:        rec.Date,
			Status:      rec.Status,
			CreatedBy:   rec.CreatedBy,
			ConfirmedBy: rec.ConfirmedBy,
			CreatedAt:   rec.CreatedAt,
			ConfirmedAt: rec.ConfirmedAt,
			Source:      rec.Source,
			SourceRef:   rec.SourceRef,
		})
	}
	return items, nil
}

func (m *moneyBookMgr) createRecord(req moneyRecordCreateReq, user string) (ReconciliationRecordView, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	book, err := m.loadBookLocked(req.BookID)
	if err != nil {
		return ReconciliationRecordView{}, err
	}
	items, err := m.loadItemsLocked(book.ID)
	if err != nil {
		return ReconciliationRecordView{}, err
	}
	var prev *ReconciliationRecord
	if req.CopyFromRecordID != "" {
		b, err := m.loadRecordLocked(book.ID, req.CopyFromRecordID)
		if err != nil {
			return ReconciliationRecordView{}, err
		}
		prev = &b
	} else if b, ok, err := m.latestConfirmedRecordLocked(book.ID, "", ""); err != nil {
		return ReconciliationRecordView{}, err
	} else if ok {
		prev = &b
	}
	date := normalizeMoneyDate(req.Date)
	now := time.Now()
	record := ReconciliationRecord{
		SchemaVersion: moneySchemaVersion,
		ID:            uuid.NewString(),
		BookID:        book.ID,
		Date:          date,
		Status:        moneyBookStatusDraft,
		Entries:       buildInitialEntries(items, prev),
		Events:        []MoneyEvent{},
		Source:        moneySourceManual,
		CreatedBy:     user,
		CreatedAt:     now,
		UpdatedAt:     now,
	}
	if err = m.saveRecordLocked(record); err != nil {
		return ReconciliationRecordView{}, err
	}
	return m.computeRecordViewLocked(record)
}

func defaultIntervalDays(days int) int {
	if days <= 0 {
		return 30
	}
	return days
}

func intervalDaysBetween(prevDate, currentDate string, fallback int) int {
	prev, errPrev := time.Parse("2006-01-02", prevDate)
	current, errCurrent := time.Parse("2006-01-02", currentDate)
	if errPrev != nil || errCurrent != nil {
		return defaultIntervalDays(fallback)
	}
	days := int(current.Sub(prev).Hours() / 24)
	if days <= 0 {
		return defaultIntervalDays(fallback)
	}
	return days
}

func buildInitialEntries(items []MoneyItem, prev *ReconciliationRecord) []ReconciliationEntry {
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
			ItemID:                     item.ID,
			ItemNameSnapshot:           item.Name,
			ItemTypeSnapshot:           item.Type,
			IncludeInReconcileSnapshot: item.IncludeInReconcile,
			IncludeInLiabilitySnapshot: item.IncludeInLiability,
			PreviousValueCents:         prevValue,
			CurrentValueCents:          prevValue,
			BookValueCents:             prevValue,
			ActualValueCents:           prevValue,
		}
		entries = append(entries, entry)
	}
	return entries
}

func (m *moneyBookMgr) getRecord(bookID, recordID string) (ReconciliationRecordView, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	record, err := m.loadRecordLocked(bookID, recordID)
	if err != nil {
		return ReconciliationRecordView{}, err
	}
	items, err := m.loadItemsLocked(bookID)
	if err != nil {
		return ReconciliationRecordView{}, err
	}
	enrichRecordEntrySnapshots(&record, items)
	return m.computeRecordViewLocked(record)
}

func enrichRecordEntrySnapshots(record *ReconciliationRecord, items []MoneyItem) {
	itemMap := make(map[string]MoneyItem, len(items))
	for _, item := range items {
		itemMap[item.ID] = item
	}
	for i := range record.Entries {
		item, ok := itemMap[record.Entries[i].ItemID]
		if !ok {
			continue
		}
		record.Entries[i].ItemNameSnapshot = item.Name
		record.Entries[i].ItemTypeSnapshot = item.Type
		record.Entries[i].IncludeInReconcileSnapshot = item.IncludeInReconcile
		record.Entries[i].IncludeInLiabilitySnapshot = item.IncludeInLiability
	}
}

func (m *moneyBookMgr) updateRecord(req moneyRecordUpdateReq) (ReconciliationRecordView, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	record, err := m.loadRecordLocked(req.BookID, req.Record.ID)
	if err != nil {
		return ReconciliationRecordView{}, err
	}
	req.Record.SchemaVersion = moneySchemaVersion
	req.Record.ID = record.ID
	req.Record.BookID = record.BookID
	req.Record.Status = record.Status
	req.Record.Source = record.Source
	req.Record.SourceRef = record.SourceRef
	req.Record.CreatedBy = record.CreatedBy
	req.Record.ConfirmedBy = record.ConfirmedBy
	req.Record.CreatedAt = record.CreatedAt
	req.Record.ConfirmedAt = record.ConfirmedAt
	req.Record.Date = normalizeMoneyDate(req.Record.Date)
	req.Record.UpdatedAt = time.Now()
	normalizeRecordEvents(&req.Record)
	items, err := m.loadItemsLocked(req.BookID)
	if err != nil {
		return ReconciliationRecordView{}, err
	}
	enrichRecordEntrySnapshots(&req.Record, items)
	normalizeRecordLiabilityAmounts(&req.Record, items)
	if err = m.saveRecordLocked(req.Record); err != nil {
		return ReconciliationRecordView{}, err
	}
	return m.computeRecordViewLocked(req.Record)
}

func normalizeRecordEvents(record *ReconciliationRecord) {
	for i := range record.Events {
		if record.Events[i].ID == "" {
			record.Events[i].ID = uuid.NewString()
		}
		if record.Events[i].Date == "" {
			record.Events[i].Date = record.Date
		}
		record.Events[i].Content = strings.TrimSpace(record.Events[i].Content)
	}
	next := record.Events[:0]
	for _, event := range record.Events {
		if event.Content != "" {
			next = append(next, event)
		}
	}
	record.Events = next
}

func normalizeRecordLiabilityAmounts(record *ReconciliationRecord, items []MoneyItem) {
	itemMap := make(map[string]MoneyItem, len(items))
	for _, item := range items {
		itemMap[item.ID] = item
	}
	for i := range record.Entries {
		item, ok := itemMap[record.Entries[i].ItemID]
		if !ok {
			item = MoneyItem{
				ID:                 record.Entries[i].ItemID,
				Type:               record.Entries[i].ItemTypeSnapshot,
				IncludeInLiability: record.Entries[i].IncludeInLiabilitySnapshot,
			}
		}
		record.Entries[i].BookValueCents = signedMoneyValue(item, record.Entries[i].BookValueCents)
		record.Entries[i].ActualValueCents = signedMoneyValue(item, record.Entries[i].ActualValueCents)
		record.Entries[i].CurrentValueCents = signedMoneyValue(item, record.Entries[i].CurrentValueCents)
		record.Entries[i].PreviousValueCents = signedMoneyValue(item, record.Entries[i].PreviousValueCents)
	}
}

func (m *moneyBookMgr) computeRecordViewLocked(record ReconciliationRecord) (ReconciliationRecordView, error) {
	items, err := m.loadItemsLocked(record.BookID)
	if err != nil {
		return ReconciliationRecordView{}, err
	}
	prev, ok, err := m.latestConfirmedRecordLocked(record.BookID, record.Date, record.ID)
	if err != nil {
		return ReconciliationRecordView{}, err
	}
	var prevPtr *ReconciliationRecord
	intervalDays := defaultIntervalDays(0)
	if ok {
		prevPtr = &prev
		intervalDays = intervalDaysBetween(prev.Date, record.Date, intervalDays)
	}
	result, err := ComputeMoneyRecord(items, prevPtr, record, intervalDays)
	if err != nil {
		return ReconciliationRecordView{}, err
	}
	record.Entries = result.Entries
	return ReconciliationRecordView{
		ReconciliationRecord: record,
		IntervalDays:         intervalDays,
	}, nil
}

func (m *moneyBookMgr) computeRecord(bookID, recordID string, save bool) (ReconciliationRecordView, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	record, err := m.loadRecordLocked(bookID, recordID)
	if err != nil {
		return ReconciliationRecordView{}, err
	}
	view, err := m.computeRecordViewLocked(record)
	if err != nil {
		return ReconciliationRecordView{}, err
	}
	record = view.ReconciliationRecord
	record.UpdatedAt = time.Now()
	view.UpdatedAt = record.UpdatedAt
	if save {
		if err = m.saveRecordLocked(record); err != nil {
			return ReconciliationRecordView{}, err
		}
	}
	return view, nil
}

func (m *moneyBookMgr) confirmRecord(bookID, recordID, user string) (ReconciliationRecordView, error) {
	view, err := m.computeRecord(bookID, recordID, true)
	if err != nil {
		return ReconciliationRecordView{}, err
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	record, err := m.loadRecordLocked(bookID, recordID)
	if err != nil {
		return ReconciliationRecordView{}, err
	}
	now := time.Now()
	record.Status = moneyBookStatusConfirmed
	record.ConfirmedBy = user
	record.ConfirmedAt = now
	record.UpdatedAt = now
	if err = m.saveRecordLocked(record); err != nil {
		return ReconciliationRecordView{}, err
	}
	view.ReconciliationRecord = record
	return view, nil
}

func (m *moneyBookMgr) latestConfirmedRecordLocked(bookID, beforeDate, excludeRecordID string) (ReconciliationRecord, bool, error) {
	index, err := m.loadRecordIndexLocked(bookID)
	if err != nil {
		return ReconciliationRecord{}, false, err
	}
	candidates := make([]moneyRecordIndexItem, 0, len(index))
	for _, item := range index {
		if item.Status != moneyBookStatusConfirmed || item.ID == excludeRecordID {
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
		return ReconciliationRecord{}, false, nil
	}
	record, err := m.loadRecordLocked(bookID, candidates[0].ID)
	if err != nil {
		return ReconciliationRecord{}, false, err
	}
	return record, true, nil
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
	index, err := m.loadRecordIndexLocked(bookID)
	if err != nil {
		return moneyDashboardResp{}, err
	}
	confirmed := make([]moneyRecordIndexItem, 0, len(index))
	for _, item := range index {
		if item.Status == moneyBookStatusConfirmed {
			confirmed = append(confirmed, item)
		}
	}
	sort.SliceStable(confirmed, func(i, j int) bool {
		return confirmed[i].Date < confirmed[j].Date
	})
	resp := moneyDashboardResp{
		Book:    book,
		Items:   []MoneyItem{},
		Records: []ReconciliationRecordView{},
		Events:  []MoneyEvent{},
	}
	items, err := m.loadItemsLocked(bookID)
	if err != nil {
		return moneyDashboardResp{}, err
	}
	resp.Items = items
	for _, item := range confirmed {
		record, err := m.loadRecordLocked(bookID, item.ID)
		if err != nil {
			continue
		}
		view, err := m.computeRecordViewLocked(record)
		if err != nil {
			return moneyDashboardResp{}, err
		}
		resp.Records = append(resp.Records, view)
	}
	if len(confirmed) == 0 {
		return resp, nil
	}
	latestIndex := confirmed[len(confirmed)-1]
	resp.LatestRecordID = latestIndex.ID
	resp.LatestDate = latestIndex.Date
	for _, item := range confirmed {
		record, err := m.loadRecordLocked(bookID, item.ID)
		if err != nil {
			continue
		}
		for _, event := range record.Events {
			if strings.TrimSpace(event.Content) != "" {
				resp.Events = append(resp.Events, event)
			}
		}
	}
	return resp, nil
}

type MoneyComputeResult struct {
	Entries []ReconciliationEntry `json:"entries"`
}

func ComputeMoneyRecord(items []MoneyItem, prev *ReconciliationRecord, record ReconciliationRecord, intervalDays int) (MoneyComputeResult, error) {
	if intervalDays <= 0 {
		return MoneyComputeResult{}, errors.New("intervalDays invalid")
	}
	itemMap := make(map[string]MoneyItem, len(items))
	for _, item := range items {
		itemMap[item.ID] = item
	}
	prevValues := map[string]int64{}
	if prev != nil {
		for _, entry := range prev.Entries {
			prevValues[entry.ItemID] = signedMoneyValue(itemMap[entry.ItemID], entry.CurrentValueCents)
		}
	}
	entries := make([]ReconciliationEntry, 0, len(record.Entries))
	for _, entry := range record.Entries {
		item, ok := itemMap[entry.ItemID]
		if !ok {
			item = MoneyItem{ID: entry.ItemID, Name: entry.ItemNameSnapshot, Type: entry.ItemTypeSnapshot, Enabled: true}
		}
		entry.ItemNameSnapshot = item.Name
		entry.ItemTypeSnapshot = item.Type
		entry.IncludeInReconcileSnapshot = item.IncludeInReconcile
		entry.IncludeInLiabilitySnapshot = item.IncludeInLiability
		entry.BookValueCents = signedMoneyValue(item, entry.BookValueCents)
		entry.ActualValueCents = signedMoneyValue(item, entry.ActualValueCents)
		entry.CurrentValueCents = signedMoneyValue(item, entry.CurrentValueCents)
		entry.PreviousValueCents = signedMoneyValue(item, entry.PreviousValueCents)
		if item.IncludeInReconcile {
			entry.CurrentValueCents = entry.ActualValueCents
		}
		if entry.PreviousValueCents == 0 {
			entry.PreviousValueCents = prevValues[entry.ItemID]
		}
		entry.ChangeCents = entry.CurrentValueCents - entry.PreviousValueCents
		if item.IncludeInInvestmentProfit && entry.InvestmentPrincipalChangeCents == 0 && entry.CurrentValueCents != 0 {
			entry.AnnualizedRate = roundRate((float64(entry.ChangeCents) / float64(entry.CurrentValueCents)) * 365 / float64(intervalDays))
		} else {
			entry.AnnualizedRate = 0
		}
		entries = append(entries, entry)
	}
	result := MoneyComputeResult{Entries: entries}
	return result, nil
}

func signedMoneyValue(item MoneyItem, value int64) int64 {
	if item.Type == moneyItemTypeDebtAccount || item.IncludeInLiability {
		return -absInt64(value)
	}
	return value
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
	SheetName string             `json:"sheetName"`
	Date      string             `json:"date"`
	Valid     bool               `json:"valid"`
	Warnings  []string           `json:"warnings"`
	Summary   moneyImportSummary `json:"summary"`
	Events    []MoneyEvent       `json:"events"`
	RowsRead  int                `json:"rowsRead"`
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
	index, err := m.loadRecordIndexLocked(req.BookID)
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
	created := []moneyRecordIndexItem{}
	skipped := []string{}
	importItems, err := m.ensureImportSummaryItemsLocked(req.BookID)
	if err != nil {
		return moneyImportConfirmResp{}, err
	}
	for _, sheet := range preview.Sheets {
		if !sheet.Valid {
			skipped = append(skipped, sheet.SheetName)
			continue
		}
		if exists[sheet.SheetName] {
			skipped = append(skipped, sheet.SheetName)
			continue
		}
		record := ReconciliationRecord{
			SchemaVersion: moneySchemaVersion,
			ID:            uuid.NewString(),
			BookID:        req.BookID,
			Date:          sheet.Date,
			Status:        moneyBookStatusConfirmed,
			Entries:       buildImportSummaryEntries(sheet.Summary, importItems),
			Events:        sheet.Events,
			Source:        moneySourceExcelImport,
			SourceRef:     sheet.SheetName,
			CreatedBy:     user,
			ConfirmedBy:   user,
			CreatedAt:     now,
			UpdatedAt:     now,
			ConfirmedAt:   now,
		}
		if err = m.saveRecordLocked(record); err != nil {
			return moneyImportConfirmResp{}, err
		}
		created = append(created, record.toIndexItem())
		exists[sheet.SheetName] = true
	}
	return moneyImportConfirmResp{Created: created, SkippedSheets: skipped}, nil
}

func (m *moneyBookMgr) ensureImportSummaryItemsLocked(bookID string) (map[string]MoneyItem, error) {
	items, err := m.loadItemsLocked(bookID)
	if err != nil {
		return nil, err
	}
	byID := make(map[string]MoneyItem, len(items)+4)
	for _, item := range items {
		byID[item.ID] = item
	}
	defs := []MoneyItem{
		{
			ID:                 moneyImportItemCash,
			Name:               "Excel导入-现金",
			Type:               "现金",
			Enabled:            true,
			IncludeInCash:      true,
			IncludeInNetAsset:  true,
			IncludeInReconcile: false,
		},
		{
			ID:                 moneyImportItemOtherAsset,
			Name:               "Excel导入-其他资产",
			Type:               "资产",
			Enabled:            true,
			IncludeInNetAsset:  true,
			IncludeInReconcile: false,
		},
		{
			ID:                 moneyImportItemLiability,
			Name:               "Excel导入-负债",
			Type:               "负债",
			Enabled:            true,
			IncludeInLiability: true,
			IncludeInReconcile: false,
		},
		{
			ID:                        moneyImportItemInvestmentProfit,
			Name:                      "Excel导入-投资盈利",
			Type:                      "投资",
			Enabled:                   true,
			IncludeInInvestmentProfit: true,
			IncludeInReconcile:        false,
		},
	}
	changed := false
	for _, def := range defs {
		if existing, ok := byID[def.ID]; ok {
			def.Sort = existing.Sort
			def.BookID = bookID
			if existing.Name != def.Name ||
				existing.Type != def.Type ||
				!existing.Enabled ||
				existing.IncludeInCash != def.IncludeInCash ||
				existing.IncludeInNetAsset != def.IncludeInNetAsset ||
				existing.IncludeInLiability != def.IncludeInLiability ||
				existing.IncludeInInvestmentProfit != def.IncludeInInvestmentProfit ||
				existing.IncludeInReconcile != def.IncludeInReconcile {
				for i := range items {
					if items[i].ID == def.ID {
						items[i] = def
						break
					}
				}
				changed = true
			}
		} else {
			def.Sort = len(items) + 1
			def.BookID = bookID
			items = append(items, def)
			changed = true
		}
		byID[def.ID] = def
	}
	if changed {
		if err := m.saveItemsLocked(bookID, items); err != nil {
			return nil, err
		}
	}
	return byID, nil
}

func buildImportSummaryEntries(summary moneyImportSummary, items map[string]MoneyItem) []ReconciliationEntry {
	liability := summary.LiabilityCents
	positiveAsset := summary.NetAssetCents + liability
	if positiveAsset == 0 && summary.TotalAssetCents != 0 {
		positiveAsset = summary.TotalAssetCents
	}
	otherAsset := positiveAsset - summary.CashCents
	values := map[string]int64{
		moneyImportItemCash:             summary.CashCents,
		moneyImportItemOtherAsset:       otherAsset,
		moneyImportItemLiability:        liability,
		moneyImportItemInvestmentProfit: summary.InvestmentProfitCents,
	}
	orderedIDs := []string{
		moneyImportItemCash,
		moneyImportItemOtherAsset,
		moneyImportItemLiability,
		moneyImportItemInvestmentProfit,
	}
	entries := make([]ReconciliationEntry, 0, len(orderedIDs))
	for _, id := range orderedIDs {
		item := items[id]
		value := values[id]
		entry := ReconciliationEntry{
			ItemID:                     id,
			ItemNameSnapshot:           item.Name,
			ItemTypeSnapshot:           item.Type,
			IncludeInReconcileSnapshot: item.IncludeInReconcile,
			IncludeInLiabilitySnapshot: item.IncludeInLiability,
			CurrentValueCents:          value,
			BookValueCents:             value,
			ActualValueCents:           value,
		}
		entries = append(entries, entry)
	}
	return entries
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
