param(
    [string]$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..\..\..")).Path,
    [string]$BackendTestDir = "",
    [int]$Runs = 3,
    [int]$SmokeIterations = 3,
    [int]$Port = 0,
    [string]$AdminPassword = $env:PLATFORM_ADMIN_PWD,
    [string]$OutDir = "",
    [switch]$NoStart,
    [switch]$CollectPprof
)

$ErrorActionPreference = "Stop"

function Read-TomlString {
    param(
        [string]$Path,
        [string]$Key
    )
    $pattern = "^\s*$([regex]::Escape($Key))\s*=\s*['""]?([^'""#`r`n]+)"
    foreach ($line in Get-Content -LiteralPath $Path) {
        if ($line -match $pattern) {
            return $Matches[1].Trim()
        }
    }
    return ""
}

function Invoke-JsonPost {
    param(
        [string]$Url,
        [object]$Body,
        [Microsoft.PowerShell.Commands.WebRequestSession]$Session = $null
    )
    $json = $Body | ConvertTo-Json -Depth 20 -Compress
    if ($Session -ne $null) {
        return Invoke-RestMethod -Uri $Url -Method Post -ContentType "application/json" -Body $json -WebSession $Session
    }
    return Invoke-RestMethod -Uri $Url -Method Post -ContentType "application/json" -Body $json
}

function Get-Percentile {
    param(
        [double[]]$Values,
        [double]$Percent
    )
    if ($Values.Count -eq 0) {
        return $null
    }
    $sorted = @($Values | Sort-Object)
    $rank = [math]::Ceiling(($Percent / 100.0) * $sorted.Count) - 1
    if ($rank -lt 0) {
        $rank = 0
    }
    if ($rank -ge $sorted.Count) {
        $rank = $sorted.Count - 1
    }
    return [double]$sorted[$rank]
}

function Get-LogDuration {
    param([object]$Row)
    if ($null -ne $Row.Duration) {
        return [double]$Row.Duration
    }
    if ($null -ne $Row.Data -and $null -ne $Row.Data.Duration) {
        return [double]$Row.Data.Duration
    }
    return $null
}

function Get-LogErr {
    param([object]$Row)
    if ($null -ne $Row.Err) {
        return [string]$Row.Err
    }
    if ($null -ne $Row.Data -and $null -ne $Row.Data.Err) {
        return [string]$Row.Data.Err
    }
    return ""
}

function Wait-ForLogin {
    param(
        [string]$BaseUrl,
        [string]$Password,
        [int]$TimeoutSeconds
    )
    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    do {
        try {
            $login = Invoke-WebRequest -Uri "$BaseUrl/login" -Method Post -ContentType "application/json" -Body (@{
                username = "admin"
                password = $Password
            } | ConvertTo-Json -Compress) -SessionVariable session
            $data = $login.Content | ConvertFrom-Json
            if ($data.code -eq 0) {
                return @{
                    Ok = $true
                    Session = $session
                    Response = $data
                }
            }
        }
        catch {
        }
        Start-Sleep -Milliseconds 1000
    } while ((Get-Date) -lt $deadline)

    return @{
        Ok = $false
        Session = $null
        Response = $null
    }
}

if ([string]::IsNullOrWhiteSpace($BackendTestDir)) {
    $BackendTestDir = Join-Path $RepoRoot "backend\test"
}
if ([string]::IsNullOrWhiteSpace($OutDir)) {
    $OutDir = Join-Path $RepoRoot "docs\plan\d1-gorm\runs"
}

$runStamp = Get-Date -Format "yyyyMMdd-HHmmss"
$runDir = Join-Path $OutDir $runStamp
New-Item -ItemType Directory -Force -Path $runDir | Out-Null

$configPath = Join-Path $BackendTestDir "base_setting.toml"
$reportPath = Join-Path $runDir "summary.md"
$jsonPath = Join-Path $runDir "summary.json"

