package d1gormadapterbaseline

import (
	"database/sql"
	"fmt"
	"os"
	"strings"
	"testing"
	"time"

	d1 "github.com/intmian/mian_go_lib/fork/d1_gorm_adapter"
	"github.com/intmian/mian_go_lib/fork/d1_gorm_adapter/gormd1"
	_ "github.com/intmian/mian_go_lib/fork/d1_gorm_adapter/stdlib"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

type BenchRow struct {
	ID        int64 `gorm:"primaryKey"`
	Name      string
	Flag      bool
	UpdatedAt time.Time
}

type BenchDir struct {
	ID        int64 `gorm:"primaryKey"`
	Name      string
	UpdatedAt time.Time
}

type BenchGroup struct {
	ID        int64 `gorm:"primaryKey"`
	DirID     int64
	Name      string
	UpdatedAt time.Time
}

type BenchSubGroup struct {
	ID        int64 `gorm:"primaryKey"`
	GroupID   int64
	Name      string
	UpdatedAt time.Time
}

type BenchTask struct {
	ID         int64 `gorm:"primaryKey"`
	SubGroupID int64
	Name       string
	Note       string
	UpdatedAt  time.Time
}

type BenchTag struct {
	ID        int64 `gorm:"primaryKey"`
	TaskID    int64
	Name      string
	UpdatedAt time.Time
}

func d1Env(names ...string) string {
	for _, name := range names {
		if value := os.Getenv(name); value != "" {
			return value
		}
	}
	return ""
}

func dsn(tb testing.TB) string {
	tb.Helper()
	accountID := d1Env("D1_ACCOUNT_ID", "ACCOUNT_ID")
	apiToken := d1Env("D1_API_TOKEN", "API_TOKEN")
	databaseID := d1Env("D1_DATABASE_ID", "DATABASE_ID")
	if accountID == "" || apiToken == "" || databaseID == "" {
		tb.Fatal("missing D1 env vars: set D1_ACCOUNT_ID, D1_API_TOKEN, D1_DATABASE_ID")
	}
	return fmt.Sprintf("d1://%s:%s@%s", accountID, apiToken, databaseID)
}

func openGorm(tb testing.TB) *gorm.DB {
	tb.Helper()
	db, err := gorm.Open(gormd1.Open(dsn(tb)), &gorm.Config{
		SkipDefaultTransaction: true,
		Logger:                 logger.Default.LogMode(logger.Silent),
	})
	if err != nil {
		tb.Fatal(err)
	}
	return db
}

func openSQL(tb testing.TB) *sql.DB {
	tb.Helper()
	db, err := sql.Open(d1.DriverName, dsn(tb))
	if err != nil {
		tb.Fatal(err)
	}
	return db
}

func closeGorm(tb testing.TB, db *gorm.DB) {
	tb.Helper()
	sqlDB, err := db.DB()
	if err != nil {
		tb.Fatal(err)
	}
	if err := sqlDB.Close(); err != nil {
		tb.Fatal(err)
	}
}

func requireWrites(tb testing.TB) {
	tb.Helper()
	if os.Getenv("D1_INCLUDE_WRITES") != "1" {
		tb.Skip("set D1_INCLUDE_WRITES=1 to run write tests")
	}
}

func uniqueTable(prefix string) string {
	cleanPrefix := strings.Map(func(r rune) rune {
		switch {
		case r >= 'a' && r <= 'z':
			return r
		case r >= 'A' && r <= 'Z':
			return r
		case r >= '0' && r <= '9':
			return r
		case r == '_':
			return r
		default:
			return '_'
		}
	}, prefix)
	return fmt.Sprintf("%s_%d", cleanPrefix, time.Now().UnixNano())
}

func dropTable(tb testing.TB, db *gorm.DB, table string) {
	tb.Helper()
	if err := db.Exec("DROP TABLE IF EXISTS " + table).Error; err != nil {
		tb.Logf("drop table %s failed: %v", table, err)
	}
}

func mustCreateCRUDTable(tb testing.TB, db *gorm.DB, table string) {
	tb.Helper()
	err := db.Exec("CREATE TABLE IF NOT EXISTS " + table + " (id INTEGER PRIMARY KEY, name TEXT, flag INTEGER, payload BLOB, time_value DATETIME)").Error
	if err != nil {
		tb.Fatal(err)
	}
}
