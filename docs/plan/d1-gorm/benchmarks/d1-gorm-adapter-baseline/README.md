# D1 GORM Adapter Baseline

Standalone Go benchmark project for the current forked D1 GORM adapter.

It targets:

```text
github.com/intmian/mian_go_lib/fork/d1_gorm_adapter
```

The project is intentionally separate from the platform backend. It does not read `base_setting.toml`, does not start Gin, and does not touch todone service initialization.

## Environment

Use either the prefixed variables:

```powershell
$env:D1_ACCOUNT_ID = "<account>"
$env:D1_API_TOKEN = "<token>"
$env:D1_DATABASE_ID = "<database>"
```

or the legacy names already used by the adapter tests:

```powershell
$env:ACCOUNT_ID = "<account>"
$env:API_TOKEN = "<token>"
$env:DATABASE_ID = "<database>"
```

## Coverage

Correctness tests cover:

1. DSN parser errors that do not require network.
2. GORM read-only query and empty result behavior.
3. `database/sql` parameterized scan for int/string/bool/time/bytes.
4. Invalid SQL error return.
5. Write CRUD round trip when `D1_INCLUDE_WRITES=1`.
6. GORM `AutoMigrate` and `HasTable` when `D1_INCLUDE_WRITES=1`.
7. Current transaction rollback behavior, documented as no-op, when `D1_INCLUDE_WRITES=1`.

Benchmarks cover:

1. GORM open and GORM open + ping.
2. `database/sql` open and open + ping.
3. GORM and `database/sql` `SELECT 1`.
4. Parameterized read.
5. Prepared read.
6. Concurrent read.
7. `AutoMigrate`, insert, update, delete, CRUD loop, and five-concurrent-open+AutoMigrate when `D1_INCLUDE_WRITES=1`.

## Commands

Read-only baseline:

```powershell
go test -run '^$' -bench 'Benchmark(GormOpen|GormOpenAndPing|StdlibOpen|StdlibOpenAndPing|GormSelectOne|StdlibSelectOne|GormParameterizedSelect|ConcurrentSelectOne|StdlibPreparedSelectOne)$' -benchmem -benchtime 10x
```

Read-only correctness tests:

```powershell
go test -run . -count 1
```

Write-path baseline:

```powershell
$env:D1_INCLUDE_WRITES = "1"
go test -run '^$' -bench . -benchmem -benchtime 10x
```

Full suite through wrapper:

```powershell
powershell -ExecutionPolicy Bypass -File ..\..\scripts\d1-gorm-adapter-baseline.ps1 -Full
```

The wrapper script in `../../scripts/d1-gorm-adapter-baseline.ps1` runs these commands and stores output under `../../runs/`.
