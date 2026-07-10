# D1 GORM Adapter And Worker Proxy Plan

This directory contains the D1/GORM adapter baseline, roadmap, and development verification tools.

Active implementation now lives in the standalone repository at `C:\GITHUB\gorm-d1-adapter`. This directory keeps the original v0 baseline and the phased integration plan.

## Files

1. `roadmap.md`: phased refactor plan for the D1 GORM adapter and Worker proxy.
2. `BENCHMARK-D1-GORM.md`: benchmark results and interpretation rules.
3. `benchmarks/d1-gorm-adapter-baseline/`: standalone Go project for adapter correctness tests and benchmarks.
4. `scripts/d1-gorm-adapter-baseline.ps1`: wrapper for the standalone adapter benchmark project.
5. `scripts/d1-gorm-baseline.ps1`: platform integration baseline wrapper for backend/todone startup and SQL trace collection.
6. `runs/`: historical development-run artifacts; contents are ignored by git except `.gitignore`.

Formal performance reporting uses only runs produced from the SSH host `hk`.
Developer-machine output is valid for correctness and troubleshooting, but not
for performance comparisons or release claims.

## Main Commands

Development-only adapter full suite:

```powershell
powershell -ExecutionPolicy Bypass -File docs/plan/d1-gorm/scripts/d1-gorm-adapter-baseline.ps1 -Full
```

Adapter-only compile check:

```powershell
cd docs/plan/d1-gorm/benchmarks/d1-gorm-adapter-baseline
go test -run '^$' -bench '^$'
```

Development-only v2 REST/Worker comparison:

```powershell
cd C:\GITHUB\gorm-d1-adapter
powershell -ExecutionPolicy Bypass -File scripts/benchmark-v2.ps1 -Mode both -Full
```
