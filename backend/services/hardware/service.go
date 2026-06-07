package hardware

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"path"
	"slices"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/intmian/mian_go_lib/tool/misc"
	backendshare "github.com/intmian/platform/backend/share"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

const (
	defaultDashboardName       = "数据看板"
	defaultDashboardTimeRange  = "24h"
	defaultDashboardRefreshSec = 30
	defaultQueryLimit          = 500
	maxQueryLimit              = 5000
	commandLeaseDuration       = time.Minute
)

type Service struct {
	share   backendshare.ServiceShare
	db      *gorm.DB
	baseDir string
}

func (s *Service) Start(share backendshare.ServiceShare) error {
	s.share = share
	s.baseDir = path.Join("services", "hardware")
	if err := misc.CreateDirWhenNotExist(s.baseDir); err != nil {
		return errors.Join(errors.New("create hardware dir failed"), err)
	}
	db, err := gorm.Open(sqlite.Open(path.Join(s.baseDir, "hardware.db")), &gorm.Config{})
	if err != nil {
		return errors.Join(errors.New("open hardware db failed"), err)
	}
	if err = db.AutoMigrate(
		&AccessCredential{},
		&Device{},
		&Sample{},
		&Dashboard{},
		&DashboardWidget{},
		&Command{},
	); err != nil {
		return errors.Join(errors.New("migrate hardware db failed"), err)
	}
	s.db = db
	if err = s.migrateLegacyData(); err != nil {
		return errors.Join(errors.New("migrate legacy hardware data failed"), err)
	}
	return nil
}

func (s *Service) Stop() error {
	if s.db == nil {
		return nil
	}
	sqlDB, err := s.db.DB()
	if err != nil {
		return err
	}
	return sqlDB.Close()
}

func (s *Service) Handle(msg backendshare.Msg, valid backendshare.Valid) {}

func (s *Service) HandleRpc(msg backendshare.Msg, valid backendshare.Valid) (interface{}, error) {
	if !valid.HasOnePermission(backendshare.PermissionAdmin, backendshare.PermissionHardware) {
		return nil, errors.New("no permission")
	}
	switch msg.Cmd() {
	case CmdListDevices:
		return backendshare.HandleRpcTool("listDevices", msg, valid, s.OnListDevices)
	case CmdUpdateDevice:
		return backendshare.HandleRpcTool("updateDevice", msg, valid, s.OnUpdateDevice)
	case CmdDeleteDevice:
		return backendshare.HandleRpcTool("deleteDevice", msg, valid, s.OnDeleteDevice)
	case CmdListCredentials:
		return backendshare.HandleRpcTool("listCredentials", msg, valid, s.OnListCredentials)
	case CmdCreateCredential:
		return backendshare.HandleRpcTool("createCredential", msg, valid, s.OnCreateCredential)
	case CmdRotateCredential:
		return backendshare.HandleRpcTool("rotateCredential", msg, valid, s.OnRotateCredential)
	case CmdUpdateCredential:
		return backendshare.HandleRpcTool("updateCredential", msg, valid, s.OnUpdateCredential)
	case CmdDeleteCredential:
		return backendshare.HandleRpcTool("deleteCredential", msg, valid, s.OnDeleteCredential)
	case CmdQuerySamples:
		return backendshare.HandleRpcTool("querySamples", msg, valid, s.OnQuerySamples)
	case CmdListCommands:
		return backendshare.HandleRpcTool("listCommands", msg, valid, s.OnListCommands)
	case CmdCreateCommand:
		return backendshare.HandleRpcTool("createCommand", msg, valid, s.OnCreateCommand)
	case CmdCancelCommand:
		return backendshare.HandleRpcTool("cancelCommand", msg, valid, s.OnCancelCommand)
	case CmdGetDashboard:
		return backendshare.HandleRpcTool("getDashboard", msg, valid, s.OnGetDashboard)
	case CmdSaveDashboard:
		return backendshare.HandleRpcTool("saveDashboard", msg, valid, s.OnSaveDashboard)
	case CmdQueryDashboard:
		return backendshare.HandleRpcTool("queryDashboard", msg, valid, s.OnQueryDashboard)
	default:
		return nil, errors.New("unknown cmd")
	}
}

func (s *Service) GetProp() backendshare.ServiceProp {
	return misc.CreateProperty(backendshare.SvrPropMicro)
}

func (s *Service) DebugCommand(req backendshare.DebugReq) interface{} {
	return map[string]interface{}{"cmd": req.Cmd}
}

