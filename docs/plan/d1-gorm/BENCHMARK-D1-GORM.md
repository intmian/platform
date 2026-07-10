# D1 GORM Benchmark

Date: 2026-07-10

## Official Scope

All formal D1 adapter performance reporting uses the `hk` SSH host. Windows
workstation results are development diagnostics and are not part of the
baseline, comparison tables, release decisions, or public performance claims.

The authoritative detailed report is:

```text
C:\GITHUB\gorm-d1-adapter\runs\hk-20260710-162100\summary.md
```

The run fixed these conditions across the compared transports:

1. Ubuntu Linux x86_64 host `hk`.
2. `golang:1.25` Docker image (`go1.25.12`).
3. The same Cloudflare D1 database.
4. 100 samples per v2 operation, concurrency 8, writes enabled.
5. `-benchmem -benchtime 10x` for standard Go benchmarks.
6. Correctness and cleanup gates run before results are accepted.

## Verification

```text
v2 REST correctness: PASS
v2 Worker correctness: PASS
Worker batch rollback: PASS
v0 legacy correctness: PASS
v2 sampled operations: REST 1100/1100, Worker 1100/1100
v2 standard benchmarks: REST 17/17, Worker 17/17
v0 legacy benchmarks: 15/15
Remaining temporary D1 tables: 0
Remaining remote benchmark resources: 0
```

## v2 REST vs Worker

| Operation | REST p50 ms | Worker p50 ms | p50 ratio | REST p95 ms | Worker p95 ms | p95 ratio |
|---|---:|---:|---:|---:|---:|---:|
| verify | 208.99 | 10.66 | 19.60x | 244.56 | 12.15 | 20.12x |
| select_one | 106.53 | 63.20 | 1.69x | 127.07 | 74.56 | 1.70x |
| parameterized_select | 102.45 | 61.31 | 1.67x | 117.91 | 68.74 | 1.72x |
| batch_select_two | 203.78 | 62.08 | 3.28x | 251.49 | 69.64 | 3.61x |
| concurrent_select_one | 134.35 | 71.52 | 1.88x | 189.00 | 92.30 | 2.05x |
| insert_one | 104.85 | 65.14 | 1.61x | 125.24 | 74.17 | 1.69x |
| update_one | 106.70 | 64.00 | 1.67x | 144.58 | 70.44 | 2.05x |
| delete_one | 111.65 | 64.03 | 1.74x | 151.76 | 71.75 | 2.12x |
| crud_cycle | 430.65 | 254.54 | 1.69x | 497.50 | 281.40 | 1.77x |
| batch_crud | 428.84 | 64.79 | 6.62x | 546.44 | 88.83 | 6.15x |
| auto_migrate | 216.77 | 127.15 | 1.70x | 251.48 | 144.66 | 1.74x |

The SQL-path result is a 1.61x to 1.88x p50 improvement for single statements,
3.28x for two-query batch, and 6.62x for batch CRUD. The 19.60x verify ratio is
not a SQL comparison: REST verifies through the Cloudflare control plane, while
Worker uses its edge health endpoint.

## Unified v0 Legacy, v2 REST, and v2 Worker

These are matching `10x` Go benchmark workloads run under the same `hk` scope:

| Comparable benchmark | v0 Legacy ms/op | v2 REST ms/op | v2 Worker ms/op | v2 REST/Worker | v0/Worker |
|---|---:|---:|---:|---:|---:|
| GormOpen | 199.80 | 213.52 | 11.93 | 17.89x | 16.74x |
| GormOpenAndPing | 204.63 | 212.86 | 11.38 | 18.71x | 17.98x |
| StdlibOpenAndPing | 204.39 | 211.45 | 11.29 | 18.73x | 18.10x |
| GormSelectOne | 114.36 | 116.30 | 64.58 | 1.80x | 1.77x |
| StdlibSelectOne | 114.31 | 130.03 | 61.70 | 2.11x | 1.85x |
| GormParameterizedSelect | 94.31 | 102.93 | 64.93 | 1.59x | 1.45x |
| ConcurrentSelectOne | 53.15 | 67.16 | 31.43 | 2.14x | 1.69x |
| InsertOne | 93.86 | 121.51 | 70.65 | 1.72x | 1.33x |
| UpdateOne | 104.89 | 117.53 | 71.03 | 1.65x | 1.48x |
| DeleteOne | 102.65 | 132.25 | 81.70 | 1.62x | 1.26x |
| StdlibPreparedSelectOne | 82.74 | 108.14 | 61.34 | 1.76x | 1.35x |

AutoMigrate, CRUD cycle, and five-concurrent-migration changed workload shape
between v0 and v2 and are directional only. v0 ordinary CRUD at 356.59 ms/op
versus v2 Worker batch CRUD at 71.65 ms/op is a 4.98x architecture-level
comparison, not a strict transport comparison.

## Development Tools

The original v0 project remains at:

```text
docs/plan/d1-gorm/benchmarks/d1-gorm-adapter-baseline
```

Its wrapper does not read `base_setting.toml` or start the platform backend:

```powershell
powershell -ExecutionPolicy Bypass -File docs/plan/d1-gorm/scripts/d1-gorm-adapter-baseline.ps1 -Full
```

The v2 development runner is:

```powershell
cd C:\GITHUB\gorm-d1-adapter
powershell -ExecutionPolicy Bypass -File scripts/benchmark-v2.ps1 -Mode both -Samples 30 -Concurrency 8 -Full
```

Running these commands on Windows is valid for correctness and troubleshooting,
but their latency output is not an official benchmark. Formal reruns must execute
from `hk` and archive raw JSON plus Go benchmark logs under
`C:\GITHUB\gorm-d1-adapter\runs\hk-<timestamp>\`.

The platform-integration script measures backend startup and todone behavior. It
may still be used for functional integration diagnostics, but its local timing
must not be merged with the adapter performance baseline:

```powershell
powershell -ExecutionPolicy Bypass -File docs/plan/d1-gorm/scripts/d1-gorm-baseline.ps1
```

## Interpretation Rules

1. Use only `hk` runs for reported latency and throughput.
2. Compare transports only when host, D1 database, samples, concurrency, write
   mode, and test window match.
3. Keep correctness, failures, and cleanup status with every report.
4. Keep percentile-runner and Go benchmark results in separate tables.
5. Label changed workloads and batch architecture comparisons explicitly.
6. Require three successful same-condition `hk` runs before publishing stable
   performance claims. The current run supports engineering decisions only.
