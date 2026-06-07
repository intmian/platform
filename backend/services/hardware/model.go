package hardware

import "time"

const (
	deviceTypeGateway = "gateway"
	deviceTypeEnvMov  = "env_mov"

	deviceStatusOnline  = "online"
	deviceStatusStale   = "stale"
	deviceStatusOffline = "offline"
	deviceStatusHidden  = "hidden"
	deviceStatusDeleted = "deleted"

	commandStatusPending   = "pending"
	commandStatusDelivered = "delivered"
	commandStatusAcked     = "acked"
	commandStatusFailed    = "failed"
	commandStatusCancelled = "cancelled"

	dashboardGlobalKey = "global"
)

type AccessCredential struct {
	ID          string     `json:"id" gorm:"primaryKey;column:id"`
	Name        string     `json:"name" gorm:"column:name"`
	TokenHash   string     `json:"-" gorm:"column:token_hash;uniqueIndex"`
	TokenPrefix string     `json:"tokenPrefix" gorm:"column:token_prefix"`
	Enabled     bool       `json:"enabled" gorm:"column:enabled;index"`
	LastUsedAt  *time.Time `json:"lastUsedAt" gorm:"column:last_used_at"`
	CreatedAt   time.Time  `json:"createdAt" gorm:"column:created_at"`
	UpdatedAt   time.Time  `json:"updatedAt" gorm:"column:updated_at"`
}

func (AccessCredential) TableName() string {
	return "hardware_access_credentials"
}

type Device struct {
	ID                  string     `json:"id" gorm:"primaryKey;column:id"`
	HardwareKey         string     `json:"hardwareKey" gorm:"column:hardware_key;index"`
	Type                string     `json:"type" gorm:"column:type;index"`
	Name                string     `json:"name" gorm:"column:name"`
	Hidden              bool       `json:"hidden" gorm:"column:hidden;index"`
	DeletedAt           *time.Time `json:"deletedAt" gorm:"column:deleted_at;index"`
	LastSeenAt          *time.Time `json:"lastSeenAt" gorm:"column:last_seen_at;index"`
	LastSampleAt        *time.Time `json:"lastSampleAt" gorm:"column:last_sample_at;index"`
	LastGatewayDeviceID string     `json:"lastGatewayDeviceId" gorm:"column:last_gateway_device_id;index"`
	LastSessionID       string     `json:"lastSessionId" gorm:"column:last_session_id;index"`
	LastSeq             uint32     `json:"lastSeq" gorm:"column:last_seq"`
	LastEpochSec        uint32     `json:"lastEpochSec" gorm:"column:last_epoch_sec;index"`
	LatestSampleID      string     `json:"latestSampleId" gorm:"column:latest_sample_id"`
	LastIP              string     `json:"lastIp" gorm:"column:last_ip"`
	UserAgent           string     `json:"userAgent" gorm:"column:user_agent"`
	MetaJSON            string     `json:"metaJson" gorm:"column:meta_json"`
	CreatedAt           time.Time  `json:"createdAt" gorm:"column:created_at"`
	UpdatedAt           time.Time  `json:"updatedAt" gorm:"column:updated_at"`
}

func (Device) TableName() string {
	return "hardware_devices"
}

type Sample struct {
	ID              string    `json:"id" gorm:"primaryKey;column:id"`
	DeviceID        string    `json:"deviceId" gorm:"column:device_id;index;uniqueIndex:idx_hw_sample_identity,priority:1"`
	GatewayDeviceID string    `json:"gatewayDeviceId" gorm:"column:gateway_device_id;index"`
	HardwareKey     string    `json:"hardwareKey" gorm:"column:hardware_key;index"`
	SessionID       string    `json:"sessionId" gorm:"column:session_id;index;uniqueIndex:idx_hw_sample_identity,priority:2"`
	Seq             uint32    `json:"seq" gorm:"column:seq;index;uniqueIndex:idx_hw_sample_identity,priority:3"`
	EpochSec        uint32    `json:"epochSec" gorm:"column:epoch_sec;index"`
	ProtocolVersion uint16    `json:"protocolVersion" gorm:"column:protocol_version"`
	TempC10         *int      `json:"tempC10" gorm:"column:temp_c10"`
	HumiRh          *int      `json:"humiRh" gorm:"column:humi_rh"`
	BattPct         *int      `json:"battPct" gorm:"column:batt_pct"`
	Scd41Co2Ppm     *int      `json:"scd41Co2Ppm" gorm:"column:scd41_co2_ppm"`
	TvocPpb         *int      `json:"tvocPpb" gorm:"column:tvoc_ppb"`
	VocAqi          *int      `json:"vocAqi" gorm:"column:voc_aqi"`
	Eco2Ppm         *int      `json:"eco2Ppm" gorm:"column:eco2_ppm"`
	Flags           uint16    `json:"flags" gorm:"column:flags"`
	CRC16           uint16    `json:"crc16" gorm:"column:crc16"`
	CreatedAt       time.Time `json:"createdAt" gorm:"column:created_at"`
	LegacyGatewayID string    `json:"-" gorm:"column:gateway_id;index"`
	LegacyNodeID    string    `json:"-" gorm:"column:node_id;index"`
	LegacyNodeKey   string    `json:"-" gorm:"column:node_key;index"`
}

