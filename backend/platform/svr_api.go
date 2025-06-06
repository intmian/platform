package platform

import (
	"context"
	"encoding/json"
	"fmt"
	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/intmian/mian_go_lib/tool/ai"
	"github.com/intmian/mian_go_lib/xstorage"
	"github.com/intmian/platform/backend/share"
	"strings"
	"time"
)

func (m *webMgr) serviceHandle(c *gin.Context) {
	name := c.Param("name")
	cmd := c.Param("cmd")
	bodyStr, err := c.GetRawData()
	if err != nil {
		c.JSON(200, gin.H{
			"code": 1,
			"msg":  "Get body error",
		})
		return
	}
	flag := m.plat.getFlag(share.SvrName(name))
	if flag == share.FlagNone {
		c.JSON(200, gin.H{
			"code": 1,
			"msg":  "service not exist",
		})
		return
	}
	msg := share.MakeMsgJson(share.Cmd(cmd), string(bodyStr))
	valid := m.getValid(c)
	t1 := time.Now()
	finish := make(chan interface{})
	go func() {
		<-finish
		delta := time.Now().Sub(t1)
		if delta > time.Minute {
			m.plat.log.Warning("PLAT", "serviceHandle too long [%s] [%s] [%s]", name, cmd, delta.String())
		}
	}()
	rec, err := m.plat.core.onRecRpc(flag, msg, valid)
	finish <- nil
	if err != nil {
		debug := false
		m.plat.baseSetting.SafeUseData(func(data share.BaseSetting) {
			debug = data.Debug
		}, false)
		if debug {
			c.JSON(200, makeErrReturn(err.Error()))
			return
		}
		c.JSON(200, gin.H{
			"code": 1,
			"msg":  "svr error",
		})
		return
	}
	c.JSON(200, gin.H{
		"code": 0,
		"data": rec,
	})
}

type WebDebugParam struct {
	IntValues []int     `json:"ints"`
	F64Values []float64 `json:"f64s"`
	StrValues []string  `json:"strs"`
}

func (m *webMgr) serviceDebugHandle(c *gin.Context) {
	m.plat.baseSetting.SafeUseData(func(data share.BaseSetting) {
		if data.Debug == false {
			c.JSON(200, makeErrReturn("debug not open"))
		}
	}, false)
	name := c.Param("name")
	cmd := c.Param("cmd")
	bodyStr, err := c.GetRawData()
	if err != nil {
		c.JSON(200, gin.H{
			"code": 1,
			"msg":  "Get body error",
		})
		return
	}
	flag := m.plat.getFlag(share.SvrName(name))
	if flag == share.FlagNone {
		c.JSON(200, makeErrReturn("service not exist"))
		return
	}
	webDebugParam := WebDebugParam{}
	err = json.Unmarshal(bodyStr, &webDebugParam)
	if err != nil {
		c.JSON(200, makeErrReturn("illegal param"))
	}
	svr := m.plat.core.service[flag]
	params := share.DebugParams{}
	params.IntParams.Append(webDebugParam.IntValues...)
	params.F64Params.Append(webDebugParam.F64Values...)
	params.StrParams.Append(webDebugParam.StrValues...)
	ret := svr.DebugCommand(share.DebugReq{
		Cmd:    cmd,
		Params: params,
	})
	c.JSON(200, makeOkReturn(ret))
}

func (m *webMgr) cfgPlatSet(c *gin.Context) {
	valid := m.getValid(c)
	if !valid.HasPermission("admin") && !valid.HasPermission("plat.cfg") {
		c.JSON(200, gin.H{
			"code": 1,
			"msg":  "no permission",
		})
		return
	}
	opr := struct {
		Key string `json:"key"`
		Val string `json:"val"`
	}{}
	err := c.BindJSON(&opr)
	if err != nil {
		c.JSON(200, gin.H{
			"code": 1,
			"msg":  "illegal param",
		})
		return
	}

	err = m.plat.cfg.Set(xstorage.Join("PLAT", opr.Key), opr.Val)
	if err != nil {
		c.JSON(200, gin.H{
			"code": 1,
			"msg":  "inner error",
		})
		return
	}
	c.JSON(200, makeOkReturn(nil))
	m.plat.log.Info("PLAT", "cfgPlatSet [%s] [%s]", opr.Key, opr.Val)
}