func (s *Service) OnListDevices(_ backendshare.Valid, req ListDevicesReq) (ListDevicesRet, error) {
	tx := s.db.Order("type asc, updated_at desc")
	if !req.IncludeHidden {
		tx = tx.Where("hidden = ?", false)
	}
	if !req.IncludeDeleted {
		tx = tx.Where("deleted_at is null")
	}
	var devices []Device
	if err := tx.Find(&devices).Error; err != nil {
		return ListDevicesRet{}, err
	}
	ret := ListDevicesRet{Devices: make([]DeviceDTO, 0, len(devices))}
	for _, device := range devices {
		dto := toDeviceDTO(device)
		if device.LatestSampleID != "" && device.DeletedAt == nil {
			var sample Sample
			if err := s.db.First(&sample, "id = ?", device.LatestSampleID).Error; err == nil {
				sampleDTO := toSampleDTO(sample)
				dto.LatestSample = &sampleDTO
			}
		}
		ret.Devices = append(ret.Devices, dto)
	}
	return ret, nil
}

func (s *Service) OnUpdateDevice(_ backendshare.Valid, req UpdateDeviceReq) (DeviceMutationRet, error) {
	var device Device
	if err := s.db.First(&device, "id = ?", strings.TrimSpace(req.ID)).Error; err != nil {
		return DeviceMutationRet{}, err
	}
	if device.DeletedAt != nil {
		return DeviceMutationRet{}, errors.New("device deleted")
	}
	name := strings.TrimSpace(req.Name)
	if name == "" {
		name = defaultDeviceName(device.Type, device.HardwareKey)
	}
	device.Name = name
	device.Hidden = req.Hidden
	device.UpdatedAt = time.Now()
	if err := s.db.Save(&device).Error; err != nil {
		return DeviceMutationRet{}, err
	}
	return DeviceMutationRet{Device: toDeviceDTO(device)}, nil
}

func (s *Service) OnDeleteDevice(_ backendshare.Valid, req DeleteDeviceReq) (DeleteDeviceRet, error) {
	deviceID := strings.TrimSpace(req.ID)
	if deviceID == "" {
		return DeleteDeviceRet{}, errors.New("deviceId is empty")
	}
	now := time.Now()
	err := s.db.Transaction(func(tx *gorm.DB) error {
		var device Device
		if err := tx.First(&device, "id = ?", deviceID).Error; err != nil {
			return err
		}
		device.Hidden = true
		device.DeletedAt = &now
		device.UpdatedAt = now
		device.LatestSampleID = ""
		if err := tx.Save(&device).Error; err != nil {
			return err
		}
		if err := tx.Where("device_id = ? or gateway_device_id = ?", deviceID, deviceID).Delete(&Sample{}).Error; err != nil {
			return err
		}
		if err := tx.Model(&Command{}).
			Where("(device_id = ? or gateway_device_id = ?) and status in ?", deviceID, deviceID, []string{commandStatusPending, commandStatusDelivered}).
			Updates(map[string]interface{}{"status": commandStatusCancelled, "updated_at": now}).Error; err != nil {
			return err
		}
		return nil
	})
	if err != nil {
		return DeleteDeviceRet{}, err
	}
	return DeleteDeviceRet{Deleted: true}, nil
}

func (s *Service) OnListCredentials(_ backendshare.Valid, _ ListCredentialsReq) (ListCredentialsRet, error) {
	var credentials []AccessCredential
	if err := s.db.Order("updated_at desc").Find(&credentials).Error; err != nil {
		return ListCredentialsRet{}, err
	}
	ret := ListCredentialsRet{Credentials: make([]CredentialDTO, 0, len(credentials))}
	for _, credential := range credentials {
		ret.Credentials = append(ret.Credentials, toCredentialDTO(credential))
	}
	return ret, nil
}

func (s *Service) OnCreateCredential(_ backendshare.Valid, req CreateCredentialReq) (CreateCredentialRet, error) {
	name := strings.TrimSpace(req.Name)
	if name == "" {
		name = "接入密钥"
	}
	token, prefix, hash, err := newAccessToken()
	if err != nil {
		return CreateCredentialRet{}, err
	}
	now := time.Now()
	credential := AccessCredential{
		ID:          uuid.NewString(),
		Name:        name,
		TokenHash:   hash,
		TokenPrefix: prefix,
		Enabled:     true,
		CreatedAt:   now,
		UpdatedAt:   now,
	}
	if err = s.db.Create(&credential).Error; err != nil {
		return CreateCredentialRet{}, err
	}
	return CreateCredentialRet{Credential: toCredentialDTO(credential), Token: token}, nil
}