if (!(Test-Path -LiteralPath $BackendTestDir) -or !(Test-Path -LiteralPath $configPath)) {
    $blocked = [ordered]@{
        status = "blocked"
        reason = "backend/test/base_setting.toml is required for runtime D1 baseline"
        backendTestDir = $BackendTestDir
        configPath = $configPath
        createdAt = (Get-Date).ToString("o")
    }
    $blocked | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath $jsonPath -Encoding UTF8
@"
# D1 GORM Baseline Run

Status: blocked

Reason: backend/test/base_setting.toml is required before runtime baseline can start.

Expected run directory: $BackendTestDir

This script does not create or store D1 credentials. Prepare the local test config, then rerun:

~~~powershell
powershell -ExecutionPolicy Bypass -File docs/plan/d1-gorm/scripts/d1-gorm-baseline.ps1
~~~
"@ | Set-Content -LiteralPath $reportPath -Encoding UTF8
    Write-Host "Blocked: missing $configPath"
    Write-Host "Wrote $reportPath"
    exit 2
}

if ($Port -le 0) {
    $webPort = Read-TomlString -Path $configPath -Key "web_port"
    if ([string]::IsNullOrWhiteSpace($webPort)) {
        $Port = 8080
    }
    else {
        $Port = [int]$webPort
    }
}

if ([string]::IsNullOrWhiteSpace($AdminPassword)) {
    $AdminPassword = Read-TomlString -Path $configPath -Key "admin_pwd"
}
if ([string]::IsNullOrWhiteSpace($AdminPassword)) {
    throw "Admin password not found. Set PLATFORM_ADMIN_PWD or backend/test/base_setting.toml admin_pwd."
}

$baseUrl = "http://127.0.0.1:$Port"
$goWork = Join-Path $RepoRoot "backend\go.work"
$exePath = Join-Path $runDir "platform-baseline.exe"
$buildLog = Join-Path $runDir "build.log"

$allRuns = @()

