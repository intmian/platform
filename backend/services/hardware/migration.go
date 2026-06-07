package hardware

import (
	"encoding/json"
	"strings"
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

func (s *Service) migrateLegacyData() error {
	if !s.db.Migrator().HasTable(&LegacyGateway{}) || !s.db.Migrator().HasTable(&LegacyNode{}) {
		return nil
	}
	var existing int64
	if err := s.db.Model(&Device{}).Count(&existing).Error; err != nil {
		return err
	}
	if existing > 0 {
		return nil
	}
	return s.db.Transaction(func(tx *gorm.DB) error {
		var gateways []LegacyGateway
		if err := tx.Find(&gateways).Error; err != nil {
			return err
		}
		gatewayDeviceIDs := map[string]string{}
		for _, legacy := range gateways {
			credentialID := uuid.NewString()
			credential := AccessCredential{
				ID:          credentialID,
				Name:        legacyCredentialName(legacy.Name),
				TokenHash:   legacy.TokenHash,
				TokenPrefix: legacy.TokenPrefix,
				Enabled:     legacy.Enabled,
				LastUsedAt:  legacy.LastSeenAt,
				CreatedAt:   nonZeroTime(legacy.CreatedAt),
				UpdatedAt:   nonZeroTime(legacy.UpdatedAt),
			}
			if credential.UpdatedAt.IsZero() {
				credential.UpdatedAt = time.Now()
			}
			if err := tx.Create(&credential).Error; err != nil {
				return err
			}
			deviceID := uuid.NewString()
			hardwareKey := "credential:" + credentialID
			device := Device{
				ID:          deviceID,
				HardwareKey: hardwareKey,
				Type:        deviceTypeGateway,
				Name:        fallbackName(legacy.Name, deviceTypeGateway, hardwareKey),
				Hidden:      !legacy.Enabled,
				LastSeenAt:  legacy.LastSeenAt,
				LastIP:      legacy.LastIP,
				UserAgent:   legacy.UserAgent,
				CreatedAt:   nonZeroTime(legacy.CreatedAt),
				UpdatedAt:   nonZeroTime(legacy.UpdatedAt),
			}
			if device.CreatedAt.IsZero() {
				device.CreatedAt = time.Now()
			}
			if device.UpdatedAt.IsZero() {
				device.UpdatedAt = device.CreatedAt
			}
			if err := tx.Create(&device).Error; err != nil {
				return err
			}
			gatewayDeviceIDs[legacy.ID] = device.ID
		}

		var nodes []LegacyNode
		if err := tx.Find(&nodes).Error; err != nil {
			return err
		}
		nodeDeviceIDs := map[string]string{}
		for _, legacy := range nodes {
			hardwareKey := strings.TrimSpace(legacy.NodeKey)
			deviceType := legacy.NodeType
			if deviceType == "" {
				deviceType = inferDeviceType(hardwareKey)
			}
			device := Device{
				ID:                  uuid.NewString(),
				HardwareKey:         hardwareKey,
				Type:                deviceType,
				Name:                fallbackName(legacy.Name, deviceType, hardwareKey),
				Hidden:              !legacy.Enabled,
				LastGatewayDeviceID: gatewayDeviceIDs[legacy.LastGatewayID],
				LastSessionID:       legacy.LastSessionID,
				LastSeq:             legacy.LastSeq,
				LastEpochSec:        legacy.LastEpochSec,
				LastSeenAt:          legacy.LastSeenAt,
				LatestSampleID:      legacy.LatestSampleID,
				CreatedAt:           nonZeroTime(legacy.CreatedAt),
				UpdatedAt:           nonZeroTime(legacy.UpdatedAt),
			}
			if legacy.LastEpochSec > 0 {
				t := time.Unix(int64(legacy.LastEpochSec), 0)
				device.LastSampleAt = &t
			}
			if device.CreatedAt.IsZero() {
				device.CreatedAt = time.Now()
			}
			if device.UpdatedAt.IsZero() {
				device.UpdatedAt = device.CreatedAt
			}
			if err := tx.Create(&device).Error; err != nil {
				return err
			}
			nodeDeviceIDs[legacy.ID] = device.ID
		}

		var samples []Sample
		if err := tx.Where("device_id = '' or device_id is null").Find(&samples).Error; err != nil {
			return err
		}
		for _, sample := range samples {
			sample.DeviceID = nodeDeviceIDs[sample.LegacyNodeID]
			sample.GatewayDeviceID = gatewayDeviceIDs[sample.LegacyGatewayID]
			sample.HardwareKey = sample.LegacyNodeKey
			if sample.DeviceID == "" {
				continue
			}
			if err := tx.Save(&sample).Error; err != nil {
				return err
			}
		}

		var commands []Command
		if err := tx.Where("device_id = '' or device_id is null").Find(&commands).Error; err != nil {
			return err
		}
		for _, command := range commands {
			if command.LegacyNodeID != "" {
				command.DeviceID = nodeDeviceIDs[command.LegacyNodeID]
			} else {
				command.DeviceID = gatewayDeviceIDs[command.LegacyGatewayID]
			}
			command.GatewayDeviceID = gatewayDeviceIDs[command.LegacyGatewayID]
			if command.DeviceID == "" {
				continue
			}
			if err := tx.Save(&command).Error; err != nil {
				return err
			}
		}

		return migrateLegacyWidgets(tx, nodeDeviceIDs)
	})
}

func migrateLegacyWidgets(tx *gorm.DB, nodeDeviceIDs map[string]string) error {
	var widgets []DashboardWidget
	if err := tx.Find(&widgets).Error; err != nil {
		return err
	}
	for _, widget := range widgets {
		if strings.TrimSpace(widget.DeviceIDsJSON) != "" {
			continue
		}
		legacyIDs := []string{}
		if err := json.Unmarshal([]byte(widget.LegacyNodeIDs), &legacyIDs); err != nil && strings.TrimSpace(widget.LegacyNodeIDs) != "" {
			return err
		}
		deviceIDs := []string{}
		for _, legacyID := range legacyIDs {
			if deviceID := nodeDeviceIDs[legacyID]; deviceID != "" {
				deviceIDs = append(deviceIDs, deviceID)
			}
		}
		body, _ := json.Marshal(deviceIDs)
		widget.DeviceIDsJSON = string(body)
		if widget.Type == "latest" {
			widget.Type = "value"
		}
		if widget.Type == "trend" || widget.Type == "multi_trend" {
			widget.Type = "line"
		}
		if widget.TimeRange == "" {
			widget.TimeRange = defaultDashboardTimeRange
		}
		if widget.Agg == "" {
			widget.Agg = "avg"
		}
		if err := tx.Save(&widget).Error; err != nil {
			return err
		}
	}
	return nil
}

func nonZeroTime(t time.Time) time.Time {
	if t.IsZero() {
		return time.Now()
	}
	return t
}

func legacyCredentialName(name string) string {
	name = strings.TrimSpace(name)
	if name == "" {
		return "接入密钥"
	}
	return name + " 接入密钥"
}

func fallbackName(name, deviceType, hardwareKey string) string {
	name = strings.TrimSpace(name)
	if name != "" {
		return name
	}
	return defaultDeviceName(deviceType, hardwareKey)
}
