package account

import (
	"encoding/json"
	"errors"
	"github.com/intmian/mian_go_lib/tool/cipher"
	"github.com/intmian/mian_go_lib/tool/misc"
	"github.com/intmian/mian_go_lib/xstorage"
	share2 "github.com/intmian/platform/backend/share"
	"regexp"
	"time"
)

/*
accountMgr 账户管理
仅进行数据管理，鉴权请去上层
密码以 sha256(salt1+密码+账户) 存储
*/
type accountMgr struct {
	accDb       xstorage.XStorage
	iniAdminPwd string
	initTag     misc.InitTag
}

type accountDbData struct {
	Token2permissions map[string][]share2.Permission `json:"token2Permissions"`
	Creator           string                         `json:"creator"`
	CreateAt          time.Time                      `json:"createAt"`
	ModifyAt          time.Time                      `json:"modifyAt"`
}

const salt = "秋天真猪23333"

func getToken(account string, password string) string {
	return cipher.Sha2562String(salt + password + account)
}

func (a *accountMgr) Init(iniAdminPwd string) error {
	err := a.accDb.Init(xstorage.XStorageSetting{
		Property: misc.CreateProperty(xstorage.UseCache, xstorage.MultiSafe, xstorage.UseDisk, xstorage.FullInitLoad),
		SaveType: xstorage.SqlLiteDB,
		DBAddr:   "account.db",
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

func (a *accountMgr) register(account string, password string, permission share2.Permission, creator string) error {
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

func (a *accountMgr) changePermission(account string, token string, permission share2.Permission) error {
	if !a.initTag.IsInitialized() {
		return ErrAccountMgrNotInit
	}
	sv, err := a.accDb.Get(account)
	if err != nil {
		return errors.Join(err, ErrAccDbGetErr)
	}
	if sv == nil {
		return ErrAccountNotExist
	}
	var ad accountDbData
	dbStr := xstorage.ToBase[string](sv)
	err = json.Unmarshal([]byte(dbStr), &ad)
	if err != nil {
		return errors.Join(err)
	}
	ad.ModifyAt = time.Now()
	ad.Token2permissions[token] = append(ad.Token2permissions[token], permission)
	dbStrB, err := json.Marshal(ad)
	if err != nil {
		return errors.Join(err, ErrJsonMarshalErr)
	}
	dbStr = string(dbStrB)
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

func (a *accountMgr) getPermission(account string) (map[string][]share2.Permission, error) {
	if !a.initTag.IsInitialized() {
		return nil, ErrAccountMgrNotInit
	}
	sv, err := a.accDb.Get(account)
	if err != nil {
		return nil, errors.Join(err, ErrAccDbGetErr)
	}
	if sv == nil {
		return nil, ErrAccountNotExist
	}
	var ad accountDbData
	dbStr := xstorage.ToBase[string](sv)
	err = json.Unmarshal([]byte(dbStr), &ad)
	if err != nil {
		return nil, errors.Join(err, ErrJsonUnmarshalFailed)
	}
	return ad.Token2permissions, nil
}

func (a *accountMgr) checkPermission(account string, token string) ([]share2.Permission, error) {
	if !a.initTag.IsInitialized() {
		return nil, ErrAccountMgrNotInit
	}
	sv, err := a.accDb.Get(account)
	if err != nil {
		return nil, errors.Join(err, ErrAccDbGetErr)
	}
	if sv == nil {
		if account == "admin" {
			// 没有账号去读初始密码
			if getToken(account, token) == getToken(account, a.iniAdminPwd) {
				return []share2.Permission{share2.PermissionAdmin}, nil
			} else {
				return nil, ErrTokenNotExist
			}
		}
		return nil, ErrAccountNotExist
	}
	var ad accountDbData
	dbStr := xstorage.ToBase[string](sv)
	err = json.Unmarshal([]byte(dbStr), &ad)
	if err != nil {
		return nil, errors.Join(err, ErrJsonUnmarshalFailed)
	}
	pers, ok := ad.Token2permissions[token]
	if !ok {
		return nil, ErrTokenNotExist
	}
	return pers, nil
}
