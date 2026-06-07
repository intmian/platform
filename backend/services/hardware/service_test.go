package hardware

import (
	"path/filepath"
	"testing"
	"time"

	backendshare "github.com/intmian/platform/backend/share"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func newTestService(t *testing.T) *Service {
	t.Helper()
	db, err := gorm.Open(sqlite.Open(filepath.Join(t.TempDir(), "hardware.db")), &gorm.Config{})
	if err != nil {
		t.Fatalf("open sqlite failed: %v", err)
	}
	if err = db.AutoMigrate(
		&AccessCredential{},
		&Device{},
		&Sample{},
		&Dashboard{},
		&DashboardWidget{},
		&Command{},
	); err != nil {
		t.Fatalf("migrate failed: %v", err)
	}
	return &Service{db: db}
}

func pint(v int) *int {
	return &v
}

func TestCredentialAutoDiscoveryAndIdempotency(t *testing.T) {
	s := newTestService(t)
	valid := backendshare.MakeSysValid()

	created, err := s.OnCreateCredential(valid, CreateCredentialReq{Name: "lab key"})
	if err != nil {
		t.Fatalf("create credential failed: %v", err)
	}
	if created.Token == "" || created.Credential.TokenPrefix == "" {
		t.Fatalf("expected one-time token and prefix: %+v", created)
	}

	credential, err := s.AuthenticateAccessToken(created.Token)
	if err != nil {
		t.Fatalf("auth failed: %v", err)
	}
	flags := envRecTimeValid | envRecValidTemp | envRecValidHumi | envRecValidScd41CO2
	ingested, err := s.Ingest(credential, DeviceIngestReq{
		GatewayKey: "gateway-aabbccdd",
		Records: []DeviceIngestRecord{
			{
				NodeKey:         "envmov-0011223344556677",
				SessionID:       "session-a",
				Seq:             1,
				EpochSec:        1780000000,
				ProtocolVersion: 4,
				TempC10:         pint(253),
				HumiRh:          pint(48),
				BattPct:         pint(0),
				Scd41Co2Ppm:     pint(650),
				Flags:           flags,
				CRC16:           1234,
			},
		},
	}, "127.0.0.1", "test-agent")
	if err != nil {
		t.Fatalf("ingest failed: %v", err)
	}
	if ingested.Accepted != 1 || ingested.Duplicate != 0 || ingested.Failed != 0 {
		t.Fatalf("unexpected ingest ret: %+v", ingested)
	}

	duplicated, err := s.Ingest(credential, DeviceIngestReq{
		GatewayKey: "gateway-aabbccdd",
		Records: []DeviceIngestRecord{
			{
				NodeKey:         "envmov-0011223344556677",
				SessionID:       "session-a",
				Seq:             1,
				EpochSec:        1780000000,
				ProtocolVersion: 4,
				Flags:           flags,
				CRC16:           1234,
			},
		},
	}, "127.0.0.1", "test-agent")
	if err != nil {
		t.Fatalf("duplicate ingest failed: %v", err)
	}
	if duplicated.Duplicate != 1 || duplicated.Records[0].Status != "duplicate" {
		t.Fatalf("expected duplicate status: %+v", duplicated)
	}

	failed, err := s.Ingest(credential, DeviceIngestReq{
		GatewayKey: "gateway-aabbccdd",
		Records: []DeviceIngestRecord{
			{
				NodeKey:         "envmov-0011223344556677",
				SessionID:       "session-a",
				Seq:             2,
				EpochSec:        1780000001,
				ProtocolVersion: 3,
				Flags:           flags,
				CRC16:           1234,
			},
		},
	}, "127.0.0.1", "test-agent")
	if err != nil {
		t.Fatalf("invalid record should produce per-record failure, not request failure: %v", err)
	}
	if failed.Failed != 1 || failed.Records[0].Status != "failed" {
		t.Fatalf("expected failed status: %+v", failed)
	}

	devices, err := s.OnListDevices(valid, ListDevicesReq{})
	if err != nil {
		t.Fatalf("list devices failed: %v", err)
	}
	if len(devices.Devices) != 2 {
		t.Fatalf("expected gateway and env device, got %+v", devices)
	}
	var env DeviceDTO
	for _, device := range devices.Devices {
		if device.Type == deviceTypeEnvMov {
			env = device
		}
	}
	if env.ID == "" || env.LatestSample == nil {
		t.Fatalf("expected latest sample on env device: %+v", devices)
	}
	if env.LatestSample.BattPct != nil {
		t.Fatalf("battery should be nil when valid flag is absent")
	}
}

func TestDashboardCommandAndDeviceDelete(t *testing.T) {
	s := newTestService(t)
	valid := backendshare.MakeSysValid()
	created, err := s.OnCreateCredential(valid, CreateCredentialReq{Name: "lab key"})
	if err != nil {
		t.Fatalf("create credential failed: %v", err)
	}
	credential, err := s.AuthenticateAccessToken(created.Token)
	if err != nil {
		t.Fatalf("auth failed: %v", err)
	}
	nowEpoch := uint32(time.Now().Unix())
	_, err = s.Ingest(credential, DeviceIngestReq{
		GatewayKey: "gateway-aabbccdd",
		Records: []DeviceIngestRecord{
			{
				NodeKey:         "envmov-abcdef1234567890",
				SessionID:       "session-a",
				Seq:             1,
				EpochSec:        nowEpoch,
				ProtocolVersion: 4,
				TempC10:         pint(250),
				Flags:           envRecTimeValid | envRecValidTemp,
				CRC16:           1234,
			},
		},
	}, "127.0.0.1", "test-agent")
	if err != nil {
		t.Fatalf("ingest failed: %v", err)
	}
	devices, err := s.OnListDevices(valid, ListDevicesReq{})
	if err != nil || len(devices.Devices) != 2 {
		t.Fatalf("list devices failed: devices=%+v err=%v", devices, err)
	}
	var gatewayID, envID string
	for _, device := range devices.Devices {
		if device.Type == deviceTypeGateway {
			gatewayID = device.ID
		}
		if device.Type == deviceTypeEnvMov {
			envID = device.ID
		}
	}

	saved, err := s.OnSaveDashboard(valid, SaveDashboardReq{
		Name:       "数据看板",
		TimeRange:  "6h",
		RefreshSec: 10,
		Widgets: []DashboardWidgetInput{
			{
				Title:     "温度",
				Type:      "line",
				DeviceIDs: []string{envID},
				Metrics:   []string{"temp_c10", "not_allowed"},
				TimeRange: "6h",
				Bucket:    "1m",
				Agg:       "avg",
			},
		},
	})
	if err != nil {
		t.Fatalf("save dashboard failed: %v", err)
	}
	if len(saved.Widgets) != 1 || len(saved.Widgets[0].Metrics) != 1 || saved.Widgets[0].Metrics[0] != "temp_c10" {
		t.Fatalf("expected metric allowlist enforcement: %+v", saved.Widgets)
	}
	queried, err := s.OnQueryDashboard(valid, QueryDashboardReq{})
	if err != nil || len(queried.Widgets) != 1 || len(queried.Widgets[0].Samples) != 1 {
		t.Fatalf("unexpected dashboard query: %+v err=%v", queried, err)
	}

	cmd, err := s.OnCreateCommand(valid, CreateCommandReq{
		DeviceID:    gatewayID,
		Type:        "ota",
		PayloadJSON: `{}`,
	})
	if err != nil {
		t.Fatalf("create command failed: %v", err)
	}
	polled, err := s.PollCommands(credential, DevicePollCommandsReq{GatewayKey: "gateway-aabbccdd", Limit: 10}, "127.0.0.1", "test-agent")
	if err != nil {
		t.Fatalf("poll command failed: %v", err)
	}
	if len(polled.Commands) != 1 || polled.Commands[0].ID != cmd.Command.ID {
		t.Fatalf("unexpected polled commands: %+v", polled)
	}
	polledAgain, err := s.PollCommands(credential, DevicePollCommandsReq{GatewayKey: "gateway-aabbccdd", Limit: 10}, "127.0.0.1", "test-agent")
	if err != nil {
		t.Fatalf("second poll failed: %v", err)
	}
	if len(polledAgain.Commands) != 0 {
		t.Fatalf("command should be leased, got %+v", polledAgain)
	}
	acked, err := s.CommandResult(credential, DeviceCommandResultReq{ID: cmd.Command.ID, Status: "acked"})
	if err != nil {
		t.Fatalf("command result failed: %v", err)
	}
	if !acked.Ack {
		t.Fatalf("expected ack")
	}

	if _, err = s.OnDeleteDevice(valid, DeleteDeviceReq{ID: envID}); err != nil {
		t.Fatalf("delete device failed: %v", err)
	}
	queriedAfterDelete, err := s.OnQueryDashboard(valid, QueryDashboardReq{})
	if err != nil {
		t.Fatalf("query after delete failed: %v", err)
	}
	if len(queriedAfterDelete.Widgets) != 1 || len(queriedAfterDelete.Widgets[0].Devices) != 1 || !queriedAfterDelete.Widgets[0].Devices[0].Deleted {
		t.Fatalf("dashboard should retain deleted device reference: %+v", queriedAfterDelete)
	}
	if len(queriedAfterDelete.Widgets[0].Samples) != 0 {
		t.Fatalf("deleted device samples should be removed: %+v", queriedAfterDelete.Widgets[0].Samples)
	}
}