func (Sample) TableName() string {
	return "hardware_samples"
}

type Dashboard struct {
	Key        string    `json:"key" gorm:"primaryKey;column:key"`
	Name       string    `json:"name" gorm:"column:name"`
	TimeRange  string    `json:"timeRange" gorm:"column:time_range"`
	RefreshSec int       `json:"refreshSec" gorm:"column:refresh_sec"`
	LayoutJSON string    `json:"layoutJson" gorm:"column:layout_json"`
	CreatedAt  time.Time `json:"createdAt" gorm:"column:created_at"`
	UpdatedAt  time.Time `json:"updatedAt" gorm:"column:updated_at"`
}

func (Dashboard) TableName() string {
	return "hardware_dashboards"
}

type DashboardWidget struct {
	ID            string    `json:"id" gorm:"primaryKey;column:id"`
	Title         string    `json:"title" gorm:"column:title"`
	Type          string    `json:"type" gorm:"column:type"`
	DeviceIDsJSON string    `json:"deviceIdsJson" gorm:"column:device_ids_json"`
	MetricsJSON   string    `json:"metricsJson" gorm:"column:metrics_json"`
	TimeRange     string    `json:"timeRange" gorm:"column:time_range"`
	Bucket        string    `json:"bucket" gorm:"column:bucket"`
	Agg           string    `json:"agg" gorm:"column:agg"`
	OptionsJSON   string    `json:"optionsJson" gorm:"column:options_json"`
	SortIndex     int       `json:"sortIndex" gorm:"column:sort_index;index"`
	CreatedAt     time.Time `json:"createdAt" gorm:"column:created_at"`
	UpdatedAt     time.Time `json:"updatedAt" gorm:"column:updated_at"`
	LegacyNodeIDs string    `json:"-" gorm:"column:node_ids_json"`
}

func (DashboardWidget) TableName() string {
	return "hardware_dashboard_widgets"
}

type Command struct {
	ID              string     `json:"id" gorm:"primaryKey;column:id"`
	DeviceID        string     `json:"deviceId" gorm:"column:device_id;index"`
	GatewayDeviceID string     `json:"gatewayDeviceId" gorm:"column:gateway_device_id;index"`
	Type            string     `json:"type" gorm:"column:type"`
	PayloadJSON     string     `json:"payloadJson" gorm:"column:payload_json"`
	Status          string     `json:"status" gorm:"column:status;index"`
	LeaseUntil      *time.Time `json:"leaseUntil" gorm:"column:lease_until;index"`
	DeliveredAt     *time.Time `json:"deliveredAt" gorm:"column:delivered_at"`
	AckedAt         *time.Time `json:"ackedAt" gorm:"column:acked_at"`
	CreatedBy       string     `json:"createdBy" gorm:"column:created_by"`
	LastError       string     `json:"lastError" gorm:"column:last_error"`
	CreatedAt       time.Time  `json:"createdAt" gorm:"column:created_at"`
	UpdatedAt       time.Time  `json:"updatedAt" gorm:"column:updated_at"`
	LegacyGatewayID string     `json:"-" gorm:"column:gateway_id;index"`
	LegacyNodeID    string     `json:"-" gorm:"column:node_id;index"`
	LegacyNodeKey   string     `json:"-" gorm:"column:node_key;index"`
}

func (Command) TableName() string {
	return "hardware_commands"
}

type LegacyGateway struct {
	ID          string
	Name        string
	TokenHash   string
	TokenPrefix string
	Enabled     bool
	LastSeenAt  *time.Time
	LastIP      string
	UserAgent   string
	CreatedAt   time.Time
	UpdatedAt   time.Time
}

func (LegacyGateway) TableName() string {
	return "hardware_gateways"
}

type LegacyNode struct {
	ID             string
	NodeKey        string
	NodeType       string
	Name           string
	Enabled        bool
	LastGatewayID  string
	LastSessionID  string
	LastSeq        uint32
	LastEpochSec   uint32
	LastSeenAt     *time.Time
	LatestSampleID string
	CreatedAt      time.Time
	UpdatedAt      time.Time
}

func (LegacyNode) TableName() string {
	return "hardware_nodes"
}
