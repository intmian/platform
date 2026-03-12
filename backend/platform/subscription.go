package platform

import (
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"math"
	"mime"
	"net/http"
	"net/url"
	"regexp"
	"slices"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/intmian/mian_go_lib/xstorage"
)

const (
	subscriptionLogTag            = "SUBSCRIPTION"
	subscriptionUsersKey          = "misc.subscription.users"
	subscriptionStatusNever       = "never"
	subscriptionStatusSuccess     = "success"
	subscriptionStatusRequestFail = "request_failed"
	subscriptionStatusParseFail   = "parse_failed"
)

type subscriptionRecord struct {
	ID               string                    `json:"id"`
	User             string                    `json:"user"`
	Name             string                    `json:"name"`
	UpstreamURL      string                    `json:"upstreamUrl"`
	WorkerForwardURL string                    `json:"workerForwardUrl"`
	WorkerEnabled    bool                      `json:"workerForwardEnabled"`
	ShareToken       string                    `json:"shareToken"`
	MonitorEnabled   bool                      `json:"monitorEnabled"`
	CreatedAt        time.Time                 `json:"createdAt"`
	UpdatedAt        time.Time                 `json:"updatedAt"`
	LastCheckAt      time.Time                 `json:"lastCheckAt"`
	LastCheckStatus  string                    `json:"lastCheckStatus"`
	LastError        string                    `json:"lastError"`
	LastTrafficRaw   string                    `json:"lastTrafficRaw"`
	LastUsedBytes    int64                     `json:"lastUsedBytes"`
	LastTotalBytes   int64                     `json:"lastTotalBytes"`
	LastUsagePercent float64                   `json:"lastUsagePercent"`
	LastExpireAt     time.Time                 `json:"lastExpireAt"`
	LastExpireRemain int                       `json:"lastExpireRemainDays"`
	UsageAlerted     subscriptionUsageAlerted  `json:"usageAlerted"`
	ExpireAlerted    subscriptionExpireAlerted `json:"expireAlerted"`
}

type subscriptionUsageAlerted struct {
	Usage80  bool `json:"usage80"`
	Usage90  bool `json:"usage90"`
	Usage100 bool `json:"usage100"`
}

type subscriptionExpireAlerted struct {
	Days7 bool `json:"days7"`
	Days3 bool `json:"days3"`
	Days1 bool `json:"days1"`
}

type subscriptionListItem struct {
	ID               string  `json:"id"`
	Name             string  `json:"name"`
	UpstreamURL      string  `json:"upstreamUrl"`
	WorkerForwardURL string  `json:"workerForwardUrl"`
	WorkerEnabled    bool    `json:"workerForwardEnabled"`
	MonitorEnabled   bool    `json:"monitorEnabled"`
	ShareURL         string  `json:"shareUrl"`
	LastCheckAt      string  `json:"lastCheckAt"`
	LastCheckStatus  string  `json:"lastCheckStatus"`
	LastError        string  `json:"lastError"`
	TrafficSummary   string  `json:"trafficSummary"`
	UsagePercent     float64 `json:"usagePercent"`
	ExpireAt         string  `json:"expireAt"`
	ExpireRemainDays int     `json:"expireRemainDays"`
}

type subscriptionListResp struct {
	Items []subscriptionListItem `json:"items"`
}

type subscriptionCreateReq struct {
	Name                 string `json:"name"`
	UpstreamURL          string `json:"upstreamUrl"`
	WorkerForwardURL     string `json:"workerForwardUrl"`
	WorkerForwardEnabled bool   `json:"workerForwardEnabled"`
	MonitorEnabled       bool   `json:"monitorEnabled"`
}

type subscriptionUpdateReq struct {
	ID                   string `json:"id"`
	Name                 string `json:"name"`
	UpstreamURL          string `json:"upstreamUrl"`
	WorkerForwardURL     string `json:"workerForwardUrl"`
	WorkerForwardEnabled bool   `json:"workerForwardEnabled"`
	MonitorEnabled       bool   `json:"monitorEnabled"`
}

type subscriptionDeleteReq struct {
	ID string `json:"id"`
}

type subscriptionRotateReq struct {
	ID string `json:"id"`
}

