package web_storage

import "github.com/intmian/platform/services/share"

type Service struct {
	share share.ServiceShare
	share.ServiceBase
}
