package platform

import (
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/intmian/platform/backend/services/hardware"
	"github.com/intmian/platform/backend/share"
)

func (m *webMgr) hardwareService() (*hardware.Service, bool) {
	svr, ok := m.plat.core.service[share.FlagHardware]
	if !ok || svr == nil {
		return nil, false
	}
	hardwareSvr, ok := svr.(*hardware.Service)
	return hardwareSvr, ok
}

func deviceTokenFromRequest(c *gin.Context) string {
	auth := strings.TrimSpace(c.GetHeader("Authorization"))
	if strings.HasPrefix(strings.ToLower(auth), "bearer ") {
		return strings.TrimSpace(auth[len("bearer "):])
	}
	return strings.TrimSpace(c.GetHeader("X-Device-Token"))
}

func (m *webMgr) hardwareDeviceCredential(c *gin.Context) (*hardware.Service, hardware.AccessCredential, bool) {
	svr, ok := m.hardwareService()
	if !ok {
		c.JSON(http.StatusServiceUnavailable, makeErrReturn("hardware service unavailable"))
		return nil, hardware.AccessCredential{}, false
	}
	credential, err := svr.AuthenticateAccessToken(deviceTokenFromRequest(c))
	if err != nil {
		c.JSON(http.StatusUnauthorized, makeErrReturn(err.Error()))
		return nil, hardware.AccessCredential{}, false
	}
	return svr, credential, true
}

func (m *webMgr) hardwareDeviceIngest(c *gin.Context) {
	svr, credential, ok := m.hardwareDeviceCredential(c)
	if !ok {
		return
	}
	var req hardware.DeviceIngestReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, makeErrReturn("illegal param"))
		return
	}
	ret, err := svr.Ingest(credential, req, c.ClientIP(), c.Request.UserAgent())
	if err != nil {
		c.JSON(http.StatusBadRequest, makeErrReturn(err.Error()))
		return
	}
	OkReturn(c, ret)
}

func (m *webMgr) hardwareDevicePollCommands(c *gin.Context) {
	svr, credential, ok := m.hardwareDeviceCredential(c)
	if !ok {
		return
	}
	var req hardware.DevicePollCommandsReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, makeErrReturn("illegal param"))
		return
	}
	ret, err := svr.PollCommands(credential, req, c.ClientIP(), c.Request.UserAgent())
	if err != nil {
		c.JSON(http.StatusBadRequest, makeErrReturn(err.Error()))
		return
	}
	OkReturn(c, ret)
}

func (m *webMgr) hardwareDeviceCommandResult(c *gin.Context) {
	svr, credential, ok := m.hardwareDeviceCredential(c)
	if !ok {
		return
	}
	var req hardware.DeviceCommandResultReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, makeErrReturn("illegal param"))
		return
	}
	ret, err := svr.CommandResult(credential, req)
	if err != nil {
		c.JSON(http.StatusBadRequest, makeErrReturn(err.Error()))
		return
	}
	OkReturn(c, ret)
}
