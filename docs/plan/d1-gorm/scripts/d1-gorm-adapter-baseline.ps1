param(
    [string]$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..\..\..")).Path,
    [string]$ProjectDir = "",
    [string]$OutDir = "",
    [string]$Benchtime = "10x",
    [string]$BenchPattern = "",
    [switch]$IncludeWrites,
    [switch]$RunTests,
    [switch]$Full
)

$ErrorActionPreference = "Stop"

function Get-FirstEnv {
    param([string[]]$Names)
    foreach ($name in $Names) {
        $value = [Environment]::GetEnvironmentVariable($name)
        if (![string]::IsNullOrWhiteSpace($value)) {
            return $value
        }
    }
    return ""
}

if ([string]::IsNullOrWhiteSpace($OutDir)) {
    $OutDir = Join-Path $RepoRoot "docs\plan\d1-gorm\runs"
}
if ([string]::IsNullOrWhiteSpace($ProjectDir)) {
    $ProjectDir = Join-Path $RepoRoot "docs\plan\d1-gorm\benchmarks\d1-gorm-adapter-baseline"
}

$runStamp = Get-Date -Format "yyyyMMdd-HHmmss"
$runDir = Join-Path $OutDir "adapter-$runStamp"
New-Item -ItemType Directory -Force -Path $runDir | Out-Null

$summaryPath = Join-Path $runDir "summary.md"
$jsonPath = Join-Path $runDir "summary.json"
$testOutPath = Join-Path $runDir "go-test.txt"
$benchOutPath = Join-Path $runDir "go-test-bench.txt"

$accountId = Get-FirstEnv @("D1_ACCOUNT_ID", "ACCOUNT_ID")
$apiToken = Get-FirstEnv @("D1_API_TOKEN", "API_TOKEN")
$databaseId = Get-FirstEnv @("D1_DATABASE_ID", "DATABASE_ID")

if ([string]::IsNullOrWhiteSpace($accountId) -or [string]::IsNullOrWhiteSpace($apiToken) -or [string]::IsNullOrWhiteSpace($databaseId)) {
    $blocked = [ordered]@{
        status = "blocked"
        reason = "D1 env vars are required for adapter-only baseline"
        required = @("D1_ACCOUNT_ID or ACCOUNT_ID", "D1_API_TOKEN or API_TOKEN", "D1_DATABASE_ID or DATABASE_ID")
        createdAt = (Get-Date).ToString("o")
    }
    $blocked | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath $jsonPath -Encoding UTF8
    @"
# D1 GORM Adapter Baseline Run

Status: blocked

Reason: D1 environment variables are required for adapter-only baseline.

Required:

- D1_ACCOUNT_ID or ACCOUNT_ID
- D1_API_TOKEN or API_TOKEN
- D1_DATABASE_ID or DATABASE_ID

This path does not read platform base_setting.toml and does not start the platform backend.
"@ | Set-Content -LiteralPath $summaryPath -Encoding UTF8
    Write-Host "Blocked: missing D1 env vars"
    Write-Host "Wrote $summaryPath"
    exit 2
}

if (!(Test-Path -LiteralPath (Join-Path $ProjectDir "go.mod"))) {
    throw "benchmark project not found: $ProjectDir"
}

if ($Full) {
    $IncludeWrites = $true
    $RunTests = $true
}

if ([string]::IsNullOrWhiteSpace($BenchPattern)) {
    $BenchPattern = "Benchmark(GormOpen|GormOpenAndPing|StdlibOpen|StdlibOpenAndPing|GormSelectOne|StdlibSelectOne|GormParameterizedSelect|ConcurrentSelectOne|StdlibPreparedSelectOne)$"
    if ($IncludeWrites) {
        $BenchPattern = "."
    }
}

Push-Location $ProjectDir
try {
    $env:D1_ACCOUNT_ID = $accountId
    $env:D1_API_TOKEN = $apiToken
    $env:D1_DATABASE_ID = $databaseId
    if ($IncludeWrites) {
        $env:D1_INCLUDE_WRITES = "1"
    }
    else {
        $env:D1_INCLUDE_WRITES = ""
    }
    $testExitCode = 0
    if ($RunTests) {
        & go test -run . -count 1 *> $testOutPath
        $testExitCode = $LASTEXITCODE
    }
    else {
        "skipped; pass -RunTests or -Full to run correctness tests" | Set-Content -LiteralPath $testOutPath -Encoding UTF8
    }

    & go test -run '^$' -bench $BenchPattern -benchmem -benchtime $Benchtime *> $benchOutPath
    $benchExitCode = $LASTEXITCODE
    if ($testExitCode -ne 0) {
        $exitCode = $testExitCode
    }
    else {
        $exitCode = $benchExitCode
    }
}
finally {
    Pop-Location
}

$status = if ($exitCode -eq 0) { "complete" } else { "failed" }
$summary = [ordered]@{
    status = $status
    createdAt = (Get-Date).ToString("o")
    includeWrites = [bool]$IncludeWrites
    runTests = [bool]$RunTests
    full = [bool]$Full
    benchtime = $Benchtime
    benchPattern = $BenchPattern
    testOutput = $testOutPath
    benchOutput = $benchOutPath
}
$summary | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath $jsonPath -Encoding UTF8

@"
# D1 GORM Adapter Baseline Run

Status: $status

Include writes: $([bool]$IncludeWrites)

Run tests: $([bool]$RunTests)

Full suite: $([bool]$Full)

Benchtime: $Benchtime

Bench pattern: $BenchPattern

Test output:

~~~text
$(Get-Content -LiteralPath $testOutPath -Raw)
~~~

Benchmark output:

~~~text
$(Get-Content -LiteralPath $benchOutPath -Raw)
~~~
"@ | Set-Content -LiteralPath $summaryPath -Encoding UTF8

Write-Host "Wrote $summaryPath"
Write-Host "Wrote $jsonPath"
exit $exitCode