func (s *Service) OnRotateCredential(_ backendshare.Valid, req RotateCredentialReq) (RotateCredentialRet, error) {
	var credential AccessCredential
	if err := s.db.First(&credential, "id = ?", strings.TrimSpace(req.ID)).Error; err != nil {
		return RotateCredentialRet{}, err
	}
	token, prefix, hash, err := newAccessToken()
	if err != nil {
		return RotateCredentialRet{}, err
	}
	credential.TokenHash = hash
	credential.TokenPrefix = prefix
	credential.UpdatedAt = time.Now()
	if err = s.db.Save(&credential).Error; err != nil {
		return RotateCredentialRet{}, err
	}
	return RotateCredentialRet{Credential: toCredentialDTO(credential), Token: token}, nil
}

func (s *Service) OnUpdateCredential(_ backendshare.Valid, req UpdateCredentialReq) (CredentialMutationRet, error) {
	var credential AccessCredential
	if err := s.db.First(&credential, "id = ?", strings.TrimSpace(req.ID)).Error; err != nil {
		return CredentialMutationRet{}, err
	}
	name := strings.TrimSpace(req.Name)
	if name == "" {
		return CredentialMutationRet{}, errors.New("name is empty")
	}
	credential.Name = name
	credential.Enabled = req.Enabled
	credential.UpdatedAt = time.Now()
	if err := s.db.Save(&credential).Error; err != nil {
		return CredentialMutationRet{}, err
	}
	return CredentialMutationRet{Credential: toCredentialDTO(credential)}, nil
}

func (s *Service) OnDeleteCredential(_ backendshare.Valid, req DeleteCredentialReq) (DeleteCredentialRet, error) {
	if err := s.db.Delete(&AccessCredential{}, "id = ?", strings.TrimSpace(req.ID)).Error; err != nil {
		return DeleteCredentialRet{}, err
	}
	return DeleteCredentialRet{Deleted: true}, nil
}

func (s *Service) OnQuerySamples(_ backendshare.Valid, req QuerySamplesReq) (QuerySamplesRet, error) {
	deviceIDs := normalizeStringList(req.DeviceIDs)
	if req.DeviceID != "" {
		deviceIDs = normalizeStringList(append(deviceIDs, req.DeviceID))
	}
	if len(deviceIDs) == 0 {
		return QuerySamplesRet{Samples: []SampleDTO{}}, nil
	}
	metric := normalizeMetric(req.Metric)
	from, to := queryWindow(req.TimeRange, req.FromEpochSec, req.ToEpochSec)
	limit := normalizeLimit(req.Limit)
	tx := s.db.Where("device_id in ?", deviceIDs).Order("epoch_sec asc").Limit(limit)
	if from > 0 {
		tx = tx.Where("epoch_sec >= ?", from)
	}
	if to > 0 {
		tx = tx.Where("epoch_sec <= ?", to)
	}
	var samples []Sample
	if err := tx.Find(&samples).Error; err != nil {
		return QuerySamplesRet{}, err
	}
	return QuerySamplesRet{Samples: aggregateSampleDTOs(samples, metric, normalizeBucket(req.Bucket), normalizeAgg(req.Agg))}, nil
}

func (s *Service) OnListCommands(_ backendshare.Valid, req ListCommandsReq) (ListCommandsRet, error) {
	limit := normalizeLimit(req.Limit)
	tx := s.db.Model(&Command{}).Order("created_at desc").Limit(limit)
	if req.DeviceID != "" {
		tx = tx.Where("device_id = ? or gateway_device_id = ?", req.DeviceID, req.DeviceID)
	}
	var commands []Command
	if err := tx.Find(&commands).Error; err != nil {
		return ListCommandsRet{}, err
	}
	ret := ListCommandsRet{Commands: make([]CommandDTO, 0, len(commands))}
	for _, command := range commands {
		ret.Commands = append(ret.Commands, toCommandDTO(command))
	}
	return ret, nil
}

func (s *Service) OnCreateCommand(valid backendshare.Valid, req CreateCommandReq) (CreateCommandRet, error) {
	commandType := strings.TrimSpace(req.Type)
	if commandType != "ota" {
		return CreateCommandRet{}, errors.New("only ota command is supported")
	}
	var device Device
	if err := s.db.First(&device, "id = ?", strings.TrimSpace(req.DeviceID)).Error; err != nil {
		return CreateCommandRet{}, err
	}
	if device.DeletedAt != nil {
		return CreateCommandRet{}, errors.New("device deleted")
	}
	if device.Type != deviceTypeGateway {
		return CreateCommandRet{}, errors.New("ota requires gateway device")
	}
	payload := strings.TrimSpace(req.PayloadJSON)
	if payload == "" {
		payload = "{}"
	}
	if !json.Valid([]byte(payload)) {
		return CreateCommandRet{}, errors.New("payloadJson is invalid")
	}
	now := time.Now()
	command := Command{
		ID:              uuid.NewString(),
		DeviceID:        device.ID,
		GatewayDeviceID: device.ID,
		Type:            commandType,
		PayloadJSON:     payload,
		Status:          commandStatusPending,
		CreatedBy:       valid.GetFrom(),
		CreatedAt:       now,
		UpdatedAt:       now,
	}
	if err := s.db.Create(&command).Error; err != nil {
		return CreateCommandRet{}, err
	}
	return CreateCommandRet{Command: toCommandDTO(command)}, nil
}