type subscriptionCheckReq struct {
	ID string `json:"id"`
}

type subscriptionMutationResp struct {
	Item subscriptionListItem `json:"item"`
}

type subscriptionDeleteResp struct {
	Suc bool `json:"suc"`
}

type subscriptionInfo struct {
	TrafficRaw       string
	UsedBytes        int64
	TotalBytes       int64
	UsagePercent     float64
	ExpireAt         time.Time
	ExpireRemainDays int
}

type subscriptionMgr struct {
	plat   *PlatForm
	mu     sync.Mutex
	client *http.Client
	stopCh chan struct{}
}

func newSubscriptionMgr(plat *PlatForm) *subscriptionMgr {
	return &subscriptionMgr{
		plat: plat,
		client: &http.Client{
			Timeout: 30 * time.Second,
		},
		stopCh: make(chan struct{}),
	}
}

func (m *subscriptionMgr) Start() {
	go m.monitorLoop()
}

func (m *subscriptionMgr) userKey(user string) string {
	return xstorage.Join("misc", "subscription", "user", user)
}

func (m *subscriptionMgr) logInfo(format string, args ...interface{}) {
	if m == nil || m.plat == nil || m.plat.log == nil {
		return
	}
	m.plat.log.Info(subscriptionLogTag, format, args...)
}

func (m *subscriptionMgr) logWarning(format string, args ...interface{}) {
	if m == nil || m.plat == nil || m.plat.log == nil {
		return
	}
	m.plat.log.Warning(subscriptionLogTag, format, args...)
}

func (m *subscriptionMgr) pushNotify(title, content string) {
	if m == nil || m.plat == nil || m.plat.push == nil {
		return
	}
	if err := m.plat.push.Push(title, content, false); err != nil {
		m.logWarning("push failed: %v", err)
	}
}

func (m *subscriptionMgr) loadUsersLocked() ([]string, error) {
	var users []string
	err := m.plat.storage.GetFromJson(subscriptionUsersKey, &users)
	if err != nil {
		if errors.Is(err, xstorage.ErrNoData) {
			return []string{}, nil
		}
		return nil, err
	}
	return users, nil
}

func (m *subscriptionMgr) saveUsersLocked(users []string) error {
	slices.Sort(users)
	return m.plat.storage.SetToJson(subscriptionUsersKey, users)
}

func (m *subscriptionMgr) loadRecordsLocked(user string) ([]subscriptionRecord, error) {
	var records []subscriptionRecord
	err := m.plat.storage.GetFromJson(m.userKey(user), &records)
	if err != nil {
		if errors.Is(err, xstorage.ErrNoData) {
			return []subscriptionRecord{}, nil
		}
		return nil, err
	}
	return records, nil
}

func (m *subscriptionMgr) saveRecordsLocked(user string, records []subscriptionRecord) error {
	return m.plat.storage.SetToJson(m.userKey(user), records)
}

func (m *subscriptionMgr) ensureUserLocked(user string) error {
	users, err := m.loadUsersLocked()
	if err != nil {
		return err
	}
	if slices.Contains(users, user) {
		return nil
	}
	users = append(users, user)
	return m.saveUsersLocked(users)
}

func (m *subscriptionMgr) maybeRemoveUserLocked(user string, records []subscriptionRecord) error {
	if len(records) > 0 {
		return nil
	}
	users, err := m.loadUsersLocked()
	if err != nil {
		return err
	}
	index := slices.Index(users, user)
	if index < 0 {
		return nil
	}
	users = append(users[:index], users[index+1:]...)
	if len(users) == 0 {
		return m.plat.storage.Delete(subscriptionUsersKey)
	}
	return m.saveUsersLocked(users)
}

func (m *subscriptionMgr) buildSharePath(user, token string) string {
	return fmt.Sprintf("/share-link/%s/%s", user, token)
}

func (m *subscriptionMgr) buildPublicShareURL(user, token string) string {
	return m.buildSharePath(user, token)
}

func normalizeWorkerForwardURL(raw string) string {
	return strings.TrimSpace(raw)
}

