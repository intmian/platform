# D1 Worker And Cloudflare Operations

Last verified: 2026-07-12 (Platform config code, D1 proxy deployment files, local Wrangler 4.110.0 help, reviewed runtime evidence, and current Cloudflare documentation)

## Scope And Required Parent Runbook

This document owns the shared backend infrastructure path from Platform through the Todone and BI/log D1 proxy Workers, plus the Wrangler command flow for deployment, secrets, diagnosis, rollback, and D1 recovery.

Before any production read or mutation, load `shared/production-operations.md` and follow its authorization, operation ledger, state gates, and secret rules. For Platform application deployment, also load `shared/ci-deploy.md`.

## Deployment Topology And Inventory

```text
production Platform
  -> Todone Worker endpoint + dedicated token
     -> <TODONE_D1_WORKER>
     -> DB binding -> <TODONE_D1_DATABASE>
  -> Log Worker endpoint + dedicated token
     -> <LOG_D1_WORKER>
     -> DB binding -> <LOG_D1_DATABASE>
```

| Purpose | Worker | Bound D1 | Local deployment config | Platform configuration |
| --- | --- | --- | --- | --- |
| Todone production data | `<TODONE_D1_WORKER>` | `<TODONE_D1_DATABASE>` | `<TODONE_WRANGLER_CONFIG>` | `todone.db.worker_endpoint` / `todone.db.worker_token`, overridden by `PLATFORM_TODONE_WORKER_*` |
| BI/log production data | `<LOG_D1_WORKER>` | `<LOG_D1_DATABASE>` | `<LOG_WRANGLER_CONFIG>` | `d1_log_worker_endpoint` / `d1_log_worker_token`, overridden by `PLATFORM_D1_LOG_WORKER_*` |
| Adapter integration test | `<TEST_D1_WORKER>` | `<TEST_D1_DATABASE>` | `<TEST_WRANGLER_CONFIG>` | Test-only adapter variables; never use it as a production target |

All three Workers use the same proxy source in the separate `gorm-d1-adapter` repository, but each deployment has its own `DB` binding and `AUTH_TOKEN`. A production source change therefore requires two deliberate Worker deployments and two recorded version IDs; deploying one does not update the other. The current local configs enable `workers_dev` and observability.

Per-target local Wrangler files contain real Worker/D1 identifiers and are intentionally local/ignored. Resolve their paths from the authorized local environment and map them to the placeholders above; do not commit, print, or copy their contents into Platform. Keep `wrangler.example.toml` sanitized. A code change in `gorm-d1-adapter` requires explicit authorization and a separate Git report because it is not the Platform repository or its declared submodule.

## Last-Known Runtime Baseline

Evidence from the reviewed operations, last observed on 2026-07-11:

1. Both production Workers existed, their separate `AUTH_TOKEN` values had been updated, and authenticated `/health` checks returned `200`.
2. After the Worker-only Platform deployment and old boolean representation conversion, Todone production data was readable.
3. After the stopped-service Library Note migration and Platform deployment, historical notes were visible once the new frontend release/cache was active.

This documentation task did not access Cloudflare or production. The active Worker version IDs, current secret equality, health, and database state are `TODO-verify` for every new production task. Historical success is not a current health assertion.

## Platform Configuration And Current Caveats

1. BI/log D1 Worker config is required during Platform bootstrap from `base_setting.toml` keys `d1_log_worker_endpoint` / `d1_log_worker_token`, with `PLATFORM_D1_LOG_WORKER_*` environment overrides.
2. Todone registers `todone.db.worker_endpoint` / `todone.db.worker_token` in `CfgExt`, with `PLATFORM_TODONE_WORKER_*` environment overrides.
3. Neither production endpoint has a code default, and Todone does not migrate a legacy API token.
4. Each Worker accepts one `AUTH_TOKEN`; the two production Workers must use separate token values.

Current safety caveats verified in Platform code:

1. The Todone admin GET path returns configuration values, and the SET path logs the submitted value.
2. `cfgServiceSet` does not branch on the error returned by `Cfg.Set`, so a success response is not proof that the value persisted.
3. `startService` logs a start error but still marks the service started and returns success.