func (s *Service) OnCancelCommand(_ backendshare.Valid, req CancelCommandReq) (CancelCommandRet, error) {
	var command Command
	if err := s.db.First(&command, "id = ?", strings.TrimSpace(req.ID)).Error; err != nil {
		return CancelCommandRet{}, err
	}
	if command.Status == commandStatusAcked || command.Status == commandStatusFailed {
		return CancelCommandRet{}, errors.New("command already finished")
	}
	command.Status = commandStatusCancelled
	command.UpdatedAt = time.Now()
	if err := s.db.Save(&command).Error; err != nil {
		return CancelCommandRet{}, err
	}
	return CancelCommandRet{Command: toCommandDTO(command)}, nil
}

func (s *Service) OnGetDashboard(_ backendshare.Valid, _ GetDashboardReq) (GetDashboardRet, error) {
	dashboard, widgets, err := s.loadDashboard()
	if err != nil {
		return GetDashboardRet{}, err
	}
	return GetDashboardRet{Dashboard: toDashboardDTO(dashboard), Widgets: toWidgetDTOs(widgets)}, nil
}

func (s *Service) OnSaveDashboard(_ backendshare.Valid, req SaveDashboardReq) (SaveDashboardRet, error) {
	now := time.Now()
	name := strings.TrimSpace(req.Name)
	if name == "" {
		name = defaultDashboardName
	}
	dashboard := Dashboard{
		Key:        dashboardGlobalKey,
		Name:       name,
		TimeRange:  normalizeDashboardTimeRange(req.TimeRange),
		RefreshSec: normalizeRefreshSec(req.RefreshSec),
		LayoutJSON: strings.TrimSpace(req.LayoutJSON),
		UpdatedAt:  now,
	}
	if dashboard.LayoutJSON == "" {
		dashboard.LayoutJSON = "{}"
	}
	err := s.db.Transaction(func(tx *gorm.DB) error {
		var existing Dashboard
		if err := tx.First(&existing, "key = ?", dashboardGlobalKey).Error; err == nil {
			dashboard.CreatedAt = existing.CreatedAt
		} else if errors.Is(err, gorm.ErrRecordNotFound) {
			dashboard.CreatedAt = now
		} else {
			return err
		}
		if err := tx.Save(&dashboard).Error; err != nil {
			return err
		}
		if err := tx.Where("1 = 1").Delete(&DashboardWidget{}).Error; err != nil {
			return err
		}
		widgets := make([]DashboardWidget, 0, len(req.Widgets))
		for i, input := range req.Widgets {
			widget, err := normalizeWidgetInput(input, i, now)
			if err != nil {
				return err
			}
			widgets = append(widgets, widget)
		}
		if len(widgets) > 0 {
			return tx.Create(&widgets).Error
		}
		return nil
	})
	if err != nil {
		return SaveDashboardRet{}, err
	}
	loadedDashboard, widgets, err := s.loadDashboard()
	if err != nil {
		return SaveDashboardRet{}, err
	}
	return SaveDashboardRet{Dashboard: toDashboardDTO(loadedDashboard), Widgets: toWidgetDTOs(widgets)}, nil
}

func (s *Service) OnQueryDashboard(_ backendshare.Valid, _ QueryDashboardReq) (QueryDashboardRet, error) {
	dashboard, widgets, err := s.loadDashboard()
	if err != nil {
		return QueryDashboardRet{}, err
	}
	ret := QueryDashboardRet{Widgets: make([]DashboardWidgetResult, 0, len(widgets))}
	for _, widget := range widgets {
		dto := toWidgetDTO(widget)
		result := DashboardWidgetResult{
			Widget:  dto,
			Devices: []DeviceDTO{},
			Samples: []SampleDTO{},
			Latest:  []SampleDTO{},
		}
		devices, err := s.loadDevicesForWidget(dto.DeviceIDs)
		if err != nil {
			return QueryDashboardRet{}, err
		}
		for _, device := range devices {
			result.Devices = append(result.Devices, toDeviceDTO(device))
		}
		activeIDs := activeDeviceIDs(devices)
		if len(activeIDs) == 0 {
			ret.Widgets = append(ret.Widgets, result)
			continue
		}
		switch widget.Type {
		case "value":
			result.Latest, err = s.queryLatestSamples(activeIDs)
		default:
			from, to := widgetQueryWindow(widget, dashboard.TimeRange)
			var samples []Sample
			if err = s.db.Where("device_id in ?", activeIDs).
				Where("epoch_sec >= ? and epoch_sec <= ?", from, to).
				Order("epoch_sec asc").
				Limit(maxQueryLimit).
				Find(&samples).Error; err != nil {
				return QueryDashboardRet{}, err
			}
			metric := ""
			if len(dto.Metrics) > 0 {
				metric = dto.Metrics[0]
			}
			result.Samples = aggregateSampleDTOs(samples, normalizeMetric(metric), normalizeBucket(widget.Bucket), normalizeAgg(widget.Agg))
		}
		ret.Widgets = append(ret.Widgets, result)
	}
	return ret, nil
}