func validateWorkerForward(enabled bool, workerURL string) error {
	if !enabled {
		return nil
	}
	if strings.TrimSpace(workerURL) == "" {
		return errors.New("workerForwardUrl is empty")
	}
	parsed, err := url.Parse(workerURL)
	if err != nil || parsed.Scheme == "" || parsed.Host == "" {
		return errors.New("workerForwardUrl invalid")
	}
	return nil
}

func (m *subscriptionMgr) buildFetchURL(record subscriptionRecord) (string, error) {
	if !record.WorkerEnabled {
		return record.UpstreamURL, nil
	}
	if err := validateWorkerForward(true, record.WorkerForwardURL); err != nil {
		return "", err
	}
	return record.WorkerForwardURL + url.QueryEscape(record.UpstreamURL), nil
}

func buildDownloadContentDisposition(record subscriptionRecord, upstreamHeader string) string {
	if strings.TrimSpace(upstreamHeader) != "" {
		return upstreamHeader
	}
	if filename := extractUpstreamFilename(record.UpstreamURL); filename != "" {
		return mime.FormatMediaType("attachment", map[string]string{"filename": filename})
	}
	return mime.FormatMediaType("attachment", map[string]string{"filename": "subscription.yaml"})
}

func extractUpstreamFilename(rawURL string) string {
	parsed, err := url.Parse(rawURL)
	if err != nil {
		return ""
	}
	return strings.TrimSpace(parsed.Query().Get("filename"))
}

func (m *subscriptionMgr) toListItem(record subscriptionRecord) subscriptionListItem {
	item := subscriptionListItem{
		ID:               record.ID,
		Name:             record.Name,
		UpstreamURL:      record.UpstreamURL,
		WorkerForwardURL: record.WorkerForwardURL,
		WorkerEnabled:    record.WorkerEnabled,
		MonitorEnabled:   record.MonitorEnabled,
		ShareURL:         m.buildPublicShareURL(record.User, record.ShareToken),
		LastCheckStatus:  record.LastCheckStatus,
		LastError:        record.LastError,
		TrafficSummary:   record.LastTrafficRaw,
		UsagePercent:     record.LastUsagePercent,
	}
	if !record.LastCheckAt.IsZero() {
		item.LastCheckAt = record.LastCheckAt.Format(time.RFC3339)
	}
	if !record.LastExpireAt.IsZero() {
		item.ExpireAt = record.LastExpireAt.Format("2006-01-02")
		item.ExpireRemainDays = calcExpireRemainDays(record.LastExpireAt, time.Now())
	}
	return item
}

func (m *subscriptionMgr) list(user string) ([]subscriptionListItem, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	records, err := m.loadRecordsLocked(user)
	if err != nil {
		return nil, err
	}
	items := make([]subscriptionListItem, 0, len(records))
	for _, record := range records {
		items = append(items, m.toListItem(record))
	}
	slices.SortFunc(items, func(a, b subscriptionListItem) int {
		return strings.Compare(a.Name, b.Name)
	})
	return items, nil
}

func (m *subscriptionMgr) create(user string, req subscriptionCreateReq) (subscriptionListItem, error) {
	if strings.TrimSpace(req.Name) == "" || strings.TrimSpace(req.UpstreamURL) == "" {
		return subscriptionListItem{}, errors.New("name or upstreamUrl is empty")
	}
	if err := validateWorkerForward(req.WorkerForwardEnabled, req.WorkerForwardURL); err != nil {
		return subscriptionListItem{}, err
	}
	record := subscriptionRecord{
		ID:               uuid.NewString(),
		User:             user,
		Name:             strings.TrimSpace(req.Name),
		UpstreamURL:      strings.TrimSpace(req.UpstreamURL),
		WorkerForwardURL: normalizeWorkerForwardURL(req.WorkerForwardURL),
		WorkerEnabled:    req.WorkerForwardEnabled,
		ShareToken:       newSubscriptionToken(),
		MonitorEnabled:   req.MonitorEnabled,
		CreatedAt:        time.Now(),
		UpdatedAt:        time.Now(),
		LastCheckStatus:  subscriptionStatusNever,
	}

	m.mu.Lock()
	defer m.mu.Unlock()
	records, err := m.loadRecordsLocked(user)
	if err != nil {
		return subscriptionListItem{}, err
	}
	records = append(records, record)
	if err = m.saveRecordsLocked(user, records); err != nil {
		return subscriptionListItem{}, err
	}
	if err = m.ensureUserLocked(user); err != nil {
		return subscriptionListItem{}, err
	}
	return m.toListItem(record), nil
}

