# AI Docs Index

Purpose: repository-local, task-scoped knowledge for Platform development.

Last verified: 2026-07-11

## Authority and document types

1. Current code and verified runtime behavior are authoritative.
2. `ai-doc` stores stable architecture, contracts, recurring constraints, and verification guidance.
3. Root and module README files are user-facing orientation and usage documentation.
4. `plan/` and `docs/plan/` contain future direction, implementation plans, benchmarks, and history; verify their claims against code before treating them as current behavior.
5. If a document conflicts with code, follow code and use `$platform-knowledge` to correct the document.

## Shared guidance

1. Development decisions: `shared/development.md`
2. Test selection and execution: `shared/testing.md`
3. Bug diagnosis: `shared/debugging.md`
4. CI, deployment, and external-operation boundaries: `shared/ci-deploy.md`
5. Reusable helpers and flows: `shared/reusable-tools.md`
6. Code-to-doc coverage: `shared/coverage-map.md`

Load shared guidance through the matching repository skill under `.agents/skills/`; do not load every workflow document for every task.

## System knowledge

### Frontend

- Shell, routing, auth, requests, shared config and AI UI: `frontend/architecture.md`

### Backend

- Bootstrap and service registration: `backend/architecture.md`
- Gateway, auth, cookies, and permission propagation: `backend/gateway-auth.md`
- Config, AI, and R2: `backend/config-and-ai.md`
- Logs, BI, SQL tracing, and profiling: `backend/observability.md`
- Service catalog and command matrix: `backend/services.md`
- Backend test/runtime baseline: `backend/testing.md`
- Service deep docs: `backend/account.md`, `backend/auto.md`, `backend/cmd.md`, `backend/todone-core.md`, `backend/web-storage.md`

## Domain knowledge

- Todone: `todone/knowledge.md`, `todone/testing.md`, `todone/ui-locator.md`
- Library: `library/knowledge.md`, `library/testing.md`, `library/ui-locator.md`
- Note Mini: `note-mini/knowledge.md`, `note-mini/testing.md`
- Subscription: `subscription/knowledge.md`
- Family money book: `money/knowledge.md`, `money/testing.md`, `money/ui-locator.md`

## Reading rules

1. Load only documents that answer the current task's questions.
2. For frontend/backend shared behavior, load the matching system document before the domain document.
3. For testing, load only the relevant shared, backend, or domain testing document.
4. When a loaded fact looks stale or affects a risky decision, spot-check it against code or runtime before relying on it.
5. Do not refresh `Last verified` unless the document's material facts were actually checked.

## Writing rules

1. Persist only reusable facts: contracts, ownership, stable behavior, recurring failure patterns, and durable environment constraints.
2. Do not persist one-off command output, patch history, temporary debugging steps, or trial-and-error notes.
3. Mark facts verified through UI or runtime interaction explicitly when that distinction matters.
4. Use `TODO-verify` for unresolved conflicts; do not overwrite uncertain facts.
5. Merge or rewrite overlapping content instead of appending duplicate bullets.
6. Update `shared/coverage-map.md` when adding or removing a documented service or domain.
7. Update `shared/reusable-tools.md` when adding a reusable helper or preferred recurring flow.
8. Update user-facing README files when installation, operation, or usage instructions change.
