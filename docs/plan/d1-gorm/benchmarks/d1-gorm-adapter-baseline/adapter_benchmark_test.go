package d1gormadapterbaseline

import (
	"database/sql"
	"fmt"
	"sync"
	"testing"
	"time"
)

func BenchmarkGormOpen(b *testing.B) {
	for i := 0; i < b.N; i++ {
		db := openGorm(b)
		closeGorm(b, db)
	}
}

func BenchmarkGormOpenAndPing(b *testing.B) {
	for i := 0; i < b.N; i++ {
		db := openGorm(b)
		sqlDB, err := db.DB()
		if err != nil {
			b.Fatal(err)
		}
		if err := sqlDB.Ping(); err != nil {
			b.Fatal(err)
		}
		if err := sqlDB.Close(); err != nil {
			b.Fatal(err)
		}
	}
}

func BenchmarkStdlibOpen(b *testing.B) {
	for i := 0; i < b.N; i++ {
		db := openSQL(b)
		if err := db.Close(); err != nil {
			b.Fatal(err)
		}
	}
}

func BenchmarkStdlibOpenAndPing(b *testing.B) {
	for i := 0; i < b.N; i++ {
		db := openSQL(b)
		if err := db.Ping(); err != nil {
			b.Fatal(err)
		}
		if err := db.Close(); err != nil {
			b.Fatal(err)
		}
	}
}

func BenchmarkGormSelectOne(b *testing.B) {
	db := openGorm(b)
	defer closeGorm(b, db)

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		var value int
		if err := db.Raw("SELECT 1").Scan(&value).Error; err != nil {
			b.Fatal(err)
		}
	}
}

func BenchmarkStdlibSelectOne(b *testing.B) {
	db := openSQL(b)
	defer db.Close()

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		var value int
		if err := db.QueryRow("SELECT 1").Scan(&value); err != nil {
			b.Fatal(err)
		}
	}
}

func BenchmarkGormParameterizedSelect(b *testing.B) {
	db := openGorm(b)
	defer closeGorm(b, db)

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		var out struct {
			IntValue  int64
			TextValue string
		}
		if err := db.Raw("SELECT ? AS int_value, ? AS text_value", int64(i), "baseline").Scan(&out).Error; err != nil {
			b.Fatal(err)
		}
	}
}

func BenchmarkConcurrentSelectOne(b *testing.B) {
	db := openGorm(b)
	defer closeGorm(b, db)

	b.ResetTimer()
	b.RunParallel(func(pb *testing.PB) {
		for pb.Next() {
			var value int
			if err := db.Raw("SELECT 1").Scan(&value).Error; err != nil {
				b.Fatal(err)
			}
		}
	})
}

func BenchmarkAutoMigrateSmallTable(b *testing.B) {
	requireWrites(b)

	db := openGorm(b)
	defer closeGorm(b, db)

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		table := uniqueTable(fmt.Sprintf("d1_adapter_bench_migrate_%d", i))
		if err := db.Table(table).AutoMigrate(&BenchRow{}); err != nil {
			b.Fatal(err)
		}
		b.StopTimer()
		dropTable(b, db, table)
		b.StartTimer()
	}
}

func BenchmarkInsertOne(b *testing.B) {
	requireWrites(b)

	db := openGorm(b)
	defer closeGorm(b, db)

	table := uniqueTable("d1_adapter_bench_insert")
	mustCreateCRUDTable(b, db, table)
	defer dropTable(b, db, table)

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		if err := db.Exec("INSERT INTO "+table+" (id, name, flag, time_value) VALUES (?, ?, ?, ?)", i+1, "insert", true, time.Now().UTC()).Error; err != nil {
			b.Fatal(err)
		}
	}
}

