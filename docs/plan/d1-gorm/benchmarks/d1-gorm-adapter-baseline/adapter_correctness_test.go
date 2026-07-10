package d1gormadapterbaseline

import (
	"database/sql"
	"errors"
	"testing"
	"time"

	d1 "github.com/intmian/mian_go_lib/fork/d1_gorm_adapter"
	"github.com/intmian/mian_go_lib/fork/d1_gorm_adapter/gormd1"
	"gorm.io/gorm"
)

func TestDSNValidationWithoutNetwork(t *testing.T) {
	tests := []struct {
		name string
		dsn  string
		err  error
	}{
		{name: "empty", dsn: "", err: d1.ErrEmptyDSN},
		{name: "short", dsn: "d1://", err: d1.ErrShortDSN},
		{name: "not_d1", dsn: "mysql://user:pass@example", err: d1.ErrNotD1},
		{name: "invalid_db_id", dsn: "d1://account:token@short", err: d1.ErrInvalidDB},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, err := d1.Open(tt.dsn)
			if !errors.Is(err, tt.err) {
				t.Fatalf("expected %v, got %v", tt.err, err)
			}
		})
	}
}

func TestReadOnlyQueryAndEmptyResult(t *testing.T) {
	db := openGorm(t)
	defer closeGorm(t, db)

	var one int
	if err := db.Raw("SELECT 1").Scan(&one).Error; err != nil {
		t.Fatal(err)
	}
	if one != 1 {
		t.Fatalf("expected 1, got %d", one)
	}

	var rows []struct {
		Value int
	}
	if err := db.Raw("SELECT 1 AS value WHERE 1 = 0").Scan(&rows).Error; err != nil {
		t.Fatal(err)
	}
	if len(rows) != 0 {
		t.Fatalf("expected empty result, got %d rows", len(rows))
	}
}

func TestStdlibParameterizedScan(t *testing.T) {
	db := openSQL(t)
	defer db.Close()

	wantTime := time.Date(2026, 7, 9, 12, 34, 56, 789, time.UTC)
	wantBytes := []byte{0, 1, 2, 200, 255}

	var intValue int64
	var textValue string
	var boolValue bool
	var timeValue time.Time
	var bytesValue []byte

	err := db.QueryRow(
		"SELECT ? AS int_value, ? AS text_value, ? AS bool_value, ? AS time_value, ? AS bytes_value",
		int64(42),
		"hello",
		true,
		wantTime,
		wantBytes,
	).Scan(&intValue, &textValue, &boolValue, &timeValue, &bytesValue)
	if err != nil {
		t.Fatal(err)
	}

	if intValue != 42 || textValue != "hello" || !boolValue || !timeValue.Equal(wantTime) || string(bytesValue) != string(wantBytes) {
		t.Fatalf("unexpected scan values: int=%d text=%q bool=%t time=%s bytes=%v", intValue, textValue, boolValue, timeValue.Format(time.RFC3339Nano), bytesValue)
	}
}

func TestWriteCRUDRoundTrip(t *testing.T) {
	requireWrites(t)

	db := openGorm(t)
	defer closeGorm(t, db)

	table := uniqueTable("d1_adapter_crud_test")
	mustCreateCRUDTable(t, db, table)
	defer dropTable(t, db, table)

	now := time.Date(2026, 7, 9, 1, 2, 3, 456, time.UTC)
	payload := []byte{1, 3, 5, 7, 9}

	if err := db.Exec("INSERT INTO "+table+" (id, name, flag, payload, time_value) VALUES (?, ?, ?, ?, ?)", 1, "before", true, payload, now).Error; err != nil {
		t.Fatal(err)
	}

	var row struct {
		ID        int64
		Name      string
		Flag      bool
		Payload   []byte
		TimeValue time.Time
	}
	if err := db.Raw("SELECT id, name, flag, payload, time_value FROM "+table+" WHERE id = ?", 1).Scan(&row).Error; err != nil {
		t.Fatal(err)
	}
	if row.ID != 1 || row.Name != "before" || !row.Flag || string(row.Payload) != string(payload) || !row.TimeValue.Equal(now) {
		t.Fatalf("unexpected row after insert: %+v", row)
	}

	if err := db.Exec("UPDATE "+table+" SET name = ? WHERE id = ?", "after", 1).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Raw("SELECT name FROM "+table+" WHERE id = ?", 1).Scan(&row.Name).Error; err != nil {
		t.Fatal(err)
	}
	if row.Name != "after" {
		t.Fatalf("expected updated name, got %q", row.Name)
	}

	if err := db.Exec("DELETE FROM "+table+" WHERE id = ?", 1).Error; err != nil {
		t.Fatal(err)
	}
	var count int64
	if err := db.Raw("SELECT count(*) FROM "+table+" WHERE id = ?", 1).Scan(&count).Error; err != nil {
		t.Fatal(err)
	}
	if count != 0 {
		t.Fatalf("expected row deleted, count=%d", count)
	}
}

func TestGormAutoMigrateAndHasTable(t *testing.T) {
	requireWrites(t)

	db := openGorm(t)
	defer closeGorm(t, db)

	table := uniqueTable("d1_adapter_migrate_test")
	defer dropTable(t, db, table)

	if err := db.Table(table).AutoMigrate(&BenchRow{}); err != nil {
		t.Fatal(err)
	}
	if !db.Migrator().HasTable(table) {
		t.Fatalf("expected migrated table %s to exist", table)
	}
}

func TestTransactionRollbackCurrentNoopBehavior(t *testing.T) {
	requireWrites(t)

	db := openGorm(t)
	defer closeGorm(t, db)

	table := uniqueTable("d1_adapter_tx_test")
	mustCreateCRUDTable(t, db, table)
	defer dropTable(t, db, table)

	sentinel := errors.New("force rollback")
	err := db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Exec("INSERT INTO "+table+" (id, name) VALUES (?, ?)", 1, "not_rolled_back").Error; err != nil {
			return err
		}
		return sentinel
	})
	if !errors.Is(err, sentinel) {
		t.Fatalf("expected sentinel transaction error, got %v", err)
	}

	var count int64
	if err := db.Raw("SELECT count(*) FROM "+table+" WHERE id = ?", 1).Scan(&count).Error; err != nil {
		t.Fatal(err)
	}
	if count != 1 {
		t.Fatalf("current adapter transaction behavior changed: expected rollback to be no-op with row persisted, count=%d", count)
	}
}

func TestGormOpenReturnsInvalidDSNError(t *testing.T) {
	db, err := gorm.Open(gormd1.Open("d1://"), &gorm.Config{})
	if err == nil || !errors.Is(err, d1.ErrShortDSN) {
		t.Fatalf("expected ErrShortDSN from gorm.Open automatic ping, got db=%v err=%v", db, err)
	}
}

func TestStdlibInvalidQueryReturnsError(t *testing.T) {
	db := openSQL(t)
	defer db.Close()

	_, err := db.Query("INVALID QUERY")
	if err == nil {
		t.Fatal("expected invalid query error")
	}
	if errors.Is(err, sql.ErrNoRows) {
		t.Fatalf("expected SQL execution error, got %v", err)
	}
}
