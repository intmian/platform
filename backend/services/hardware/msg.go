package hardware

import "github.com/intmian/platform/backend/share"

const (
	CmdListDevices      share.Cmd = "listDevices"
	CmdUpdateDevice     share.Cmd = "updateDevice"
	CmdDeleteDevice     share.Cmd = "deleteDevice"
	CmdListCredentials  share.Cmd = "listCredentials"
	CmdCreateCredential share.Cmd = "createCredential"
	CmdRotateCredential share.Cmd = "rotateCredential"
	CmdUpdateCredential share.Cmd = "updateCredential"
	CmdDeleteCredential share.Cmd = "deleteCredential"
	CmdQuerySamples     share.Cmd = "querySamples"
	CmdListCommands     share.Cmd = "listCommands"
	CmdCreateCommand    share.Cmd = "createCommand"
	CmdCancelCommand    share.Cmd = "cancelCommand"
	CmdGetDashboard     share.Cmd = "getDashboard"
	CmdSaveDashboard    share.Cmd = "saveDashboard"
	CmdQueryDashboard   share.Cmd = "queryDashboard"
)

type ListDevicesReq struct {
	IncludeHidden  bool `json:"includeHidden"`
	IncludeDeleted bool `json:"includeDeleted"`
}

type ListDevicesRet struct {
	Devices []DeviceDTO `json:"devices"`
}

type UpdateDeviceReq struct {
	ID     string `json:"id"`
	Name   string `json:"name"`
	Hidden bool   `json:"hidden"`
}

type DeviceMutationRet struct {
	Device DeviceDTO `json:"device"`
}

type DeleteDeviceReq struct {
	ID string `json:"id"`
}

type DeleteDeviceRet struct {
	Deleted bool `json:"deleted"`
}

type ListCredentialsReq struct{}

type ListCredentialsRet struct {
	Credentials []CredentialDTO `json:"credentials"`
}

type CreateCredentialReq struct {
	Name string `json:"name"`
}

type CreateCredentialRet struct {
	Credential CredentialDTO `json:"credential"`
	Token      string        `json:"token"`
}

type RotateCredentialReq struct {
	ID string `json:"id"`
}

type RotateCredentialRet struct {
	Credential CredentialDTO `json:"credential"`
	Token      string        `json:"token"`
}

type UpdateCredentialReq struct {
	ID      string `json:"id"`
	Name    string `json:"name"`
	Enabled bool   `json:"enabled"`
}

type CredentialMutationRet struct {
	Credential CredentialDTO `json:"credential"`
}

type DeleteCredentialReq struct {
	ID string `json:"id"`
}

type DeleteCredentialRet struct {
	Deleted bool `json:"deleted"`
}

type QuerySamplesReq struct {
	DeviceIDs    []string `json:"deviceIds"`
	DeviceID     string   `json:"deviceId"`
	Metric       string   `json:"metric"`
	FromEpochSec uint32   `json:"fromEpochSec"`
	ToEpochSec   uint32   `json:"toEpochSec"`
	TimeRange    string   `json:"timeRange"`
	Bucket       string   `json:"bucket"`
	Agg          string   `json:"agg"`
	Limit        int      `json:"limit"`
}

type QuerySamplesRet struct {
	Samples []SampleDTO `json:"samples"`
}

type ListCommandsReq struct {
	DeviceID string `json:"deviceId"`
	Limit    int    `json:"limit"`
}

type ListCommandsRet struct {
	Commands []CommandDTO `json:"commands"`
}

type CreateCommandReq struct {
	DeviceID    string `json:"deviceId"`
	Type        string `json:"type"`
	PayloadJSON string `json:"payloadJson"`
}

type CreateCommandRet struct {
	Command CommandDTO `json:"command"`
}

type CancelCommandReq struct {
	ID string `json:"id"`
}

type CancelCommandRet struct {
	Command CommandDTO `json:"command"`
}

type GetDashboardReq struct{}

type GetDashboardRet struct {
	Dashboard DashboardDTO         `json:"dashboard"`
	Widgets   []DashboardWidgetDTO `json:"widgets"`
}

