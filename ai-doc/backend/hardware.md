# Backend Hardware Service

Last verified: 2026-06-06

## Scope

1. Covers backend internals under `backend/services/hardware`.
2. Focuses on access credentials, automatic device discovery, ingest idempotency, command delivery, deletion semantics, and the single dashboard contract.

## Responsibility

1. Owns the first-party hardware platform module registered as service name `hardware`.
2. Manages system-level access credentials. A credential can be used by multiple gateway devices.
3. Automatically discovers devices from hardware reports. Browser UI never creates gateway or sensor devices.
4. Stores device state, raw samples, gateway command queue rows, and the dashboard configuration.

## Permission Gate

1. Browser/service RPC requires `admin` or `hardware`.
2. Device routes do not use browser cookies. They authenticate with a bearer access credential:
   - `Authorization: Bearer <token>`
   - or `X-Device-Token`
3. Full credential tokens are only returned on create/rotate. Stored rows keep token hash and token prefix.

## Storage

1. Runtime sqlite file: `services/hardware/hardware.db` under the backend working directory.
2. This is the current local-run implementation. Formal long-term deployment still needs a dedicated hardware D1/GORM connection and migration path; do not reuse the platform log D1 connection for hardware samples.
3. Product-facing tables:
   - `hardware_access_credentials`
   - `hardware_devices`
   - `hardware_samples`
   - `hardware_commands`
   - `hardware_dashboards`
   - `hardware_dashboard_widgets`
4. Legacy `hardware_gateways` and `hardware_nodes` are migration sources only.
5. Sample idempotency key is `device_id + session_id + seq`.
6. Invalid hardware fields are stored as SQL null and returned as JSON null; frontend must not treat missing fields as `0`.

## Browser RPC Commands

1. Devices:
   - `listDevices`
   - `updateDevice`
   - `deleteDevice`
2. Access credentials:
   - `listCredentials`
   - `createCredential`
   - `rotateCredential`
   - `updateCredential`
   - `deleteCredential`
3. Data and commands:
   - `querySamples`
   - `listCommands`
   - `createCommand`
   - `cancelCommand`
4. Dashboard:
   - `getDashboard`
   - `saveDashboard`
   - `queryDashboard`

## Device Routes

1. `POST /device/hardware/ingest`
   - accepts batches from authenticated core gateways
   - accepts `gatewayKey` so one access credential can identify multiple gateways
   - requires record `protocolVersion >= 4`
   - returns per-record statuses: `accepted`, `duplicate`, or `failed`
2. `POST /device/hardware/poll-commands`
   - accepts `gatewayKey`
   - leases pending commands for that gateway device
   - leased commands are not redelivered until the lease expires
3. `POST /device/hardware/command-result`
   - marks delivered commands as `acked` or `failed`

## Device Semantics

1. `hardware_devices.id` is server-generated and is the product identity.
2. `hardware_key` is the hardware-reported stable key. It can appear again after deletion.
3. Deleting a device marks the device as deleted, deletes its samples, and cancels pending commands; dashboard widgets keep references and show "设备已删除".
4. If a deleted hardware key reports again, backend creates a new `hardware_devices.id`.
5. Hidden devices continue to receive and store samples, but default UI and dashboard selectors omit them.

## Dashboard Contract

1. Hardware has exactly one dashboard row with key `global`.
2. Dashboard widgets store selected `hardware_devices.id` values and metric keys.
3. Supported widget types are `value` and `line`.
4. Line widgets support relative ranges (`1h`, `6h`, `24h`, `7d`) and custom epoch ranges via `optionsJson`.
5. `queryDashboard` always returns arrays for widget `devices`, `latest`, and `samples`; empty result sets are `[]`, not `null`.

## Hardware Protocol Contract

1. core sends a stable `gatewayKey` such as `gateway-<mac_without_colons>` when polling commands or uploading samples.
2. core uploads env-mov records with stable `nodeKey`, non-empty `sessionId`, monotonic `seq` inside that session, and `protocolVersion`.
3. `sessionId` is a record-generation id, not a web login session or BLE connection session.
4. A new `sessionId` is required when env-mov history is cleared or seq can restart.
