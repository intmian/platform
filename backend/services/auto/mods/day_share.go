package mods

import (
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"time"

	"github.com/intmian/mian_go_lib/xstorage"
	"github.com/intmian/platform/backend/services/auto/setting"
)

// 飞书推送里的日报链接带一个按日期签名的 token，不登录也能看那一天的日报（只读、只限那一天）。
// 密钥存在 auto.report.share_secret，首次启动自动生成；在管理后台改掉它，所有旧链接立即失效。
// 链接不设过期：里面只有新闻和天气，泄露了换密钥即可。

const reportShareSecretKey = "auto.report.share_secret"

// reportShareTokenLen 是 token 的十六进制长度（64 位），对只读的新闻链接足够。
const reportShareTokenLen = 16

func initReportShareSecret() error {
	buf := make([]byte, 32)
	if _, err := rand.Read(buf); err != nil {
		return err
	}
	return setting.GSetting.SetDefault(reportShareSecretKey, xstorage.ToUnit[string](hex.EncodeToString(buf), xstorage.ValueTypeString))
}

func reportShareSecret() (string, error) {
	v, err := setting.GSetting.Get(reportShareSecretKey)
	if err != nil {
		return "", err
	}
	if v == nil {
		return "", errors.New("report share secret not exist")
	}
	secret := xstorage.ToBase[string](v)
	if secret == "" {
		return "", errors.New("report share secret is empty")
	}
	return secret, nil
}

func signReportDay(secret, day string) string {
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte("day-report:" + day))
	return hex.EncodeToString(mac.Sum(nil))[:reportShareTokenLen]
}

// ReportShareToken 返回某天日报的分享 token，day 形如 2006-01-02。
func ReportShareToken(day string) (string, error) {
	secret, err := reportShareSecret()
	if err != nil {
		return "", err
	}
	return signReportDay(secret, day), nil
}

// VerifyReportShareToken 校验分享 token 是否对应这一天。
func VerifyReportShareToken(day, token string) bool {
	if _, err := time.Parse("2006-01-02", day); err != nil {
		return false
	}
	secret, err := reportShareSecret()
	if err != nil || len(token) != reportShareTokenLen {
		return false
	}
	return hmac.Equal([]byte(signReportDay(secret, day)), []byte(token))
}

// reportLink 生成推送里用的日报地址；拿不到密钥时退回需要登录的普通地址。
func reportLink(day string) string {
	// TODO: 日后可以做成配置的基础url方便别人用
	link := fmt.Sprintf("https://plat.intmian.com/day-report/%s", day)
	token, err := ReportShareToken(day)
	if err != nil {
		return link
	}
	return link + "?t=" + token
}
