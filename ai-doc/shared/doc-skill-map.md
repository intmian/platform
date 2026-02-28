# Doc And Skill Loading Map

Last verified: 2026-02-27

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
   - matched domain docs (`todone/*`, `library/*`, `note-mini/*`)
2. Skip backend docs unless API contract/auth/config is touched.

## Backend-only task

1. Load:
   - `shared/engineering-workflow.md`
   - `backend/architecture.md`
   - `backend/services.md`
   - matched backend deep doc (`backend/todone-core.md` if todone)
   - `backend/testing.md`
2. Load frontend docs only when request explicitly includes UI behavior.

## Full-stack task

1. Load:
   - `shared/engineering-workflow.md`
   - `shared/debug-workflow.md` when repro/debug is needed
   - `backend/architecture.md` + `backend/services.md`
   - matched domain docs
   - `backend/todone-core.md` when todone ordering/cache/move is involved

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
