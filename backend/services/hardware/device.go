package hardware

import (
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

const (
	minDeviceProtocolVersion = 4

	envRecValidTemp     uint16 = 1 << 0
	envRecValidHumi     uint16 = 1 << 1
	envRecValidBatt     uint16 = 1 << 2
	envRecValidScd41CO2 uint16 = 1 << 3
	envRecValidTVOC     uint16 = 1 << 4
	envRecValidAQI      uint16 = 1 << 5
	envRecValidECO2     uint16 = 1 << 6
	envRecTimeValid     uint16 = 1 << 7
)

type DeviceIngestReq struct {
	GatewayKey string               `json:"gatewayKey"`
	Records    []DeviceIngestRecord `json:"records"`
}

type DeviceIngestRecord struct {
	NodeKey         string `json:"nodeKey"`
	SessionID       string `json:"sessionId"`
	Seq             uint32 `json:"seq"`
	EpochSec        uint32 `json:"epochSec"`
	ProtocolVersion uint16 `json:"protocolVersion"`
	TempC10         *int   `json:"tempC10"`
	HumiRh          *int   `json:"humiRh"`
	BattPct         *int   `json:"battPct"`
	Scd41Co2Ppm     *int   `json:"scd41Co2Ppm"`
	TvocPpb         *int   `json:"tvocPpb"`
	VocAqi          *int   `json:"vocAqi"`
	Eco2Ppm         *int   `json:"eco2Ppm"`
	Flags           uint16 `json:"flags"`
	CRC16           uint16 `json:"crc16"`
}

type DeviceIngestRet struct {
	Accepted  int                  `json:"accepted"`
	Duplicate int                  `json:"duplicate"`
	Failed    int                  `json:"failed"`
	Records   []DeviceRecordStatus `json:"records"`
}

type DeviceRecordStatus struct {
	NodeKey   string `json:"nodeKey"`
	SessionID string `json:"sessionId"`
	Seq       uint32 `json:"seq"`
	Status    string `json:"status"`
	Error     string `json:"error,omitempty"`
}

type DevicePollCommandsReq struct {
	GatewayKey string `json:"gatewayKey"`
	Limit      int    `json:"limit"`
}

type DevicePollCommandsRet struct {
	Commands []DeviceCommandDTO `json:"commands"`
}

type DeviceCommandDTO struct {
	ID          string `json:"id"`
	NodeKey     string `json:"nodeKey"`
	Type        string `json:"type"`
	PayloadJSON string `json:"payloadJson"`
	LeaseUntil  string `json:"leaseUntil"`
}

type DeviceCommandResultReq struct {
	ID         string `json:"id"`
	GatewayKey string `json:"gatewayKey"`
	Status     string `json:"status"`
	Error      string `json:"error"`
}

type DeviceCommandResultRet struct {
	Ack bool `json:"ack"`
}

func (s *Service) AuthenticateAccessToken(tokenText string) (AccessCredential, error) {
	tokenText = strings.TrimSpace(tokenText)
	if tokenText == "" {
		return AccessCredential{}, errors.New("token is empty")
	}
	var credential AccessCredential
	if err := s.db.First(&credential, "token_hash = ?", hashAccessToken(tokenText)).Error; err != nil {
		return AccessCredential{}, errors.New("token invalid")
	}
	if !credential.Enabled {
		return AccessCredential{}, errors.New("credential disabled")
	}
	now := time.Now()
	credential.LastUsedAt = &now
	credential.UpdatedAt = now
	if err := s.db.Save(&credential).Error; err != nil {
		return AccessCredential{}, err
	}
	return credential, nil
}

func (s *Service) Ingest(credential AccessCredential, req DeviceIngestReq, ip, userAgent string) (DeviceIngestRet, error) {
	if len(req.Records) == 0 {
		return DeviceIngestRet{}, errors.New("records is empty")
	}
	gateway, err := s.ensureGatewayDevice(s.db, credential, req.GatewayKey, ip, userAgent)
	if err != nil {
		return DeviceIngestRet{}, err
	}
	ret := DeviceIngestRet{Records: make([]DeviceRecordStatus, 0, len(req.Records))}
	for _, record := range req.Records {
		status := DeviceRecordStatus{NodeKey: record.NodeKey, SessionID: record.SessionID, Seq: record.Seq}
		if err := validateIngestRecord(record); err != nil {
			status.Status = "failed"
			status.Error = err.Error()
			ret.Failed++
			ret.Records = append(ret.Records, status)
			continue
		}
		accepted, duplicate, err := s.ingestOne(gateway, record)
		if err != nil {
			status.Status = "failed"
			status.Error = err.Error()
			ret.Failed++
		} else if duplicate {
			status.Status = "duplicate"
			ret.Duplicate++
		} else if accepted {
			status.Status = "accepted"
			ret.Accepted++
		} else {
			status.Status = "failed"
			status.Error = "not accepted"
			ret.Failed++
		}
		ret.Records = append(ret.Records, status)
	}
	return ret, nil
}

func (s *Service) PollCommands(credential AccessCredential, req DevicePollCommandsReq, ip, userAgent string) (DevicePollCommandsRet, error) {
	limit := req.Limit
	if limit <= 0 || limit > 20 {
		limit = 20
	}
	gateway, err := s.ensureGatewayDevice(s.db, credential, req.GatewayKey, ip, userAgent)
	if err != nil {
		return DevicePollCommandsRet{}, err
	}
	now := time.Now()
	var commands []Command
	if err := s.db.Where("gateway_device_id = ?", gateway.ID).
		Where("(status = ?) or (status = ? and (lease_until is null or lease_until <= ?))", commandStatusPending, commandStatusDelivered, now).
		Order("created_at asc").
		Limit(limit).
		Find(&commands).Error; err != nil {
		return DevicePollCommandsRet{}, err
	}
	ret := DevicePollCommandsRet{Commands: make([]DeviceCommandDTO, 0, len(commands))}
	for _, command := range commands {
		lease := now.Add(commandLeaseDuration)
		command.Status = commandStatusDelivered
		command.LeaseUntil = &lease
		if command.DeliveredAt == nil {
			command.DeliveredAt = &now
		}
		command.UpdatedAt = now
		if err := s.db.Save(&command).Error; err != nil {
			return DevicePollCommandsRet{}, err
		}
		ret.Commands = append(ret.Commands, DeviceCommandDTO{
			ID:          command.ID,
			Type:        command.Type,
			PayloadJSON: command.PayloadJSON,
			LeaseUntil:  formatTime(lease),
		})
	}
	return ret, nil
}

func (s *Service) CommandResult(_ AccessCredential, req DeviceCommandResultReq) (DeviceCommandResultRet, error) {
	var command Command
	if err := s.db.First(&command, "id = ?", strings.TrimSpace(req.ID)).Error; err != nil {
		return DeviceCommandResultRet{}, err
	}
	if command.Status == commandStatusCancelled {
		return DeviceCommandResultRet{}, errors.New("command cancelled")
	}
	now := time.Now()
	switch strings.TrimSpace(req.Status) {
	case commandStatusAcked, "ok", "success":
		command.Status = commandStatusAcked
	case commandStatusFailed, "error":
		command.Status = commandStatusFailed
	default:
		return DeviceCommandResultRet{}, errors.New("status is invalid")
	}
	command.AckedAt = &now
	command.LastError = strings.TrimSpace(req.Error)
	command.UpdatedAt = now
	if err := s.db.Save(&command).Error; err != nil {
		return DeviceCommandResultRet{}, err
	}
	return DeviceCommandResultRet{Ack: true}, nil
}

func validateIngestRecord(record DeviceIngestRecord) error {
	if strings.TrimSpace(record.NodeKey) == "" {
		return errors.New("nodeKey is empty")
	}
	if strings.TrimSpace(record.SessionID) == "" {
		return errors.New("sessionId is empty")
	}
	if record.Seq == 0 {
		return errors.New("seq is empty")
	}
	if record.ProtocolVersion < minDeviceProtocolVersion {
		return fmt.Errorf("protocolVersion must be >= %d", minDeviceProtocolVersion)
	}
	if record.EpochSec == 0 || (record.Flags&envRecTimeValid) == 0 {
		return errors.New("time invalid")
	}
	return nil
}

func (s *Service) ingestOne(gateway Device, record DeviceIngestRecord) (accepted bool, duplicate bool, err error) {
	err = s.db.Transaction(func(tx *gorm.DB) error {
		device, err := s.ensureSampleDevice(tx, gateway, record)
		if err != nil {
			return err
		}
		var count int64
		err = tx.Model(&Sample{}).
			Where("device_id = ? and session_id = ? and seq = ?", device.ID, strings.TrimSpace(record.SessionID), record.Seq).
			Count(&count).Error
		if err != nil {
			return err
		}
		if count > 0 {
			duplicate = true
			return nil
		}
		sample := sampleFromIngest(gateway, device, record)
		if err = tx.Create(&sample).Error; err != nil {
			return err
		}
		now := time.Now()
		sampleAt := time.Unix(int64(record.EpochSec), 0)
		device.LastGatewayDeviceID = gateway.ID
		device.LastSessionID = strings.TrimSpace(record.SessionID)
		device.LastSeq = record.Seq
		device.LastEpochSec = record.EpochSec
		device.LastSeenAt = &now
		device.LastSampleAt = &sampleAt
		device.LatestSampleID = sample.ID
		device.UpdatedAt = now
		if err = tx.Save(&device).Error; err != nil {
			return err
		}
		gateway.LastSeenAt = &now
		gateway.UpdatedAt = now
		return tx.Save(&gateway).Error
	})
	if err != nil || duplicate {
		return false, duplicate, err
	}
	return true, false, nil
}

func (s *Service) ensureGatewayDevice(tx *gorm.DB, credential AccessCredential, gatewayKey, ip, userAgent string) (Device, error) {
	hardwareKey := strings.TrimSpace(gatewayKey)
	if hardwareKey == "" {
		hardwareKey = "credential:" + credential.ID
	}
	now := time.Now()
	var device Device
	err := tx.First(&device, "hardware_key = ? and deleted_at is null", hardwareKey).Error
	if err == nil {
		device.LastSeenAt = &now
		device.LastIP = ip
		device.UserAgent = userAgent
		device.UpdatedAt = now
		if device.Type == "" {
			device.Type = deviceTypeGateway
		}
		if device.Name == "" {
			device.Name = defaultDeviceName(device.Type, device.HardwareKey)
		}
		return device, tx.Save(&device).Error
	}
	if !errors.Is(err, gorm.ErrRecordNotFound) {
		return Device{}, err
	}
	device = Device{
		ID:          uuid.NewString(),
		HardwareKey: hardwareKey,
		Type:        deviceTypeGateway,
		Name:        defaultDeviceName(deviceTypeGateway, hardwareKey),
		LastSeenAt:  &now,
		LastIP:      ip,
		UserAgent:   userAgent,
		CreatedAt:   now,
		UpdatedAt:   now,
	}
	return device, tx.Create(&device).Error
}

func (s *Service) ensureSampleDevice(tx *gorm.DB, gateway Device, record DeviceIngestRecord) (Device, error) {
	hardwareKey := strings.TrimSpace(record.NodeKey)
	var device Device
	err := tx.First(&device, "hardware_key = ? and deleted_at is null", hardwareKey).Error
	if err == nil {
		return device, nil
	}
	if !errors.Is(err, gorm.ErrRecordNotFound) {
		return Device{}, err
	}
	now := time.Now()
	deviceType := inferDeviceType(hardwareKey)
	device = Device{
		ID:                  uuid.NewString(),
		HardwareKey:         hardwareKey,
		Type:                deviceType,
		Name:                defaultDeviceName(deviceType, hardwareKey),
		LastGatewayDeviceID: gateway.ID,
		CreatedAt:           now,
		UpdatedAt:           now,
	}
	if err = tx.Create(&device).Error; err != nil {
		return Device{}, err
	}
	return device, nil
}

func sampleFromIngest(gateway Device, device Device, record DeviceIngestRecord) Sample {
	return Sample{
		ID:              uuid.NewString(),
		DeviceID:        device.ID,
		GatewayDeviceID: gateway.ID,
		HardwareKey:     strings.TrimSpace(record.NodeKey),
		SessionID:       strings.TrimSpace(record.SessionID),
		Seq:             record.Seq,
		EpochSec:        record.EpochSec,
		ProtocolVersion: record.ProtocolVersion,
		TempC10:         validMetric(record.Flags, envRecValidTemp, record.TempC10),
		HumiRh:          validMetric(record.Flags, envRecValidHumi, record.HumiRh),
		BattPct:         validMetric(record.Flags, envRecValidBatt, record.BattPct),
		Scd41Co2Ppm:     validMetric(record.Flags, envRecValidScd41CO2, record.Scd41Co2Ppm),
		TvocPpb:         validMetric(record.Flags, envRecValidTVOC, record.TvocPpb),
		VocAqi:          validMetric(record.Flags, envRecValidAQI, record.VocAqi),
		Eco2Ppm:         validMetric(record.Flags, envRecValidECO2, record.Eco2Ppm),
		Flags:           record.Flags,
		CRC16:           record.CRC16,
		CreatedAt:       time.Now(),
	}
}

func validMetric(flags uint16, bit uint16, value *int) *int {
	if (flags&bit) == 0 || value == nil {
		return nil
	}
	copied := *value
	return &copied
}
