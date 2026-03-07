# Auto Service

Last verified: 2026-03-06

## Scope

1. Covers backend auto service internals under `backend/services/auto`.
2. Focuses on report generation, scheduled task units, config dependencies, and stored outputs.

## Responsibility

1. Provides daily and whole-report read/generate RPCs.
2. Runs scheduled background tasks that push daily content.
3. Integrates spiders, AI translation/summary, push, and storage.

## Startup chain

1. Service is registered in `platform/core.go`.
2. `Start()` wires globals:
   - `setting.GSetting = share.Storage`
   - `setting.GCfg = share.Cfg`
   - `setting.GBaseSetting = share.BaseSetting`
3. `tool.Init()` binds shared push and log managers.
4. `task.Init()` registers scheduled units.
5. `Stop()` calls `task.GMgr.AllStop()`.

## Permission model

1. Base allow set is any of:
   - `admin`
   - `auto`
   - `auto.report`
2. Non-admin callers with only `auto.report` can use:
   - `getReport`
   - `getWholeReport`
   - `getReportList`
   - `generateReport`
3. Other non-admin auto commands are denied.

## Public RPC commands

1. `getReport`
2. `getWholeReport`
3. `getReportList`
4. `generateReport`

## Scheduled units

1. `task.Init()` currently registers:
   - `auto.DAPAN`
   - `auto.LOTTERY`
   - `auto.Day`
2. Default cron expressions from unit definitions:
   - `auto.DAPAN`: `0 10 15 * * ?`
   - `auto.LOTTERY`: `0 0 22 * * ?`
   - `auto.Day`: `0 0 6 * * ?`
3. Each unit writes default config keys:
   - `<unit>.time_str`
   - `<unit>.open_when_start`

## Report and config storage

1. Daily and whole reports are stored in local sqlite:
   - `auto_report.db`
2. `report_list` stores known day keys.
3. Day report cache key uses:
   - `YYYY-MM-DD`
4. Whole-report cache key uses:
   - `YYYY-MM-DD_whole`
5. Day module initializes defaults for:
   - `auto.news.keys`
   - `qweather.key`
   - `auto.weather.city`

## AI dependency

1. Day report summary uses AI scene:
   - `summary`
2. BBC/NYT translation uses AI scene:
   - `translate`
3. Auto service reads AI config through shared `GetAIConfig(setting.GCfg)`.
4. Missing `openai.base` or `openai.token` degrades generation paths with explicit errors.

## Day report generation flow

1. Read news/weather config from storage.
2. Build HTTP client:
   - debug mode uses proxy `http://localhost:7890`
   - non-debug uses default client
3. Collect previous-day BBC/NYT/Google RSS plus weather data.
4. Filter NYT `Briefing` items and wrap NYT links with `removepaywall`.
5. Translate news content through AI.
6. Generate AI summary.
7. Persist report and update `report_list`.
8. Scheduled `Do()` path also renders markdown and pushes a daily message.

## Common failure signatures

1. `no permission`
2. `auto.news.keys not exist`
3. `auto.news.keys is empty`
4. `qweather.key not exist`
5. `openai.base is empty`
6. `openai.token is empty`

## Verification focus

1. `POST /service/auto/getReportList`
2. `POST /service/auto/getWholeReport`
3. `POST /service/auto/generateReport`
4. Regression:
   - read back generated day report with `getReport`

## Known design constraints

1. Service implementation is global-state heavy (`GSetting`, `GCfg`, `GBaseSetting`, `GDay`, `GMgr`).
2. Scheduled unit init uses `open_when_start`, but runtime `check()` path still reads `<unit>.open`, so startup and later toggles are not aligned.
3. Report generation depends on external network sources, weather API config, and AI config, so verification often fails due environment rather than code.