func (s *Service) loadDashboard() (Dashboard, []DashboardWidget, error) {
	now := time.Now()
	dashboard := Dashboard{}
	err := s.db.First(&dashboard, "key = ?", dashboardGlobalKey).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		dashboard = Dashboard{
			Key:        dashboardGlobalKey,
			Name:       defaultDashboardName,
			TimeRange:  defaultDashboardTimeRange,
			RefreshSec: defaultDashboardRefreshSec,
			LayoutJSON: "{}",
			CreatedAt:  now,
			UpdatedAt:  now,
		}
		if err = s.db.Create(&dashboard).Error; err != nil {
			return Dashboard{}, nil, err
		}
	} else if err != nil {
		return Dashboard{}, nil, err
	}
	var widgets []DashboardWidget
	if err = s.db.Order("sort_index asc").Find(&widgets).Error; err != nil {
		return Dashboard{}, nil, err
	}
	return dashboard, widgets, nil
}

func (s *Service) loadDevicesForWidget(ids []string) ([]Device, error) {
	ids = normalizeStringList(ids)
	if len(ids) == 0 {
		return []Device{}, nil
	}
	var devices []Device
	if err := s.db.Where("id in ?", ids).Find(&devices).Error; err != nil {
		return nil, err
	}
	byID := map[string]Device{}
	for _, device := range devices {
		byID[device.ID] = device
	}
	ret := make([]Device, 0, len(ids))
	for _, id := range ids {
		if device, ok := byID[id]; ok {
			ret = append(ret, device)
			continue
		}
		ret = append(ret, Device{ID: id, Name: "设备已删除", DeletedAt: &time.Time{}, Type: "deleted"})
	}
	return ret, nil
}

func (s *Service) queryLatestSamples(deviceIDs []string) ([]SampleDTO, error) {
	var samples []Sample
	if err := s.db.Where("device_id in ?", deviceIDs).
		Order("epoch_sec desc").
		Limit(maxQueryLimit).
		Find(&samples).Error; err != nil {
		return nil, err
	}
	seen := map[string]bool{}
	ret := []SampleDTO{}
	for _, sample := range samples {
		if seen[sample.DeviceID] {
			continue
		}
		seen[sample.DeviceID] = true
		ret = append(ret, toSampleDTO(sample))
	}
	return ret, nil
}

func newAccessToken() (token string, prefix string, hash string, err error) {
	bytes := make([]byte, 32)
	if _, err = rand.Read(bytes); err != nil {
		return "", "", "", err
	}
	token = "hw_" + hex.EncodeToString(bytes)
	if len(token) > 18 {
		prefix = token[:18]
	} else {
		prefix = token
	}
	sum := sha256.Sum256([]byte(token))
	hash = hex.EncodeToString(sum[:])
	return token, prefix, hash, nil
}

func hashAccessToken(token string) string {
	sum := sha256.Sum256([]byte(strings.TrimSpace(token)))
	return hex.EncodeToString(sum[:])
}

func normalizeLimit(limit int) int {
	if limit <= 0 {
		return defaultQueryLimit
	}
	if limit > maxQueryLimit {
		return maxQueryLimit
	}
	return limit
}

func normalizeRefreshSec(value int) int {
	if value == 0 {
		return 0
	}
	if value < 10 {
		return 10
	}
	if value > 3600 {
		return 3600
	}
	return value
}

func formatTime(t time.Time) string {
	if t.IsZero() {
		return ""
	}
	return t.Format(time.RFC3339)
}

func formatTimePtr(t *time.Time) string {
	if t == nil {
		return ""
	}
	return formatTime(*t)
}

