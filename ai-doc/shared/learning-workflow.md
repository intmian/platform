# Shared Learning Workflow

Last verified: 2026-03-25

## Goal

1. Keep context small while still loading enough knowledge to finish tasks safely.
2. Make document loading deterministic and reusable across tasks.

## On-demand loading flow

1. Start from `ai-doc/README.md` only.
2. Classify task type:
   - feature/change -> load `shared/engineering-workflow.md`
   - bug/debug -> load `shared/engineering-workflow.md` + `shared/debug-workflow.md`
   - coverage/routing uncertainty -> load `shared/coverage-map.md`
   - frontend shell/routing/auth/request task -> load `frontend/architecture.md`
   - backend/API/auth/config task -> load `backend/architecture.md` + task-relevant backend system docs (`backend/gateway-auth.md`, `backend/config-and-ai.md`, `backend/observability.md`) + `backend/services.md` + matched backend deep doc
   - domain-specific behavior -> load matched domain doc only (for example `library/*` or `note-mini/*`)
   - uncertain case -> load `shared/doc-skill-map.md` and follow its loading matrix
3. Build a minimal question list before reading code:
   - what is the target behavior
   - what is the current behavior path
   - what must not change
4. Load only docs that answer current questions; stop when questions are answered.
5. Verify from code/runtime; if docs conflict with code, trust code and update docs in the same turn.
6. For UI behavior changes, always collect browser pre/post evidence.
7. Before finishing:
   - run one adjacent regression path
   - record data mutation/cleanup notes
   - list AI-doc updates performed

## Write-back decision rules

1. Add to AI-doc only when the finding can help later turns make faster or safer decisions.
2. Good candidates:
   - stable behavior facts verified from code/runtime
   - recurring failure patterns and their prevention rule
   - environment/runtime constraints that repeatedly affect verification
3. Do not add:
   - per-turn command logs
   - temporary workaround steps with no long-term value
   - implementation micro-steps that do not change the system understanding
4. When value is unclear, keep detail in the current task report and skip AI-doc write-back.
5. If a new reusable helper/hook/utility/simple workflow is introduced, write it to `shared/reusable-tools.md` with concise reuse instructions.

## Browser Verification Preference

1. Prefer `playwright-cli` when browser automation is available; do not switch to non-CLI browser tooling unless `playwright-cli` is unavailable or the task explicitly requires it.
2. Prefer headless verification by default so local desktop work is not interrupted.
3. If browser launch fails due to an existing Chrome session:
   - close local Chrome processes
   - keep one stable dev URL (prefer `127.0.0.1`)
   - retry browser navigation/snapshot
4. Do not claim UI completion without browser interaction evidence after recovery.