Do not retrieve Todone config merely to check a token, and do not rely on the admin toast or service status. Verify persistence after restart plus authenticated Worker health and an actual business request. Treat the current Todone Worker token as config/log-exposed until the secret contract is fixed, then rotate it.

## Wrangler Source And References

Use the Wrangler version locked by the D1 proxy project rather than a global installation. It is currently `4.110.0`. Commands below were checked against that binary and current official documentation:

- [Wrangler commands](https://developers.cloudflare.com/workers/wrangler/commands/)
- [Worker secrets](https://developers.cloudflare.com/workers/configuration/secrets/)
- [Versions and deployments](https://developers.cloudflare.com/workers/versions-and-deployments/)
- [D1 Time Travel](https://developers.cloudflare.com/d1/reference/time-travel/)
- [D1 import/export](https://developers.cloudflare.com/d1/best-practices/import-export-data/)

## Working Directory And Targets

From the Platform repository:

```bash
cd ../gorm-d1-adapter/workers/d1-proxy

TODONE_CONFIG="<path-to-todone-wrangler-config>"
LOG_CONFIG="<path-to-log-wrangler-config>"
TEST_CONFIG="<path-to-test-wrangler-config>"
TODONE_DB="<todone-d1-database>"
LOG_DB="<log-d1-database>"
```

Always pass the correct `--config`. Do not deploy using only `--name`: the per-target file determines the D1 binding and safety limits, and a wrong config can bind a production Worker to the wrong database.

## Local-Only Preparation

These commands do not change Cloudflare while deploy retains `--dry-run`:

```bash
npm ci
npx wrangler --version
npm run check
npm test

npx wrangler deploy --dry-run --config "$TODONE_CONFIG" --outdir dist/todone
npx wrangler deploy --dry-run --config "$LOG_CONFIG" --outdir dist/log
```

Run dry-run for both production configs because their bindings are independent. Review the intended Worker name and binding without printing local config contents.

## Authentication

Interactive OAuth login:

```bash
npx wrangler login
```

The human operator may confirm the selected account with:

```bash
npx wrangler whoami
```

`whoami` can display email, Account ID, and credential-storage details. Do not run it unnecessarily through an agent tool or paste raw output. Never run `wrangler auth token` for routine checks because it outputs the usable credential. Remove local OAuth authorization when requested with `npx wrangler logout`.

## Read-Only Remote Inventory

These commands access Cloudflare but do not mutate the target:

```bash
npx wrangler deployments list --config "$TODONE_CONFIG"
npx wrangler versions list --config "$TODONE_CONFIG"
npx wrangler secret list --config "$TODONE_CONFIG" --format pretty

npx wrangler deployments list --config "$LOG_CONFIG"
npx wrangler versions list --config "$LOG_CONFIG"
npx wrangler secret list --config "$LOG_CONFIG" --format pretty

npx wrangler d1 info "$TODONE_DB" --json
npx wrangler d1 info "$LOG_DB" --json
```

`secret list` returns names/types, never values, so it cannot prove Platform and Worker tokens match. JSON inventory can contain internal identifiers; summarize it rather than pasting raw output. These reads still require explicit production-read authorization.

## Deploy Worker Code

`wrangler deploy` creates a Worker version and immediately sends it 100% of traffic. Deploy each target independently and only with explicit authorization:

```bash
npx wrangler deploy --config "$TODONE_CONFIG" --strict \
  --message "<change and task reference>"

npx wrangler deploy --config "$LOG_CONFIG" --strict \
  --message "<change and task reference>"
```

After each command, record target, version/deployment ID, timestamp, adapter source commit, and output status. Verify one Worker before moving to the next when the change can be isolated. D1 contents are not versioned with Worker code.

## Set Or Rotate `AUTH_TOKEN`

Use the interactive prompt; never pass or echo the value:

```bash
npx wrangler secret put AUTH_TOKEN --config "$TODONE_CONFIG"
npx wrangler secret put AUTH_TOKEN --config "$LOG_CONFIG"
```

Cloudflare creates and immediately deploys a new Worker version when `secret put` succeeds. It is an external deployment, not a harmless configuration edit. A stopped-service rotation is:

1. authorize the exact Worker and interruption;
2. stop the affected Platform writer/service;
3. securely prepare the matching Platform-side value without printing it;
4. run `secret put` for only that Worker;
5. update the matching Platform configuration source;
6. restart and perform authenticated health plus business checks;
7. prove the old token returns `401`;
8. repeat separately for the other Worker if required.

Do not rotate a long-lived Todone token through the current UI without acknowledging its logging/GET exposure or first fixing the secret contract. Environment overrides exist, but the production injection mechanism is `TODO-verify`; do not invent a server command.

An authenticated health check can avoid putting the token in `curl` arguments:

```bash
read -r -s "WORKER_TOKEN?Worker token: "; echo
read -r "WORKER_ENDPOINT?Worker endpoint: "

curl --config <(printf 'header = "Authorization: Bearer %s"\n' "$WORKER_TOKEN") \
  --fail-with-body --silent --show-error \
  "${WORKER_ENDPOINT%/}/health"

unset WORKER_TOKEN WORKER_ENDPOINT
```

Do not paste filled values or the environment. Repeat with the old token after rotation and capture only the HTTP status, expecting `401`.

## Worker Logs And Diagnosis

Start a filtered live tail:

```bash
npx wrangler tail --config "$TODONE_CONFIG" --status error --format pretty
npx wrangler tail --config "$LOG_CONFIG" --status error --format pretty
```

Stop with `Ctrl-C`. Tails can be sampled and contain request metadata; redact before sharing. The proxy logs request ID, mode, latency, result metadata, and SQL hash, not full SQL or bearer tokens.

An empty Platform page is not a reason to write D1. Correlate authenticated `/health`, Worker errors, Platform startup/query errors, direct read-only counts, old value representation versus bound predicates, and the deployed frontend/cache.

## Worker Code Rollback

Select an explicit known-good version and roll back only after authorization:

```bash
npx wrangler deployments list --config "$TODONE_CONFIG"
npx wrangler versions list --config "$TODONE_CONFIG"
npx wrangler rollback <VERSION_ID> --config "$TODONE_CONFIG" \
  --message "<rollback reason and task reference>"
```

Repeat with `LOG_CONFIG` only if required. Rollback immediately changes the active Worker deployment. It does not restore D1 data; use the application/D1 rollback path for persistent changes. Re-verify active secret compatibility rather than assuming a code rollback restored the intended credential state.

## D1 Read-Only Audit And Backup

Retrieve metadata and a Time Travel bookmark before a write:

```bash
npx wrangler d1 info "$TODONE_DB" --json
npx wrangler d1 time-travel info "$TODONE_DB" --json
```

For the log database, use `$LOG_DB`. Record the bookmark without publishing it broadly.

Approved aggregate-only SQL may use:

```bash
npx wrangler d1 execute "$TODONE_DB" --remote \
  --command "SELECT COUNT(*) AS row_count FROM <approved_table>;"
```

`d1 execute --remote` is not intrinsically read-only; SQL controls mutation. Review complete SQL first, limit output to non-sensitive aggregates, and never turn an ad-hoc diagnostic into an `UPDATE`/`DELETE` migration. Use a reviewed helper with plan, backup, verify, and rollback.

Optional full export:

```bash
umask 077
npx wrangler d1 export "$TODONE_DB" --remote \
  --output "$HOME/d1-backup-$(date +%Y%m%d-%H%M%S).sql"
```

Cloudflare documents that export can block other database requests and has data-type/virtual-table limitations. Schedule it during maintenance, store it outside the repository with restrictive permissions, and do not substitute it for a migration-specific backup.

## D1 Time Travel Restore — Emergency Only

This is destructive and overwrites the database in place. It cancels in-flight queries/transactions, so stop every writer and require explicit restore authorization:

```bash
npx wrangler d1 time-travel restore "$TODONE_DB" \
  --bookmark "<RECORDED_BOOKMARK>"
```

Record the undo bookmark returned by restore, verify the restored state, then restart a compatible Platform revision. Worker rollback and D1 restore solve different problems.

Do not use `wrangler delete`, `wrangler secret delete`, D1 delete, or an unreviewed remote SQL file in the normal runbook. Each requires separate destructive-action authorization and recovery proof.
