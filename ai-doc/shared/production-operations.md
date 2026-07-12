# Production Operations And Data Migrations

Last verified: 2026-07-12 (operation lessons, current Platform safety caveats, and `migrate_library_notes` behavior)

## Purpose And Routing

This runbook owns cross-cutting production authorization, secret handling, stopped-service migration, rollback, and AI handoff rules. Load the narrower owner document when the task reaches a concrete system:

1. Platform CI and server deployment: `shared/ci-deploy.md`.
2. Cloudflare D1 Worker inventory, Wrangler, Worker secrets, versions, logs, and D1 recovery: `backend/d1-worker-operations.md`.
3. Domain-specific migration invariants and verification: the matched backend/domain knowledge and testing documents.

Treat these as separate state changes:

1. code and dependency changes;
2. deployment or service stop/start;
3. configuration changes;
4. secret creation or rotation;
5. schema changes;
6. persistent-data rewrites.

Authorization for one item does not imply authorization for another. Feature implementation does not authorize a push, deployment, production query, secret change, or data migration.

## Lessons From The Two D1 Operations

The Worker-only cutover showed the failure mode to avoid: production configuration was not frozen before a `master` push triggered deployment; a real endpoint was temporarily embedded in code; an over-privileged existing token was reused; local and server token equality was assumed rather than verified; and tests used newly created data instead of old REST-written data. The database still contained the records, but text booleans did not match integer-bound predicates, so the UI appeared empty and an emergency data conversion was required.

The Library Note migration showed the preferred pattern: architecture and data ownership were agreed first; the user stated that downtime and local execution were acceptable; code was tested and committed locally without pushing; the service stayed stopped through plan/apply/verify; the migration created a private backup before writes; verification completed before the single deployment push; and production smoke checks distinguished a stale frontend/cache from a data failure.

Durable conclusions:

1. Ask about acceptable downtime, execution location, deploy trigger, and who performs each external action before designing a complex zero-downtime flow.
2. Freeze code, config keys, secret ownership, migration semantics, rollback, and deployment order before the first production mutation.
3. Validate old production-like data and real business predicates; a fresh test database is insufficient for a driver or storage migration.
4. Treat an empty UI as a symptom, not proof of data loss.
5. Prefer one observable state transition at a time. Do not mix code rollout, secret rotation, and data repair unless the approved plan requires their ordering.

## Authority And Decision Gate

Before implementation, write a short decision record and obtain answers only for choices code cannot determine:

1. Is downtime acceptable, and what is the maximum window?
2. Who stops and starts the production service?
3. Does the migration run locally, on the server, or in CI?
4. Is deployment allowed only through the existing CI push path?
5. How many pushes are intended, and which push is the deployment trigger?
6. Who is authorized to change infrastructure, secrets, or production data?
7. What evidence permits forward progress, and what condition triggers rollback?

Do not replace a simple stopped-service plan with dual-token, blue/green, dual-write, or another availability design unless the user requests that property or downtime is unacceptable.

| Action | Default agent behavior |
| --- | --- |
| Inspect code, Git history, local files, and local tests | Proceed when relevant. |
| Read production data, logs, or configuration | Require explicit production/read authorization; minimize scope and redact output. |
| Push, deploy, stop/start a service, SSH, or call a state-changing endpoint | Require explicit authorization for that action. |
| Change a secret, infrastructure resource, or production record | State the exact target, expected effect, interruption, and rollback; then require explicit authorization. |
| User says they will perform an external step | Provide a safe command/checklist and wait for sanitized evidence; do not perform it on their behalf. |
| User withdraws production authorization | Stop external mutations immediately and continue only with local/read-only analysis. |

## Required Operation Record

Maintain a compact ledger in the active task and update it after every state change:

| Field | Required content |
| --- | --- |
| Scope | Repositories, services, databases, infrastructure, and config stores in scope. |
| Frozen revision | Local commit and intended deployed revision. |
| Current production state | Deployed revision, running/stopped state, and config source; mark unverified facts explicitly. |
| Planned writes | Every push, config/secret mutation, schema change, and data write. |
| Executor | User, agent, CI, or migration command for each step. |
| Gate evidence | Test result, plan counts, backup, restore point, verify result, CI result, and smoke result. |
| Rollback | Artifact/restore point, procedure, old revision, and restart condition. |
| Actual writes | What was really changed; do not conflate read-only audits with writes. |

Never report “production works” from only one layer. Infrastructure health, deployment success, process startup, and business behavior are separate gates.

## Secrets And Configuration

1. Never put real endpoints, account-specific hostnames, tokens, or credentials in source defaults, examples, committed docs, chat commands, screenshots, or copied tool output. Use placeholders.
2. An endpoint is not always a secret, but it can reveal infrastructure identity and still must not be hard-coded without an explicit product decision.
3. Use a dedicated least-privilege random token per service boundary. Do not reuse a provider API token as an application bearer token.
4. Verify each hop separately: intended local secret source, remote secret, application config source, process startup, and a business request. Do not infer hidden values match.
5. Transfer secrets through the user-approved secret store, hidden prompt, or local clipboard. Ask for redacted evidence only; never ask the user to paste a populated token export into chat.
6. If a secret appears in chat, a tool transcript, browser snapshot, log, or shell output, treat it as exposed. Finish or abort the cutover safely, then rotate it and prove the old value no longer works.
7. A password-style input masks display only; it does not establish safe storage, API responses, or log redaction.

System-specific secret ownership and known caveats belong in the matching operation document. For the current D1 Worker configuration, load `backend/d1-worker-operations.md`.

## Pre-Production Verification

