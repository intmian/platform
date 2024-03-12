package account

import (
	"encoding/json"
	"errors"
	"github.com/intmian/mian_go_lib/tool/cipher"
	"github.com/intmian/mian_go_lib/tool/misc"
	"github.com/intmian/mian_go_lib/xstorage"
	"github.com/intmian/platform/services/account/share"
	"regexp"
	"time"
)

/*
accountMgr 账户管理
必须拥有admin权限才能分配账户
密码以 sha256(salt1+密码+账户) 存储
*/
type accountMgr struct {
	accDb       xstorage.XStorage
	iniAdminPwd string
	initTag     misc.InitTag
}

type accountDbData struct {
	Token2permissions map[string][]share.Permission `json:"token2Permissions"`
	Creator           string                        `json:"creator"`
	CreateAt          time.Time                     `json:"createAt"`
	ModifyAt          time.Time                     `json:"modifyAt"`
}

const salt = "秋天真猪23333"

func getToken(account string, password string) string {
	return cipher.Sha2562String(salt + password + account)
}

func (a *accountMgr) Init(iniAdminPwd string) error {
	err := a.accDb.Init(xstorage.XStorageSetting{
		Property: misc.CreateProperty(xstorage.UseCache, xstorage.MultiSafe, xstorage.UseDisk, xstorage.FullInitLoad),
		SaveType: xstorage.SqlLiteDB,
		DBAddr:   "test.db",
	})
	if err != nil {
		return errors.Join(err, ErrAccDbInitErr)
	}
	a.iniAdminPwd = iniAdminPwd
	a.initTag.SetInitialized()
	return nil
}

func checkPwd(pwd string) bool {
	// 必须且只能含有数字、字母、下划线
	// 长度必须在6-20之间
	reg := regexp.MustCompile(`^\w{6,20}$`)
	return reg.MatchString(pwd)
}

func (a *accountMgr) register(account string, password string, permission share.Permission, creator string) error {
	if !a.initTag.IsInitialized() {
		return ErrAccountMgrNotInit
	}
	if !checkPwd(password) {
		return ErrPasswordFormatError
	}
	sv, err := a.accDb.Get(account)
	if err != nil {
		return errors.Join(err, ErrAccDbGetErr)
	}
	var ad accountDbData
	if sv != nil {
		dbStr := xstorage.ToBase[string](sv)
		err = json.Unmarshal([]byte(dbStr), &ad)
	} else {
		ad.CreateAt = time.Now()
		ad.Creator = creator
	}
	ad.ModifyAt = time.Now()
	token := getToken(account, password)
	ad.Token2permissions[token] = append(ad.Token2permissions[token], permission)
	dbStr, err := json.Marshal(ad)
	if err != nil {
		return errors.Join(err, ErrJsonMarshalErr)
	}
	err = a.accDb.Set(account, xstorage.ToUnit[string](string(dbStr), xstorage.ValueTypeString))
	if err != nil {
		return errors.Join(err, ErrAccDbSetErr)

	}
	return nil
}

func (a *accountMgr) deregister(account string) error {
	if !a.initTag.IsInitialized() {
		return ErrAccountMgrNotInit
	}
	// 先判断有没有
	_, err := a.accDb.Get(account)
	if err != nil {
		return errors.Join(err, ErrAccDbGetErr)
	}
	// 删除
	err = a.accDb.Delete(account)
	if err != nil {
		return errors.Join(err, ErrAccDbDeleteErr)
	}
	return nil
}

func (a *accountMgr) checkToken(account string, token string) bool {
	if !a.initTag.IsInitialized() {
		return false
	}
	token2, err := a.accDb.Get(account)
	if err != nil {
		return false
	}
	if token2 == nil && account == "admin" {
		if token == getToken(account, a.iniAdminPwd) {
			return true
		}
		return false
	}
	if xstorage.ToBase[string](token2) != getToken(account, token) {
		return false
	}
	return true
}