func (m *webMgr) cfgServiceSet(c *gin.Context) {
	// 暂时先全在core校验权限，后续可以考虑拆分
	svr := c.Param("svr")
	if m.plat.getFlag(share.SvrName(svr)) == share.FlagNone {
		c.JSON(200, gin.H{
			"code": 1,
			"msg":  "service not exist",
		})
		return
	}
	valid := m.getValid(c)
	if !valid.HasOnePermission(share.Permission(svr), getStr2Permission(svr, "cfg"), "admin") {
		c.JSON(200, gin.H{
			"code": 1,
			"msg":  "no permission",
		})
		return
	}
	opr := struct {
		Key string `json:"key"`
		Val string `json:"val"`
	}{}
	err := c.BindJSON(&opr)
	if err != nil {
		c.JSON(200, gin.H{
			"code": 1,
			"msg":  "illegal param",
		})
		return
	}

	err = m.plat.cfg.Set(xstorage.Join(svr, opr.Key), opr.Val)
	c.JSON(200, makeOkReturn(nil))
	m.plat.log.Info("PLAT", "cfgServiceSet [%s] [%s] [%s]", svr, opr.Key, opr.Val)
}

func (m *webMgr) cfgServiceUserSet(c *gin.Context) {
	// 暂时先不校验权限，后面看情况再说
	svr := c.Param("svr")
	user := c.Param("user")
	opr := struct {
		Key string `json:"key"`
		Val string `json:"val"`
	}{}
	err := c.BindJSON(&opr)
	if err != nil {
		c.JSON(200, makeErrReturn("illegal param"))
		return
	}

	err = m.plat.cfg.SetUser(user, xstorage.Join(svr, opr.Key), opr.Val)
	if err != nil {
		c.JSON(200, makeErrReturn("inner error"))
		return
	}

	c.JSON(200, makeOkReturn(nil))
}

func (m *webMgr) cfgPlatGet(c *gin.Context) {
	valid := m.getValid(c)
	if !valid.HasPermission("admin") && !valid.HasPermission("plat.cfg") {
		c.JSON(200, makeErrReturn("no permission"))
		return
	}
	val, err := m.plat.cfg.GetWithFilter("PLAT", "")
	if err != nil {
		c.JSON(200, makeErrReturn("inner error"))
		return
	}
	c.JSON(200, makeOkReturn(val))
}

func (m *webMgr) cfgServiceGet(c *gin.Context) {
	svr := c.Param("svr")
	if m.plat.getFlag(share.SvrName(svr)) == share.FlagNone {
		c.JSON(200, makeErrReturn("service not exist"))
		return
	}
	valid := m.getValid(c)
	if !valid.HasOnePermission(share.Permission(svr), getStr2Permission(svr, "cfg"), "admin") {
		c.JSON(200, makeErrReturn("no permission"))
		return
	}
	val, err := m.plat.cfg.GetWithFilter(svr, "")
	if err != nil {
		c.JSON(200, makeErrReturn("inner error"))
		return
	}
	c.JSON(200, makeOkReturn(val))
}

func (m *webMgr) cfgServiceUserGet(c *gin.Context) {
	svr := c.Param("svr")
	user := c.Param("user")
	val, err := m.plat.cfg.GetWithFilter(svr, user)
	if err != nil {
		c.JSON(200, makeErrReturn("inner error"))
		return
	}
	c.JSON(200, makeOkReturn(val))
}