func toCredentialDTO(credential AccessCredential) CredentialDTO {
	return CredentialDTO{
		ID:          credential.ID,
		Name:        credential.Name,
		TokenPrefix: credential.TokenPrefix,
		Enabled:     credential.Enabled,
		LastUsedAt:  formatTimePtr(credential.LastUsedAt),
		CreatedAt:   formatTime(credential.CreatedAt),
		UpdatedAt:   formatTime(credential.UpdatedAt),
	}
}

func toDeviceDTO(device Device) DeviceDTO {
	status := deviceStatusOffline
	if device.DeletedAt != nil {
		status = deviceStatusDeleted
	} else if device.LastSeenAt != nil {
		if time.Since(*device.LastSeenAt) <= 5*time.Minute {
			status = deviceStatusOnline
		} else {
			status = deviceStatusStale
		}
	}
	return DeviceDTO{
		ID:                  device.ID,
		HardwareKey:         device.HardwareKey,
		Type:                device.Type,
		Name:                device.Name,
		Hidden:              device.Hidden,
		Deleted:             device.DeletedAt != nil,
		Status:              status,
		LastSeenAt:          formatTimePtr(device.LastSeenAt),
		LastSampleAt:        formatTimePtr(device.LastSampleAt),
		LastGatewayDeviceID: device.LastGatewayDeviceID,
		LastEpochSec:        device.LastEpochSec,
		LastIP:              device.LastIP,
		UserAgent:           device.UserAgent,
		CreatedAt:           formatTime(device.CreatedAt),
		UpdatedAt:           formatTime(device.UpdatedAt),
	}
}

func toSampleDTO(sample Sample) SampleDTO {
	return SampleDTO{
		ID:              sample.ID,
		DeviceID:        sample.DeviceID,
		GatewayDeviceID: sample.GatewayDeviceID,
		HardwareKey:     sample.HardwareKey,
		SessionID:       sample.SessionID,
		Seq:             sample.Seq,
		EpochSec:        sample.EpochSec,
		ProtocolVersion: sample.ProtocolVersion,
		TempC10:         sample.TempC10,
		HumiRh:          sample.HumiRh,
		BattPct:         sample.BattPct,
		Scd41Co2Ppm:     sample.Scd41Co2Ppm,
		TvocPpb:         sample.TvocPpb,
		VocAqi:          sample.VocAqi,
		Eco2Ppm:         sample.Eco2Ppm,
		Flags:           sample.Flags,
		CRC16:           sample.CRC16,
		CreatedAt:       formatTime(sample.CreatedAt),
	}
}

func toCommandDTO(command Command) CommandDTO {
	return CommandDTO{
		ID:              command.ID,
		DeviceID:        command.DeviceID,
		GatewayDeviceID: command.GatewayDeviceID,
		Type:            command.Type,
		Status:          command.Status,
		LeaseUntil:      formatTimePtr(command.LeaseUntil),
		DeliveredAt:     formatTimePtr(command.DeliveredAt),
		AckedAt:         formatTimePtr(command.AckedAt),
		CreatedBy:       command.CreatedBy,
		LastError:       command.LastError,
		CreatedAt:       formatTime(command.CreatedAt),
		UpdatedAt:       formatTime(command.UpdatedAt),
	}
}

func toDashboardDTO(dashboard Dashboard) DashboardDTO {
	return DashboardDTO{
		Name:       dashboard.Name,
		TimeRange:  dashboard.TimeRange,
		RefreshSec: dashboard.RefreshSec,
		LayoutJSON: dashboard.LayoutJSON,
		UpdatedAt:  formatTime(dashboard.UpdatedAt),
	}
}

func toWidgetDTOs(widgets []DashboardWidget) []DashboardWidgetDTO {
	ret := make([]DashboardWidgetDTO, 0, len(widgets))
	for _, widget := range widgets {
		ret = append(ret, toWidgetDTO(widget))
	}
	return ret
}

func toWidgetDTO(widget DashboardWidget) DashboardWidgetDTO {
	deviceIDs := []string{}
	metrics := []string{}
	_ = json.Unmarshal([]byte(widget.DeviceIDsJSON), &deviceIDs)
	_ = json.Unmarshal([]byte(widget.MetricsJSON), &metrics)
	return DashboardWidgetDTO{
		ID:          widget.ID,
		Title:       widget.Title,
		Type:        widget.Type,
		DeviceIDs:   deviceIDs,
		Metrics:     metrics,
		TimeRange:   normalizeDashboardTimeRange(widget.TimeRange),
		Bucket:      normalizeBucket(widget.Bucket),
		Agg:         normalizeAgg(widget.Agg),
		OptionsJSON: widget.OptionsJSON,
		SortIndex:   widget.SortIndex,
	}
}

