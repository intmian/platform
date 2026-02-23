# Shared Learning Workflow

Last verified: 2026-02-23

## Goal

1. Keep context small while still loading enough knowledge to finish tasks safely.
2. Make document loading deterministic and reusable across tasks.

## On-demand loading flow

1. Start from `ai-doc/README.md` only.
2. Classify task type:
   - feature/change -> load `shared/engineering-workflow.md`
   - bug/debug -> load `shared/engineering-workflow.md` + `shared/debug-workflow.md`
   - domain-specific behavior -> load matched domain doc only (for example `library/*` or `note-mini/*`)
3. Build a minimal question list before reading code:
   - what is the target behavior
   - what is the current behavior path
   - what must not change
4. Load only docs that answer current questions; stop when questions are answered.
5. Verify from code/runtime; if docs conflict with code, trust code and update docs in the same turn.
6. For UI behavior changes, always collect MCP pre/post evidence.
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

## MCP quick recovery (known issue)

1. Symptom: Playwright MCP launch fails and Chrome prints message equivalent to "opened in existing browser session".
2. Recovery:
   - close local Chrome processes
   - keep one stable dev URL (prefer `127.0.0.1`)
   - retry MCP navigation/snapshot
3. Do not claim UI completion without MCP evidence after recovery.
