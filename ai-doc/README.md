# AI Docs Index

Purpose: provide repository-local, task-scoped knowledge for AI agents.

Last verified: 2026-02-23

## Core rules

1. Solve user tasks with minimal safe changes.
2. Keep before/after evidence for behavior-impacting fixes and run at least one adjacent regression path.
3. When stable facts change, update matching `ai-doc` files in the same turn.
4. UI behavior-impacting fixes require interaction evidence (MCP pre/post); build/test output alone is insufficient.

## Loading rules

1. Read this index first.
2. Only load documents relevant to the current task.
3. Prefer code verification over stale notes when conflicts appear.
4. After confirming new behavior from code or real interaction, update the matched doc.
5. Record `Last verified` date on every updated document.

## Routing

1. Cross-module engineering default workflow: `shared/engineering-workflow.md`
2. Cross-module debugging specialized workflow: `shared/debug-workflow.md`
3. Shared learning/loading workflow: `shared/learning-workflow.md`
4. Library domain logic: `library/knowledge.md`
5. Library testing matrix: `library/testing.md`
6. Library interactive UI map: `library/ui-locator.md`
7. Note mini domain logic: `note-mini/knowledge.md`
8. Note mini testing workflow: `note-mini/testing.md`

## Completion gate

1. Do not declare completion without evidence summary and regression result.
2. Explicitly report AI-doc updates performed (or state none).

## Update policy

1. Facts from code: update immediately.
2. Facts from UI interaction: add with `verified via interaction` note.
3. Unknown or conflicting facts: add `TODO-verify` instead of replacing existing fact blindly.

## Knowledge curation gate

1. Only persist context that is likely reusable in future turns (cross-task or recurring value).
2. Do not persist patch-only process traces:
   - temporary debugging steps
   - one-off command outputs
   - trial-and-error path that does not change stable understanding
3. Prefer stable conclusions over implementation noise:
   - behavior contracts
   - root-cause patterns
   - environment constraints that can block future verification
4. If uncertain whether a detail is reusable, do not add it to domain docs; keep it in task report only.