func normalizeWidgetInput(input DashboardWidgetInput, fallbackSort int, now time.Time) (DashboardWidget, error) {
	widgetType := strings.TrimSpace(input.Type)
	if widgetType == "" {
		widgetType = "value"
	}
	if widgetType != "value" && widgetType != "line" {
		return DashboardWidget{}, fmt.Errorf("widget type invalid: %s", widgetType)
	}
	deviceIDs := normalizeStringList(input.DeviceIDs)
	if len(deviceIDs) > 20 {
		deviceIDs = deviceIDs[:20]
	}
	metrics := normalizeMetrics(input.Metrics)
	deviceJSON, _ := json.Marshal(deviceIDs)
	metricJSON, _ := json.Marshal(metrics)
	id := strings.TrimSpace(input.ID)
	if id == "" {
		id = uuid.NewString()
	}
	title := strings.TrimSpace(input.Title)
	if title == "" {
		title = "未命名组件"
	}
	sortIndex := input.SortIndex
	if sortIndex == 0 {
		sortIndex = fallbackSort
	}
	options := strings.TrimSpace(input.OptionsJSON)
	if options == "" || !json.Valid([]byte(options)) {
		options = "{}"
	}
	return DashboardWidget{
		ID:            id,
		Title:         title,
		Type:          widgetType,
		DeviceIDsJSON: string(deviceJSON),
		MetricsJSON:   string(metricJSON),
		TimeRange:     normalizeDashboardTimeRange(input.TimeRange),
		Bucket:        normalizeBucket(input.Bucket),
		Agg:           normalizeAgg(input.Agg),
		OptionsJSON:   options,
		SortIndex:     sortIndex,
		CreatedAt:     now,
		UpdatedAt:     now,
	}, nil
}

func normalizeStringList(values []string) []string {
	ret := []string{}
	seen := map[string]bool{}
	for _, value := range values {
		clean := strings.TrimSpace(value)
		if clean == "" || seen[clean] {
			continue
		}
		ret = append(ret, clean)
		seen[clean] = true
	}
	return ret
}

var allowedMetrics = []string{
	"scd41_co2_ppm",
	"temp_c10",
	"humi_rh",
	"batt_pct",
	"tvoc_ppb",
	"voc_aqi",
	"eco2_ppm",
}

func normalizeMetric(metric string) string {
	clean := strings.TrimSpace(metric)
	if slices.Contains(allowedMetrics, clean) {
		return clean
	}
	return "temp_c10"
}

func normalizeMetrics(metrics []string) []string {
	ret := []string{}
	seen := map[string]bool{}
	for _, metric := range metrics {
		clean := strings.TrimSpace(metric)
		if !slices.Contains(allowedMetrics, clean) || seen[clean] {
			continue
		}
		ret = append(ret, clean)
		seen[clean] = true
	}
	if len(ret) == 0 {
		ret = []string{"temp_c10"}
	}
	return ret
}

func normalizeBucket(bucket string) string {
	switch strings.TrimSpace(bucket) {
	case "raw", "1m", "5m", "15m", "1h":
		return strings.TrimSpace(bucket)
	default:
		return "raw"
	}
}

func normalizeAgg(agg string) string {
	switch strings.TrimSpace(agg) {
	case "avg", "min", "max":
		return strings.TrimSpace(agg)
	default:
		return "avg"
	}
}

func normalizeDashboardTimeRange(value string) string {
	switch strings.TrimSpace(value) {
	case "1h", "6h", "24h", "7d", "custom":
		return strings.TrimSpace(value)
	default:
		return defaultDashboardTimeRange
	}
}

func durationForRange(value string) time.Duration {
	switch strings.TrimSpace(value) {
	case "1h":
		return time.Hour
	case "6h":
		return 6 * time.Hour
	case "7d":
		return 7 * 24 * time.Hour
	default:
		return 24 * time.Hour
	}
}

func queryWindow(timeRange string, fromEpochSec, toEpochSec uint32) (uint32, uint32) {
	now := uint32(time.Now().Unix())
	if fromEpochSec > 0 || toEpochSec > 0 {
		if toEpochSec == 0 {
			toEpochSec = now
		}
		return fromEpochSec, toEpochSec
	}
	return uint32(time.Now().Add(-durationForRange(timeRange)).Unix()), now
}

func widgetQueryWindow(widget DashboardWidget, fallbackRange string) (uint32, uint32) {
	timeRange := widget.TimeRange
	if timeRange == "" {
		timeRange = fallbackRange
	}
	if timeRange != "custom" {
		return queryWindow(timeRange, 0, 0)
	}
	var options struct {
		FromEpochSec uint32 `json:"fromEpochSec"`
		ToEpochSec   uint32 `json:"toEpochSec"`
	}
	_ = json.Unmarshal([]byte(widget.OptionsJSON), &options)
	return queryWindow(timeRange, options.FromEpochSec, options.ToEpochSec)
}