for ($runIndex = 1; $runIndex -le $Runs; $runIndex++) {
    $startedByScript = $false
    $process = $null
    $stdoutPath = Join-Path $runDir "backend-$runIndex.stdout.log"
    $stderrPath = Join-Path $runDir "backend-$runIndex.stderr.log"
    $startupWatch = [System.Diagnostics.Stopwatch]::StartNew()

    try {
        $loginState = Wait-ForLogin -BaseUrl $baseUrl -Password $AdminPassword -TimeoutSeconds 2
        if (!$loginState.Ok -and !$NoStart) {
            if (!(Test-Path -LiteralPath $exePath)) {
                Push-Location $BackendTestDir
                try {
                    $env:GOWORK = $goWork
                    & go build -o $exePath ..\main\main.go *> $buildLog
                    if ($LASTEXITCODE -ne 0) {
                        throw "go build failed. See $buildLog"
                    }
                }
                finally {
                    Pop-Location
                }
            }

            $env:GOWORK = $goWork
            $process = Start-Process -FilePath $exePath -WorkingDirectory $BackendTestDir -PassThru -WindowStyle Hidden -RedirectStandardOutput $stdoutPath -RedirectStandardError $stderrPath
            $startedByScript = $true
            $loginState = Wait-ForLogin -BaseUrl $baseUrl -Password $AdminPassword -TimeoutSeconds 90
        }

        $startupWatch.Stop()
        if (!$loginState.Ok) {
            throw "Backend did not become login-ready at $baseUrl"
        }

        $session = $loginState.Session
        $smokeResults = @()
        for ($i = 1; $i -le $SmokeIterations; $i++) {
            $reqWatch = [System.Diagnostics.Stopwatch]::StartNew()
            $resp = Invoke-JsonPost -Url "$baseUrl/service/todone/getDirTree" -Body @{ UserID = "admin" } -Session $session
            $reqWatch.Stop()
            $smokeResults += [ordered]@{
                iteration = $i
                elapsedMs = [math]::Round($reqWatch.Elapsed.TotalMilliseconds, 2)
                code = $resp.code
                msg = $resp.msg
            }
            Start-Sleep -Milliseconds 300
        }

        Start-Sleep -Seconds 2

        $biResp = Invoke-JsonPost -Url "$baseUrl/admin/bi_log/todone_db_log/search" -Body @{
            pageNum = 1
            pageSize = 500
            orderBy = "record_time"
            desc = $true
        } -Session $session

        $rows = @()
        if ($null -ne $biResp.data -and $null -ne $biResp.data.List) {
            $rows = @($biResp.data.List)
        }

        $durations = @()
        $errorCount = 0
        foreach ($row in $rows) {
            $duration = Get-LogDuration -Row $row
            if ($null -ne $duration) {
                $durations += $duration
            }
            $errValue = Get-LogErr -Row $row
            if (![string]::IsNullOrWhiteSpace($errValue)) {
                $errorCount++
            }
        }

        $pprofPath = ""
        if ($CollectPprof) {
            $pprofPath = Join-Path $runDir "cpu-$runIndex.pprof"
            Invoke-WebRequest -Uri "http://127.0.0.1:12351/debug/pprof/profile?seconds=10" -OutFile $pprofPath | Out-Null
        }

        $allRuns += [ordered]@{
            run = $runIndex
            startedByScript = $startedByScript
            startupReadyMs = [math]::Round($startupWatch.Elapsed.TotalMilliseconds, 2)
            smoke = $smokeResults
            sqlTrace = [ordered]@{
                sampleCount = $durations.Count
                errorCount = $errorCount
                p50Ms = Get-Percentile -Values $durations -Percent 50
                p95Ms = Get-Percentile -Values $durations -Percent 95
                p99Ms = Get-Percentile -Values $durations -Percent 99
                maxMs = if ($durations.Count -gt 0) { [double](($durations | Measure-Object -Maximum).Maximum) } else { $null }
            }
            stdout = $stdoutPath
            stderr = $stderrPath
            pprof = $pprofPath
        }
    }
    finally {
        if ($startedByScript -and $null -ne $process -and !$process.HasExited) {
            Stop-Process -Id $process.Id -Force
            Start-Sleep -Seconds 2
        }
    }
}

$summary = [ordered]@{
    status = "complete"
    createdAt = (Get-Date).ToString("o")
    repoRoot = $RepoRoot
    backendTestDir = $BackendTestDir
    baseUrl = $baseUrl
    runs = $allRuns
}

$summary | ConvertTo-Json -Depth 30 | Set-Content -LiteralPath $jsonPath -Encoding UTF8

$mdRuns = foreach ($r in $allRuns) {
    "- Run $($r.run): startup-ready=$($r.startupReadyMs)ms, smoke=$(@($r.smoke).Count), sql-samples=$($r.sqlTrace.sampleCount), p50=$($r.sqlTrace.p50Ms)ms, p95=$($r.sqlTrace.p95Ms)ms, p99=$($r.sqlTrace.p99Ms)ms, errors=$($r.sqlTrace.errorCount)"
}

@"
# D1 GORM Baseline Run

Status: complete

Created: $($summary.createdAt)

Base URL: $baseUrl

## Summary

$($mdRuns -join "`n")

## Artifacts

- Raw JSON: $jsonPath
- Build log: $buildLog
- Backend stdout/stderr are stored beside this report.

## Notes

- `startup-ready` measures process start to successful admin login.
- SQL percentiles are computed from the latest `todone_db_log` rows returned by `/admin/bi_log/todone_db_log/search`.
- Smoke path: `POST /service/todone/getDirTree` with `UserID=admin`.
"@ | Set-Content -LiteralPath $reportPath -Encoding UTF8

Write-Host "Wrote $reportPath"
Write-Host "Wrote $jsonPath"