// GptOptimization 获取gpt优化过的内容
func (m *webMgr) gptRewrite(c *gin.Context) {
	valid := m.getValid(c)
	if !valid.HasOnePermission("gpt", "admin") {
		c.JSON(200, makeErrReturn("no permission"))
		return
	}

	// 从请求中获取内容
	var req struct {
		Content string `json:"content"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(400, gin.H{"error": "Invalid request"})
		return
	}

	// 调用GPT优化函数
	// 获取 base 配置
	baseV, err := m.plat.storage.Get("openai.base")
	if err != nil || baseV == nil {
		c.JSON(200, makeErrReturn("svr error"))
	}
	base := xstorage.ToBase[string](baseV)
	if base == "" || base == "need input" {
		c.JSON(200, makeErrReturn("openai.base is empty"))
	}

	// 获取 token 配置
	tokenV, err := m.plat.storage.Get("openai.token")
	if err != nil || tokenV == nil {
		c.JSON(200, makeErrReturn("svr error"))
	}
	token := xstorage.ToBase[string](tokenV)
	if token == "" || token == "need input" {
		c.JSON(200, makeErrReturn("openai.token is empty"))
	}

	bot := ai.NewOpenAI(base, token, false, ai.AiTypeChatGPT)
	if bot == nil {
		c.JSON(200, makeErrReturn("openai init error"))
		return
	}

	ask := "以下是我的语音输入内容，其中可能包含口误、口语化表达或识别错误。请对其进行优化和重写，使其语法正确、逻辑清晰，去除重复和冗长的表述。确保不遗漏任何内容，对于不确定的部分，请使用括号标注。无需添加任何官话或套话:\n" + req.Content
	newContent, err := bot.Chat(ask)
	if err != nil {
		c.JSON(200, makeErrReturn("svr error"))
		return
	}
	// 将双换行替换为单换行
	newContent = strings.ReplaceAll(newContent, "\n\n", "\n")
	c.JSON(200, makeOkReturn(newContent))
}

func InitR2Client(endpoint, accessKey, secretKey string) *s3.Client {
	endpointResolver := aws.EndpointResolverWithOptionsFunc(
		func(service, region string, options ...interface{}) (aws.Endpoint, error) {
			return aws.Endpoint{
				URL:           endpoint,
				SigningRegion: "auto",
			}, nil
		},
	)

	cfg, err := config.LoadDefaultConfig(context.TODO(),
		config.WithRegion("auto"),
		config.WithCredentialsProvider(credentials.NewStaticCredentialsProvider(
			accessKey, secretKey, "",
		)),
		config.WithEndpointResolverWithOptions(endpointResolver),
	)
	if err != nil {
		return nil
	}

	return s3.NewFromConfig(cfg)
}

type R2Cfg struct {
	Endpoint  string
	AccessKey string
	SecretKey string
	Bucket    string
	Web       string
}

func (m *webMgr) getR2Cfg() (R2Cfg, error) {
	var r2 R2Cfg
	Endpoint, err1 := m.plat.cfg.Get("PLAT.r2.endpoint")
	AccessKey, err2 := m.plat.cfg.Get("PLAT.r2.accessKey")
	SecretKey, err3 := m.plat.cfg.Get("PLAT.r2.secretKey")
	Bucket, err4 := m.plat.cfg.Get("PLAT.r2.bucket")
	Web, err5 := m.plat.cfg.Get("PLAT.r2.web")
	if err1 != nil || err2 != nil || err3 != nil || err4 != nil || err5 != nil {
		return r2, fmt.Errorf("r2 config error")
	}
	r2.Endpoint = xstorage.ToBase[string](Endpoint)
	r2.AccessKey = xstorage.ToBase[string](AccessKey)
	r2.SecretKey = xstorage.ToBase[string](SecretKey)
	r2.Bucket = xstorage.ToBase[string](Bucket)
	r2.Web = xstorage.ToBase[string](Web)
	if r2.Endpoint == "" || r2.AccessKey == "" || r2.SecretKey == "" || r2.Bucket == "" || r2.Web == "" {
		return r2, fmt.Errorf("r2 config error")
	}
	return r2, nil
}

// 获得cloudflare r2 Presigned URL
func (m *webMgr) getR2PresignedURL(c *gin.Context) {
	valid := m.getValid(c)
	if !valid.HasOnePermission("file", "admin") {
		c.JSON(200, makeErrReturn("no permission"))
		return
	}
	// 从请求中获取内容
	var req struct {
		FileName string `json:"fileName"`
		FileType string `json:"fileType"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(400, makeErrReturn("Invalid request"))
		return
	}
	now := time.Now()
	key := fmt.Sprintf("uploads/%d/%d/%d/%s/%s/%s", now.Year(), now.Month(), now.Day(), valid.User, uuid.New().String(), req.FileName)

	var r2Endpoint, r2AccessKey, r2SecretKey, r2Bucket, outWeb string
	cfg, err := m.getR2Cfg()
	if err != nil {
		c.JSON(200, makeErrReturn("r2 config error"))
		return
	}
	r2Endpoint = cfg.Endpoint
	r2AccessKey = cfg.AccessKey
	r2SecretKey = cfg.SecretKey
	r2Bucket = cfg.Bucket
	outWeb = cfg.Web

	r2Client := InitR2Client(r2Endpoint, r2AccessKey, r2SecretKey)
	if r2Client == nil {
		c.JSON(200, makeErrReturn("r2 params invalid"))
		return
	}

	presignClient := s3.NewPresignClient(r2Client)
	presigned, _ := presignClient.PresignPutObject(context.TODO(), &s3.PutObjectInput{
		Bucket:      aws.String(r2Bucket),
		Key:         aws.String(key),
		ContentType: aws.String(req.FileType),
	}, s3.WithPresignExpires(15*time.Minute))

	publicURL := fmt.Sprintf("%s/%s", outWeb, key)

	c.JSON(200, makeOkReturn(gin.H{
		"UploadURL": presigned.URL,
		"PublicURL": publicURL,
	}))
}