func BenchmarkUpdateOne(b *testing.B) {
	requireWrites(b)

	db := openGorm(b)
	defer closeGorm(b, db)

	table := uniqueTable("d1_adapter_bench_update")
	mustCreateCRUDTable(b, db, table)
	defer dropTable(b, db, table)
	if err := db.Exec("INSERT INTO "+table+" (id, name) VALUES (?, ?)", 1, "before").Error; err != nil {
		b.Fatal(err)
	}

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		if err := db.Exec("UPDATE "+table+" SET name = ? WHERE id = ?", fmt.Sprintf("after_%d", i), 1).Error; err != nil {
			b.Fatal(err)
		}
	}
}

func BenchmarkDeleteOne(b *testing.B) {
	requireWrites(b)

	db := openGorm(b)
	defer closeGorm(b, db)

	table := uniqueTable("d1_adapter_bench_delete")
	mustCreateCRUDTable(b, db, table)
	defer dropTable(b, db, table)

	for i := 0; i < b.N; i++ {
		if err := db.Exec("INSERT INTO "+table+" (id, name) VALUES (?, ?)", i+1, "delete").Error; err != nil {
			b.Fatal(err)
		}
	}

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		if err := db.Exec("DELETE FROM "+table+" WHERE id = ?", i+1).Error; err != nil {
			b.Fatal(err)
		}
	}
}

func BenchmarkInsertSelectUpdateDelete(b *testing.B) {
	requireWrites(b)

	db := openGorm(b)
	defer closeGorm(b, db)

	table := uniqueTable("d1_adapter_bench_crud")
	mustCreateCRUDTable(b, db, table)
	defer dropTable(b, db, table)

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		rowID := int64(i + 1)
		if err := db.Exec("INSERT INTO "+table+" (id, name, flag, time_value) VALUES (?, ?, ?, ?)", rowID, "baseline", true, time.Now().UTC()).Error; err != nil {
			b.Fatal(err)
		}
		var out struct {
			ID   int64
			Name string
		}
		if err := db.Raw("SELECT id, name FROM "+table+" WHERE id = ?", rowID).Scan(&out).Error; err != nil {
			b.Fatal(err)
		}
		if err := db.Exec("UPDATE "+table+" SET name = ? WHERE id = ?", "updated", rowID).Error; err != nil {
			b.Fatal(err)
		}
		if err := db.Exec("DELETE FROM "+table+" WHERE id = ?", rowID).Error; err != nil {
			b.Fatal(err)
		}
	}
}

func BenchmarkFiveConcurrentOpenAndAutoMigrate(b *testing.B) {
	requireWrites(b)

	for i := 0; i < b.N; i++ {
		b.StopTimer()
		tables := []string{
			uniqueTable("d1_adapter_dir"),
			uniqueTable("d1_adapter_group"),
			uniqueTable("d1_adapter_subgroup"),
			uniqueTable("d1_adapter_task"),
			uniqueTable("d1_adapter_tag"),
		}
		models := []any{&BenchDir{}, &BenchGroup{}, &BenchSubGroup{}, &BenchTask{}, &BenchTag{}}
		b.StartTimer()

		var wg sync.WaitGroup
		errs := make(chan error, len(tables))
		for idx := range tables {
			wg.Add(1)
			go func(idx int) {
				defer wg.Done()
				db := openGorm(b)
				defer closeGorm(b, db)
				if err := db.Table(tables[idx]).AutoMigrate(models[idx]); err != nil {
					errs <- err
				}
			}(idx)
		}
		wg.Wait()
		close(errs)
		for err := range errs {
			if err != nil {
				b.Fatal(err)
			}
		}

		b.StopTimer()
		cleanupDB := openGorm(b)
		for _, table := range tables {
			dropTable(b, cleanupDB, table)
		}
		closeGorm(b, cleanupDB)
		b.StartTimer()
	}
}

func BenchmarkStdlibPreparedSelectOne(b *testing.B) {
	db := openSQL(b)
	defer db.Close()

	stmt, err := db.Prepare("SELECT ?")
	if err != nil {
		b.Fatal(err)
	}
	defer stmt.Close()

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		var value int
		if err := stmt.QueryRow(1).Scan(&value); err != nil && err != sql.ErrNoRows {
			b.Fatal(err)
		}
	}
}