1. Inspect the actual deployment workflow and identify the external trigger.
2. Finish the production configuration design before pushing. Confirm key names, owners, defaults, fallback behavior, and startup failure behavior.
3. Run proportionate local tests, builds, and real frontend/backend integration before declaring deployable.
4. Scan the proposed commit for real endpoints, legacy keys, tokens, generated backups, screenshots, and local environment files.
5. For a dependency/driver/storage change, test a fresh database and a sanitized fixture representing old data.
6. Exercise the same predicates and scans used by the application, including booleans, nullable values, IDs, timestamps, associations, indexes, and pagination.
7. Inspect storage classes/encodings as well as declared schema. `AutoMigrate` changes schema; do not assume it rewrites old values for a new driver.

## Preferred Stopped-Service Migration

Use this flow when downtime is acceptable and old/new code cannot safely write the same representation:

```text
DESIGNED -> PREPARED -> PLANNED -> STOPPED -> BACKED_UP
         -> APPLIED -> VERIFIED -> DEPLOYED -> SMOKED -> CLOSED
```

Do not skip or reorder a state without documenting why.

### DESIGNED

1. Define source/target representations, identity, ownership, invariants, and preserved fields.
2. Define deterministic handling for malformed, duplicate, missing-parent, unknown-field, and already-migrated cases.
3. Define verification and rollback before writing the migration.
4. Keep bulk data conversion out of application startup. Runtime schema migration and offline data migration have different failure semantics.

### PREPARED

1. Complete implementation and production-like testing.
2. Commit locally without pushing when the next push is intended to deploy.
3. Record the new commit, previous deployed revision, and working-tree state.
4. Prepare commands with placeholders and load credentials without echoing or storing them in the repository.
5. Identify every writer, including background jobs and alternate service instances.

### PLANNED

1. Default mode must be read-only and produce stable counts plus validation errors.
2. Compare plan counts with independently known business totals or direct read-only queries.
3. Investigate unexpected zero counts, parse failures, type distributions, and orphan relations before writing.
4. Re-run the plan after stopping writers when concurrent changes could alter it.

### STOPPED And BACKED_UP

1. Confirm every writer is stopped; do not rely only on a UI status.
2. Create the provider recovery point when available.
3. Create an application backup containing every rollback value. Use a new file, mode `0600`, exclusive creation, hashes, and a location outside the repository.
4. Record path, size, permissions, creation time, hash coverage, and owner without printing contents.

### APPLIED

1. Require an explicit apply flag and stopped-service acknowledgement.
2. Prefer deterministic IDs, idempotent inserts, and compare-and-swap updates matching the planned old value.
3. Write new records before removing the old representation when that improves verification and rollback.
4. Stop on the first mismatch. Do not repair forward with ad-hoc production SQL before understanding the discrepancy.
5. Record exact affected objects/counts without exposing content.

### VERIFIED

1. Run a separate verification from the saved backup/plan, not only the apply success path.
2. Verify counts, identities, ownership, hashes/content, relationships, timestamps, unknown fields, and expected old-data absence.
3. Keep writers stopped and do not deploy until verification passes.

### DEPLOYED And SMOKED

1. Trigger deployment only through the agreed path.
2. Do not treat CI completion as runtime success.
3. Verify deployed backend and frontend revisions; a stale frontend/cache can resemble migration failure.
4. Test service start, a known historical record, a create-refresh-edit-delete cycle, affected filters/exports, and relevant logs.
5. If the UI is empty, check release/cache, backend errors, direct counts, and predicate/type compatibility before modifying data.

### CLOSED Or Rolled Back

1. Retain backup/recovery metadata for an agreed period and record who may delete it.
2. Remove local environment variables and clear temporary clipboard content.
3. Rotate exposed credentials and prove old credentials fail.
4. Reconcile the ledger with actual production writes and report divergence.
5. Persist reusable contracts in `ai-doc`; keep exact incident commands, credentials, counts, and transient logs in the task report.

Rollback rules:

1. Before apply: restart the old release after confirming no writes occurred.
2. Apply/verify failure: keep writers stopped, restore, verify the old representation, then restart the old release.
3. Deployment failure after verified migration: repair deployment while stopped or restore data before restarting an incompatible old release.
4. Smoke failure: classify frontend/cache, configuration/auth, backend/query, or data failure before selecting rollback.

## Repository Migration Helper

`backend/cmd/migrate_library_notes` is the reference stopped-service implementation:

1. default mode builds a read-only plan;
2. `--apply` and `--rollback` require `--confirm-stopped`;
3. apply creates a new mode-0600 JSONL backup before schema/data writes;
4. note IDs are deterministic and an existing ID is accepted only when stored content matches;
5. `Task.Note` uses an old-value update predicate;
6. apply verifies, and `--verify` independently rebuilds expectations from backup;
7. `--rollback` restores original `Task.Note` and removes deterministic migrated note rows.

Reuse its safety properties, not its schema or one-off production command line, for future migrations.

## AI Handoff Checklist

Before another AI continues an unfinished production task, provide:

1. user-approved scope and explicit prohibitions;
2. current migration/deployment state;
3. local commit, deployed revision, and whether any push occurred;
4. service running/stopped state and who controls it;
5. every planned and actual external mutation;
6. config key names and secret locations without values;
7. plan/backup/restore-point/verify evidence with sensitive content redacted;
8. remaining gate and rollback trigger;
9. known unverified assumptions and current system caveats;
10. the next single safe action.

The receiving AI must re-read this runbook plus the matched system operation document, verify current Git/runtime state, and continue from the recorded state. It must not repeat completed writes or infer authorization from the previous agent's plan.
