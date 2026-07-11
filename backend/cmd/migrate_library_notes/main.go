package main

import (
	"flag"
	"fmt"
	"os"

	d1 "github.com/intmian/gorm-d1-adapter"
	"github.com/intmian/gorm-d1-adapter/gormd1"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

func main() {
	apply := flag.Bool("apply", false, "apply the offline migration")
	verify := flag.Bool("verify", false, "verify migrated data using the backup file")
	rollback := flag.Bool("rollback", false, "restore Task.Note and remove migrated note rows using the backup file")
	backup := flag.String("backup", "library-note-migration-backup.jsonl", "backup JSONL path")
	confirmStopped := flag.Bool("confirm-stopped", false, "confirm the Platform service is stopped (required for apply/rollback)")
	flag.Parse()

	modeCount := 0
	for _, selected := range []bool{*apply, *verify, *rollback} {
		if selected {
			modeCount++
		}
	}
	if modeCount > 1 {
		fatalf("select only one of --apply, --verify, or --rollback")
	}
	if (*apply || *rollback) && !*confirmStopped {
		fatalf("--confirm-stopped is required for --apply and --rollback")
	}
	endpoint := os.Getenv("PLATFORM_TODONE_WORKER_ENDPOINT")
	token := os.Getenv("PLATFORM_TODONE_WORKER_TOKEN")
	if endpoint == "" || token == "" {
		fatalf("PLATFORM_TODONE_WORKER_ENDPOINT and PLATFORM_TODONE_WORKER_TOKEN are required")
	}
	conn, err := gorm.Open(gormd1.OpenConfig(d1.Config{
		Mode: d1.ExecutorModeWorker, WorkerEndpoint: endpoint, WorkerToken: token,
	}), &gorm.Config{Logger: logger.Default.LogMode(logger.Silent)})
	if err != nil {
		fatalf("open D1: %v", err)
	}

	switch {
	case *rollback:
		err = rollbackFromBackup(conn, *backup)
	case *verify:
		err = verifyFromBackup(conn, *backup)
	case *apply:
		err = applyMigration(conn, *backup)
	default:
		var plan *migrationPlan
		plan, err = buildMigrationPlan(conn)
		if err == nil {
			printPlan(plan)
		}
	}
	if err != nil {
		fatalf("migration failed: %v", err)
	}
}

func fatalf(format string, args ...any) {
	fmt.Fprintf(os.Stderr, format+"\n", args...)
	os.Exit(1)
}
