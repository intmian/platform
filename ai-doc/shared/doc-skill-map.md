# Doc And Skill Loading Map

Last verified: 2026-03-06

## Goal

1. Keep AI context small but complete.
2. Prevent frontend-only bias on full-stack tasks.
3. Make skill behavior deterministic and auditable.

## Applicable skill

1. `$platform-developer-assistant` must always start from `ai-doc/README.md`.
2. After index read, load docs by task shape using the matrix below.

## Loading matrix

## Frontend-only task

1. Load:
   - `shared/engineering-workflow.md`
   - `frontend/architecture.md` when routing/auth/request base is shared-layer relevant
   - matched domain docs (`todone/*`, `library/*`, `note-mini/*`)
2. Skip backend docs unless API contract/auth/config is touched.

## Backend-only task

1. Load:
   - `shared/engineering-workflow.md`
   - `shared/coverage-map.md` when deciding whether the requested area is already documented
   - `backend/architecture.md`
   - `backend/gateway-auth.md` when route/auth/permission propagation is touched
   - `backend/config-and-ai.md` when config/AI/R2 is touched
   - `backend/observability.md` when runtime visibility/logging matters
   - `backend/services.md`
   - matched backend deep doc (`backend/account.md`, `backend/auto.md`, `backend/cmd.md`, `backend/todone-core.md`, `backend/web-storage.md` as applicable)
   - `backend/testing.md`
2. Load frontend docs only when request explicitly includes UI behavior.

## Full-stack task

1. Load:
   - `shared/engineering-workflow.md`
   - `shared/debug-workflow.md` when repro/debug is needed
   - `shared/coverage-map.md` when the task spans multiple system/domain areas
   - `frontend/architecture.md` when frontend shell/auth/request stack matters
   - `backend/architecture.md`
   - `backend/gateway-auth.md` when gateway/auth is involved
   - `backend/config-and-ai.md` when config/AI/R2 is involved
   - `backend/services.md`
   - matched backend deep docs as needed
   - matched domain docs

## Pure learning / mapping task

1. Load:
   - `shared/learning-workflow.md`
   - only minimum supporting domain/backend docs needed to answer stable facts

## Write-back rules for skill runs

1. If change impacts backend contract/permission/config, update backend docs in same turn.
2. If change impacts domain behavior visible to frontend, update domain doc in same turn.
3. If change adds reusable workflow/tooling, update `shared/reusable-tools.md`.
4. Do not store one-off command logs in domain/backend docs.

## Suggested evolution path (repo-level)

1. Keep one orchestration skill (`platform-developer-assistant`) as the default entry.
2. Add optional narrow skills only when repeated complexity appears:
   - backend-debug
   - todone-move-cache-debug
   - cmd-runtime-debug
3. Each narrow skill should only define loading order and verification checkpoints, not duplicate domain facts already stored in `ai-doc`.

## Anti-duplication rule

1. Facts live in `ai-doc`; skills should reference docs, not restate contracts.
2. When a fact changes, update doc once and keep skills unchanged unless routing logic changed.