func activeDeviceIDs(devices []Device) []string {
	ret := []string{}
	for _, device := range devices {
		if device.ID != "" && device.DeletedAt == nil {
			ret = append(ret, device.ID)
		}
	}
	return ret
}

func metricValue(sample Sample, metric string) *int {
	switch metric {
	case "scd41_co2_ppm":
		return sample.Scd41Co2Ppm
	case "temp_c10":
		return sample.TempC10
	case "humi_rh":
		return sample.HumiRh
	case "batt_pct":
		return sample.BattPct
	case "tvoc_ppb":
		return sample.TvocPpb
	case "voc_aqi":
		return sample.VocAqi
	case "eco2_ppm":
		return sample.Eco2Ppm
	default:
		return nil
	}
}

func setMetricValue(sample *Sample, metric string, value int) {
	switch metric {
	case "scd41_co2_ppm":
		sample.Scd41Co2Ppm = &value
	case "temp_c10":
		sample.TempC10 = &value
	case "humi_rh":
		sample.HumiRh = &value
	case "batt_pct":
		sample.BattPct = &value
	case "tvoc_ppb":
		sample.TvocPpb = &value
	case "voc_aqi":
		sample.VocAqi = &value
	case "eco2_ppm":
		sample.Eco2Ppm = &value
	}
}

type aggregateBucket struct {
	sample Sample
	count  int
	sum    int
	min    int
	max    int
}

func aggregateSampleDTOs(samples []Sample, metric, bucket, agg string) []SampleDTO {
	if bucket == "raw" {
		ret := make([]SampleDTO, 0, len(samples))
		for _, sample := range samples {
			ret = append(ret, toSampleDTO(sample))
		}
		return ret
	}
	seconds := bucketSeconds(bucket)
	if seconds == 0 {
		return aggregateSampleDTOs(samples, metric, "raw", agg)
	}
	buckets := map[string]*aggregateBucket{}
	order := []string{}
	for _, sample := range samples {
		value := metricValue(sample, metric)
		if value == nil {
			continue
		}
		bucketEpoch := (sample.EpochSec / seconds) * seconds
		key := fmt.Sprintf("%s:%d", sample.DeviceID, bucketEpoch)
		item, ok := buckets[key]
		if !ok {
			base := sample
			base.ID = key
			base.EpochSec = bucketEpoch
			clearMetrics(&base)
			item = &aggregateBucket{sample: base, min: math.MaxInt, max: math.MinInt}
			buckets[key] = item
			order = append(order, key)
		}
		item.count++
		item.sum += *value
		if *value < item.min {
			item.min = *value
		}
		if *value > item.max {
			item.max = *value
		}
	}
	ret := make([]SampleDTO, 0, len(order))
	for _, key := range order {
		item := buckets[key]
		if item.count == 0 {
			continue
		}
		value := item.sum / item.count
		if agg == "min" {
			value = item.min
		} else if agg == "max" {
			value = item.max
		}
		setMetricValue(&item.sample, metric, value)
		ret = append(ret, toSampleDTO(item.sample))
	}
	return ret
}

func clearMetrics(sample *Sample) {
	sample.TempC10 = nil
	sample.HumiRh = nil
	sample.BattPct = nil
	sample.Scd41Co2Ppm = nil
	sample.TvocPpb = nil
	sample.VocAqi = nil
	sample.Eco2Ppm = nil
}

func bucketSeconds(bucket string) uint32 {
	switch bucket {
	case "1m":
		return 60
	case "5m":
		return 5 * 60
	case "15m":
		return 15 * 60
	case "1h":
		return 3600
	default:
		return 0
	}
}

func defaultDeviceName(deviceType, hardwareKey string) string {
	suffix := strings.NewReplacer(":", "", "-", "", "_", "").Replace(hardwareKey)
	if len(suffix) > 4 {
		suffix = suffix[len(suffix)-4:]
	}
	if suffix == "" {
		suffix = "0000"
	}
	if deviceType == "" {
		deviceType = "device"
	}
	return deviceType + "-" + suffix
}

func inferDeviceType(hardwareKey string) string {
	if strings.HasPrefix(hardwareKey, "envmov-") {
		return deviceTypeEnvMov
	}
	if strings.HasPrefix(hardwareKey, "gateway-") || strings.HasPrefix(hardwareKey, "credential:") || strings.HasPrefix(hardwareKey, "legacy-gateway:") {
		return deviceTypeGateway
	}
	return "unknown"
}