func (m *subscriptionMgr) update(user string, req subscriptionUpdateReq) (subscriptionListItem, error) {
	if strings.TrimSpace(req.ID) == "" || strings.TrimSpace(req.Name) == "" || strings.TrimSpace(req.UpstreamURL) == "" {
		return subscriptionListItem{}, errors.New("invalid param")
	}
	if err := validateWorkerForward(req.WorkerForwardEnabled, req.WorkerForwardURL); err != nil {
		return subscriptionListItem{}, err
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	records, err := m.loadRecordsLocked(user)
	if err != nil {
		return subscriptionListItem{}, err
	}
	index := -1
	for i := range records {
		if records[i].ID == req.ID {
			index = i
			break
		}
	}
	if index < 0 {
		return subscriptionListItem{}, errors.New("subscription not exist")
	}
	record := records[index]
	oldURL := record.UpstreamURL
	oldWorkerURL := record.WorkerForwardURL
	oldWorkerEnabled := record.WorkerEnabled
	record.Name = strings.TrimSpace(req.Name)
	record.UpstreamURL = strings.TrimSpace(req.UpstreamURL)
	record.WorkerForwardURL = normalizeWorkerForwardURL(req.WorkerForwardURL)
	record.WorkerEnabled = req.WorkerForwardEnabled
	record.MonitorEnabled = req.MonitorEnabled
	record.UpdatedAt = time.Now()
	if oldURL != record.UpstreamURL ||
		oldWorkerURL != record.WorkerForwardURL ||
		oldWorkerEnabled != record.WorkerEnabled ||
		!record.MonitorEnabled {
		record.resetMonitorState()
	}
	records[index] = record
	if err = m.saveRecordsLocked(user, records); err != nil {
		return subscriptionListItem{}, err
	}
	return m.toListItem(record), nil
}

func (m *subscriptionMgr) delete(user, id string) error {
	if strings.TrimSpace(id) == "" {
		return errors.New("invalid param")
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	records, err := m.loadRecordsLocked(user)
	if err != nil {
		return err
	}
	index := -1
	for i := range records {
		if records[i].ID == id {
			index = i
			break
		}
	}
	if index < 0 {
		return errors.New("subscription not exist")
	}
	records = append(records[:index], records[index+1:]...)
	if len(records) == 0 {
		if err = m.plat.storage.Delete(m.userKey(user)); err != nil {
			return err
		}
	} else if err = m.saveRecordsLocked(user, records); err != nil {
		return err
	}
	return m.maybeRemoveUserLocked(user, records)
}

func (m *subscriptionMgr) rotate(user, id string) (subscriptionListItem, error) {
	if strings.TrimSpace(id) == "" {
		return subscriptionListItem{}, errors.New("invalid param")
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	records, err := m.loadRecordsLocked(user)
	if err != nil {
		return subscriptionListItem{}, err
	}
	index := -1
	for i := range records {
		if records[i].ID == id {
			index = i
			break
		}
	}
	if index < 0 {
		return subscriptionListItem{}, errors.New("subscription not exist")
	}
	record := records[index]
	record.ShareToken = newSubscriptionToken()
	record.UpdatedAt = time.Now()
	records[index] = record
	if err = m.saveRecordsLocked(user, records); err != nil {
		return subscriptionListItem{}, err
	}
	return m.toListItem(record), nil
}

func (m *subscriptionMgr) check(user, id string) (subscriptionListItem, error) {
	if strings.TrimSpace(id) == "" {
		return subscriptionListItem{}, errors.New("invalid param")
	}
	m.mu.Lock()
	records, err := m.loadRecordsLocked(user)
	if err != nil {
		m.mu.Unlock()
		return subscriptionListItem{}, err
	}
	index := -1
	for i := range records {
		if records[i].ID == id {
			index = i
			break
		}
	}
	if index < 0 {
		m.mu.Unlock()
		return subscriptionListItem{}, errors.New("subscription not exist")
	}
	record := records[index]
	m.mu.Unlock()

	m.monitorRecord(record)

	m.mu.Lock()
	defer m.mu.Unlock()
	records, err = m.loadRecordsLocked(user)
	if err != nil {
		return subscriptionListItem{}, err
	}
	for i := range records {
		if records[i].ID == id {
			return m.toListItem(records[i]), nil
		}
	}
	return subscriptionListItem{}, errors.New("subscription not exist")
}

func (m *subscriptionMgr) getByShare(user, token string) (*subscriptionRecord, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	records, err := m.loadRecordsLocked(user)
	if err != nil {
		return nil, err
	}
	for i := range records {
		if records[i].ShareToken == token {
			record := records[i]
			return &record, nil
		}
	}
	return nil, errors.New("subscription not exist")
}

func (m *subscriptionMgr) updateMonitorFailure(user, recordID, status, msg string) {
	m.mu.Lock()
	defer m.mu.Unlock()
	records, err := m.loadRecordsLocked(user)
	if err != nil {
		m.logWarning("load records failed on failure update: %v", err)
		return
	}
	for i := range records {
		if records[i].ID != recordID {
			continue
		}
		records[i].LastCheckAt = time.Now()
		records[i].LastCheckStatus = status
		records[i].LastError = msg
		records[i].UpdatedAt = time.Now()
		if err = m.saveRecordsLocked(user, records); err != nil {
			m.logWarning("save records failed on failure update: %v", err)
		}
		return
	}
}

func (m *subscriptionMgr) updateMonitorSuccess(user, recordID string, info subscriptionInfo) {
	m.mu.Lock()
	defer m.mu.Unlock()
	records, err := m.loadRecordsLocked(user)
	if err != nil {
		m.logWarning("load records failed on success update: %v", err)
		return
	}
	for i := range records {
		if records[i].ID != recordID {
			continue
		}
		record := records[i]
		if shouldResetAlertState(record, info) {
			record.clearAlerts()
		}
		record.LastCheckAt = time.Now()
		record.LastCheckStatus = subscriptionStatusSuccess
		record.LastError = ""
		record.LastTrafficRaw = info.TrafficRaw
		record.LastUsedBytes = info.UsedBytes
		record.LastTotalBytes = info.TotalBytes
		record.LastUsagePercent = info.UsagePercent
		record.LastExpireAt = info.ExpireAt
		record.LastExpireRemain = info.ExpireRemainDays
		record.UpdatedAt = time.Now()
		alerts := record.collectAlerts(info)
		records[i] = record
		if err = m.saveRecordsLocked(user, records); err != nil {
			m.logWarning("save records failed on success update: %v", err)
			return
		}
		for _, alert := range alerts {
			m.pushNotify("订阅提醒", alert)
		}
		return
	}
}

func (m *subscriptionMgr) monitorLoop() {
	ticker := time.NewTicker(time.Hour)
	defer ticker.Stop()
	for {
		select {
		case <-ticker.C:
			m.monitorAll()
		case <-m.stopCh:
			return
		}
	}
}

func (m *subscriptionMgr) monitorAll() {
	m.mu.Lock()
	users, err := m.loadUsersLocked()
	m.mu.Unlock()
	if err != nil {
		m.logWarning("load users failed: %v", err)
		return
	}
	for _, user := range users {
		m.monitorUser(user)
	}
}

func (m *subscriptionMgr) monitorUser(user string) {
	m.mu.Lock()
	records, err := m.loadRecordsLocked(user)
	m.mu.Unlock()
	if err != nil {
		m.logWarning("load records failed for user=%s: %v", user, err)
		return
	}
	for _, record := range records {
		if !record.MonitorEnabled {
			continue
		}
		m.monitorRecord(record)
	}
}

func (m *subscriptionMgr) monitorRecord(record subscriptionRecord) {
	fetchURL, err := m.buildFetchURL(record)
	if err != nil {
		m.logInfo("user=%s name=%s build fetch url failed: %v", record.User, record.Name, err)
		m.updateMonitorFailure(record.User, record.ID, subscriptionStatusRequestFail, err.Error())
		return
	}
	body, err := m.fetchSubscriptionBody(fetchURL)
	if err != nil {
		body, err = m.fetchSubscriptionBody(fetchURL)
		if err != nil {
			msg := fmt.Sprintf("user=%s name=%s upstream=%s fetch=%s check failed: %v", record.User, record.Name, record.UpstreamURL, fetchURL, err)
			m.logInfo(msg)
			m.pushNotify("订阅巡检失败", msg)
			m.updateMonitorFailure(record.User, record.ID, subscriptionStatusRequestFail, err.Error())
			return
		}
	}
	info, err := parseSubscriptionInfo(body, time.Now())
	if err != nil {
		m.logInfo("user=%s name=%s parse failed: %v", record.User, record.Name, err)
		m.updateMonitorFailure(record.User, record.ID, subscriptionStatusParseFail, err.Error())
		return
	}
	m.updateMonitorSuccess(record.User, record.ID, info)
}

func (m *subscriptionMgr) fetchSubscriptionBody(url string) ([]byte, error) {
	resp, err := m.client.Get(url)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("status %d", resp.StatusCode)
	}
	return io.ReadAll(resp.Body)
}

func (record *subscriptionRecord) resetMonitorState() {
	record.LastCheckAt = time.Time{}
	record.LastCheckStatus = subscriptionStatusNever
	record.LastError = ""
	record.LastTrafficRaw = ""
	record.LastUsedBytes = 0
	record.LastTotalBytes = 0
	record.LastUsagePercent = 0
	record.LastExpireAt = time.Time{}
	record.LastExpireRemain = 0
	record.clearAlerts()
}

func (record *subscriptionRecord) clearAlerts() {
	record.UsageAlerted = subscriptionUsageAlerted{}
	record.ExpireAlerted = subscriptionExpireAlerted{}
}

func (record *subscriptionRecord) collectAlerts(info subscriptionInfo) []string {
	var alerts []string
	if info.UsagePercent >= 80 && !record.UsageAlerted.Usage80 {
		record.UsageAlerted.Usage80 = true
		alerts = append(alerts, fmt.Sprintf("%s 用量达到 80%%，当前 %.1f%%", record.Name, info.UsagePercent))
	}
	if info.UsagePercent >= 90 && !record.UsageAlerted.Usage90 {
		record.UsageAlerted.Usage90 = true
		alerts = append(alerts, fmt.Sprintf("%s 用量达到 90%%，当前 %.1f%%", record.Name, info.UsagePercent))
	}
	if info.UsagePercent >= 100 && !record.UsageAlerted.Usage100 {
		record.UsageAlerted.Usage100 = true
		alerts = append(alerts, fmt.Sprintf("%s 用量达到 100%%，当前 %.1f%%", record.Name, info.UsagePercent))
	}
	if info.ExpireRemainDays >= 0 && info.ExpireRemainDays <= 7 && !record.ExpireAlerted.Days7 {
		record.ExpireAlerted.Days7 = true
		alerts = append(alerts, fmt.Sprintf("%s 距离过期不足 7 天，到期日 %s", record.Name, info.ExpireAt.Format("2006-01-02")))
	}
	if info.ExpireRemainDays >= 0 && info.ExpireRemainDays <= 3 && !record.ExpireAlerted.Days3 {
		record.ExpireAlerted.Days3 = true
		alerts = append(alerts, fmt.Sprintf("%s 距离过期不足 3 天，到期日 %s", record.Name, info.ExpireAt.Format("2006-01-02")))
	}
	if info.ExpireRemainDays >= 0 && info.ExpireRemainDays <= 1 && !record.ExpireAlerted.Days1 {
		record.ExpireAlerted.Days1 = true
		alerts = append(alerts, fmt.Sprintf("%s 距离过期不足 1 天，到期日 %s", record.Name, info.ExpireAt.Format("2006-01-02")))
	}
	return alerts
}

func shouldResetAlertState(record subscriptionRecord, info subscriptionInfo) bool {
	if record.LastExpireAt.IsZero() {
		return false
	}
	if !record.LastExpireAt.Equal(info.ExpireAt) {
		return true
	}
	if record.LastTotalBytes != 0 && info.TotalBytes != record.LastTotalBytes {
		return true
	}
	if record.LastUsedBytes != 0 && info.UsedBytes < record.LastUsedBytes {
		return true
	}
	if record.LastUsagePercent-info.UsagePercent >= 10 {
		return true
	}
	return false
}

func parseSubscriptionInfo(body []byte, now time.Time) (subscriptionInfo, error) {
	text := string(body)
	trafficRaw := extractSubscriptionField(text, `Traffic:\s*([^"]+)`)
	expireRaw := extractSubscriptionField(text, `Expire:\s*([0-9]{4}-[0-9]{2}-[0-9]{2})`)
	if trafficRaw == "" || expireRaw == "" {
		return subscriptionInfo{}, errors.New("traffic or expire not found")
	}
	usedBytes, totalBytes, err := parseTrafficBytes(trafficRaw)
	if err != nil {
		return subscriptionInfo{}, err
	}
	expireAt, err := time.Parse("2006-01-02", expireRaw)
	if err != nil {
		return subscriptionInfo{}, err
	}
	usagePercent := 0.0
	if totalBytes > 0 {
		usagePercent = float64(usedBytes) / float64(totalBytes) * 100
	}
	return subscriptionInfo{
		TrafficRaw:       trafficRaw,
		UsedBytes:        usedBytes,
		TotalBytes:       totalBytes,
		UsagePercent:     math.Round(usagePercent*10) / 10,
		ExpireAt:         expireAt,
		ExpireRemainDays: calcExpireRemainDays(expireAt, now),
	}, nil
}

func extractSubscriptionField(text, pattern string) string {
	re := regexp.MustCompile(pattern)
	match := re.FindStringSubmatch(text)
	if len(match) < 2 {
		return ""
	}
	return strings.TrimSpace(match[1])
}

func parseTrafficBytes(raw string) (int64, int64, error) {
	parts := strings.Split(raw, "|")
	if len(parts) != 2 {
		return 0, 0, errors.New("traffic format invalid")
	}
	usedBytes, err := parseSizeBytes(parts[0])
	if err != nil {
		return 0, 0, err
	}
	totalBytes, err := parseSizeBytes(parts[1])
	if err != nil {
		return 0, 0, err
	}
	if totalBytes <= 0 {
		return 0, 0, errors.New("traffic total invalid")
	}
	return usedBytes, totalBytes, nil
}

func parseSizeBytes(raw string) (int64, error) {
	fields := strings.Fields(strings.TrimSpace(raw))
	if len(fields) != 2 {
		return 0, errors.New("size format invalid")
	}
	value, err := strconv.ParseFloat(fields[0], 64)
	if err != nil {
		return 0, err
	}
	unit := strings.ToUpper(strings.TrimSpace(fields[1]))
	multiplier := float64(1)
	switch unit {
	case "B":
		multiplier = 1
	case "KB":
		multiplier = 1024
	case "MB":
		multiplier = 1024 * 1024
	case "GB":
		multiplier = 1024 * 1024 * 1024
	case "TB":
		multiplier = 1024 * 1024 * 1024 * 1024
	case "PB":
		multiplier = 1024 * 1024 * 1024 * 1024 * 1024
	default:
		return 0, errors.New("size unit invalid")
	}
	return int64(math.Round(value * multiplier)), nil
}

func calcExpireRemainDays(expireAt time.Time, now time.Time) int {
	location := now.Location()
	today := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, location)
	expireDay := time.Date(expireAt.Year(), expireAt.Month(), expireAt.Day(), 0, 0, 0, 0, location)
	return int(expireDay.Sub(today).Hours() / 24)
}

func newSubscriptionToken() string {
	buf := make([]byte, 24)
	if _, err := rand.Read(buf); err != nil {
		return strings.ReplaceAll(uuid.NewString(), "-", "")
	}
	return hex.EncodeToString(buf)
}

func (m *webMgr) subscriptionList(c *gin.Context) {
	valid := m.getValid(c)
	if valid.User == "" {
		ErrReturn(c, "no permission")
		return
	}
	items, err := m.plat.subscriptionMgr.list(valid.User)
	if err != nil {
		ErrReturn(c, "inner error")
		return
	}
	OkReturn(c, subscriptionListResp{Items: items})
}

func (m *webMgr) subscriptionCreate(c *gin.Context) {
	valid := m.getValid(c)
	if valid.User == "" {
		ErrReturn(c, "no permission")
		return
	}
	var req subscriptionCreateReq
	if err := c.ShouldBindJSON(&req); err != nil {
		ErrReturn(c, "illegal param")
		return
	}
	item, err := m.plat.subscriptionMgr.create(valid.User, req)
	if err != nil {
		ErrReturn(c, err.Error())
		return
	}
	OkReturn(c, subscriptionMutationResp{Item: item})
}

func (m *webMgr) subscriptionUpdate(c *gin.Context) {
	valid := m.getValid(c)
	if valid.User == "" {
		ErrReturn(c, "no permission")
		return
	}
	var req subscriptionUpdateReq
	if err := c.ShouldBindJSON(&req); err != nil {
		ErrReturn(c, "illegal param")
		return
	}
	item, err := m.plat.subscriptionMgr.update(valid.User, req)
	if err != nil {
		ErrReturn(c, err.Error())
		return
	}
	OkReturn(c, subscriptionMutationResp{Item: item})
}

func (m *webMgr) subscriptionDelete(c *gin.Context) {
	valid := m.getValid(c)
	if valid.User == "" {
		ErrReturn(c, "no permission")
		return
	}
	var req subscriptionDeleteReq
	if err := c.ShouldBindJSON(&req); err != nil {
		ErrReturn(c, "illegal param")
		return
	}
	if err := m.plat.subscriptionMgr.delete(valid.User, req.ID); err != nil {
		ErrReturn(c, err.Error())
		return
	}
	OkReturn(c, subscriptionDeleteResp{Suc: true})
}

func (m *webMgr) subscriptionRotate(c *gin.Context) {
	valid := m.getValid(c)
	if valid.User == "" {
		ErrReturn(c, "no permission")
		return
	}
	var req subscriptionRotateReq
	if err := c.ShouldBindJSON(&req); err != nil {
		ErrReturn(c, "illegal param")
		return
	}
	item, err := m.plat.subscriptionMgr.rotate(valid.User, req.ID)
	if err != nil {
		ErrReturn(c, err.Error())
		return
	}
	OkReturn(c, subscriptionMutationResp{Item: item})
}

func (m *webMgr) subscriptionCheck(c *gin.Context) {
	valid := m.getValid(c)
	if valid.User == "" {
		ErrReturn(c, "no permission")
		return
	}
	var req subscriptionCheckReq
	if err := c.ShouldBindJSON(&req); err != nil {
		ErrReturn(c, "illegal param")
		return
	}
	item, err := m.plat.subscriptionMgr.check(valid.User, req.ID)
	if err != nil {
		ErrReturn(c, err.Error())
		return
	}
	OkReturn(c, subscriptionMutationResp{Item: item})
}

func (m *webMgr) shareLinkDownload(c *gin.Context) {
	username := c.Param("username")
	token := c.Param("token")
	record, err := m.plat.subscriptionMgr.getByShare(username, token)
	if err != nil {
		c.String(http.StatusNotFound, "not found")
		return
	}
	fetchURL, err := m.plat.subscriptionMgr.buildFetchURL(*record)
	if err != nil {
		c.String(http.StatusBadGateway, "bad upstream")
		return
	}
	req, err := http.NewRequestWithContext(c.Request.Context(), http.MethodGet, fetchURL, nil)
	if err != nil {
		c.String(http.StatusBadGateway, "bad upstream")
		return
	}
	resp, err := m.plat.subscriptionMgr.client.Do(req)
	if err != nil {
		c.String(http.StatusBadGateway, "bad upstream")
		return
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		c.String(http.StatusBadGateway, "bad upstream")
		return
	}
	for _, key := range []string{"Content-Type", "Content-Encoding"} {
		value := resp.Header.Get(key)
		if value != "" {
			c.Header(key, value)
		}
	}
	c.Header("Content-Disposition", buildDownloadContentDisposition(*record, resp.Header.Get("Content-Disposition")))
	if c.Writer.Header().Get("Content-Type") == "" {
		c.Header("Content-Type", "application/octet-stream")
	}
	c.Status(resp.StatusCode)
	_, _ = io.Copy(c.Writer, resp.Body)
}