type SaveDashboardReq struct {
	Name       string                 `json:"name"`
	TimeRange  string                 `json:"timeRange"`
	RefreshSec int                    `json:"refreshSec"`
	LayoutJSON string                 `json:"layoutJson"`
	Widgets    []DashboardWidgetInput `json:"widgets"`
}

type SaveDashboardRet struct {
	Dashboard DashboardDTO         `json:"dashboard"`
	Widgets   []DashboardWidgetDTO `json:"widgets"`
}

type QueryDashboardReq struct{}

type QueryDashboardRet struct {
	Widgets []DashboardWidgetResult `json:"widgets"`
}

type CredentialDTO struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	TokenPrefix string `json:"tokenPrefix"`
	Enabled     bool   `json:"enabled"`
	LastUsedAt  string `json:"lastUsedAt"`
	CreatedAt   string `json:"createdAt"`
	UpdatedAt   string `json:"updatedAt"`
}

type DeviceDTO struct {
	ID                  string     `json:"id"`
	HardwareKey         string     `json:"hardwareKey"`
	Type                string     `json:"type"`
	Name                string     `json:"name"`
	Hidden              bool       `json:"hidden"`
	Deleted             bool       `json:"deleted"`
	Status              string     `json:"status"`
	LastSeenAt          string     `json:"lastSeenAt"`
	LastSampleAt        string     `json:"lastSampleAt"`
	LastGatewayDeviceID string     `json:"lastGatewayDeviceId"`
	LastEpochSec        uint32     `json:"lastEpochSec"`
	LastIP              string     `json:"lastIp"`
	UserAgent           string     `json:"userAgent"`
	LatestSample        *SampleDTO `json:"latestSample,omitempty"`
	CreatedAt           string     `json:"createdAt"`
	UpdatedAt           string     `json:"updatedAt"`
}

type SampleDTO struct {
	ID              string `json:"id"`
	DeviceID        string `json:"deviceId"`
	GatewayDeviceID string `json:"gatewayDeviceId"`
	HardwareKey     string `json:"hardwareKey"`
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
	CreatedAt       string `json:"createdAt"`
}

type CommandDTO struct {
	ID              string `json:"id"`
	DeviceID        string `json:"deviceId"`
	GatewayDeviceID string `json:"gatewayDeviceId"`
	Type            string `json:"type"`
	Status          string `json:"status"`
	LeaseUntil      string `json:"leaseUntil"`
	DeliveredAt     string `json:"deliveredAt"`
	AckedAt         string `json:"ackedAt"`
	CreatedBy       string `json:"createdBy"`
	LastError       string `json:"lastError"`
	CreatedAt       string `json:"createdAt"`
	UpdatedAt       string `json:"updatedAt"`
}

type DashboardDTO struct {
	Name       string `json:"name"`
	TimeRange  string `json:"timeRange"`
	RefreshSec int    `json:"refreshSec"`
	LayoutJSON string `json:"layoutJson"`
	UpdatedAt  string `json:"updatedAt"`
}

type DashboardWidgetDTO struct {
	ID          string   `json:"id"`
	Title       string   `json:"title"`
	Type        string   `json:"type"`
	DeviceIDs   []string `json:"deviceIds"`
	Metrics     []string `json:"metrics"`
	TimeRange   string   `json:"timeRange"`
	Bucket      string   `json:"bucket"`
	Agg         string   `json:"agg"`
	OptionsJSON string   `json:"optionsJson"`
	SortIndex   int      `json:"sortIndex"`
}

type DashboardWidgetInput struct {
	ID          string   `json:"id"`
	Title       string   `json:"title"`
	Type        string   `json:"type"`
	DeviceIDs   []string `json:"deviceIds"`
	Metrics     []string `json:"metrics"`
	TimeRange   string   `json:"timeRange"`
	Bucket      string   `json:"bucket"`
	Agg         string   `json:"agg"`
	OptionsJSON string   `json:"optionsJson"`
	SortIndex   int      `json:"sortIndex"`
}

type DashboardWidgetResult struct {
	Widget  DashboardWidgetDTO `json:"widget"`
	Devices []DeviceDTO        `json:"devices"`
	Samples []SampleDTO        `json:"samples"`
	Latest  []SampleDTO        `json:"latest"`
}
