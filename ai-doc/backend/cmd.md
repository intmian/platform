# Cmd Service

Last verified: 2026-03-06

## Scope

1. Covers backend cmd service internals under `backend/services/cmd`.
2. Focuses on tool storage, environment persistence, task execution, and RPC data flow.

## Responsibility

1. Manages executable tools/scripts.
2. Manages runtime environments and editable environment files.
3. Runs tasks inside an environment and exposes IO/status polling APIs.

## Startup chain

1. Service is registered in `platform/core.go`.
2. `Start()` creates base directory:
   - `services/cmd`
3. It ensures subdirectories exist:
   - `services/cmd/tool`
   - `services/cmd/run`
4. Then it initializes:
   - `toolMgr`
   - `runMgr`
5. `Stop()` currently does not shut down running tasks cleanly; code contains a TODO for run manager rework.

## Permission model

1. RPC is allowed when any condition is true:
   - backend debug mode is on
   - caller has `admin`
   - caller has `cmd`

## Tool model

1. Each tool has:
   - ID
   - name
   - type
   - created time
   - updated time
   - executable/script address
2. Tool scripts are created at:
   - `services/cmd/<toolID>/main`
3. Tool metadata persists in storage keys under:
   - `CMD/toolMgr/toolIDs`
   - `CMD/toolMgr/tool/<toolID>`
4. Current script creation path uses the service base dir as `ScriptDir`, so actual tool files live directly under `services/cmd/<toolID>/`, not under `services/cmd/tool/<toolID>/`.

## Environment model

1. Each environment has:
   - `Param`
   - `DefaultToolID`
   - `Note`
2. Environment directories live at:
   - `services/cmd/run/<envID>`
3. Run manager stores environment registry under:
   - `cmd/runmgr/data/lastID`
   - `cmd/runmgr/data/envIDs`
4. Environment data itself stores under:
   - `runmgr/env/<envID>`
5. Environment files are limited to root-level text-file read/write paths.

## Task execution model

1. `runEnv` resolves environment, resolves tool, then calls `env.RunTask`.
2. Python tools run with:
   - command `python <toolAddr> ...params`
   - `PYTHONPATH=<toolAddr>`
3. Non-python tools run directly from tool address.
4. Task working directory is the environment directory.
5. Task stdout is scanned line-by-line and appended into in-memory IO history.
6. User input writes to task stdin and is also appended into IO history.
7. Task lifecycle statuses are:
   - `TaskStatusRunning`
   - `TaskStatusEnd`
   - `TaskStatusForceEnd`

## Public RPC commands

1. Tool management:
   - `createTool`
   - `updateTool`
   - `getTools`
   - `getToolScript`
   - `deleteTool`
2. Environment management:
   - `createEnv`
   - `getEnvs`
   - `getEnv`
   - `setEnv`
   - `getFile`
   - `setFile`
3. Task execution:
   - `runEnv`
   - `getTasks`
   - `getTask`
   - `stopTask`
   - `taskInput`

## Common failure signatures

1. `no permission`
2. `invalid tool type`
3. `invalid Name`
4. `invalid id`
5. `get env failed`
6. `get task failed`
7. `run task failed`
8. `task input failed`

## Verification focus

1. `POST /service/cmd/getTools`
2. `POST /service/cmd/createEnv`
3. `POST /service/cmd/getEnv`
4. `POST /service/cmd/runEnv`
5. Regression:
   - `getTasks` and `getTask` after a run

## Known design constraints

1. Persistence key casing is inconsistent:
   - tool registry uses `CMD/...`
   - run manager uses `cmd/...`
   - environment data uses `runmgr/...`
2. `SetEnvReq` fields in code are unexported (`params`, `note`, `bindToolID`), so normal JSON decode does not populate them through the generic RPC path.
3. There is no public RPC for environment deletion even though run manager has `DeleteEnv`.
4. Task IO history is in-memory only and is lost across process restart.
