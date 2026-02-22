# AI Docs Index

Purpose: provide repository-local, task-scoped knowledge for AI agents.

Last verified: 2026-02-22

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

1. Cross-module debugging/process: `shared/debug-workflow.md`
2. Library domain logic: `library/knowledge.md`
3. Library testing matrix: `library/testing.md`
4. Library interactive UI map: `library/ui-locator.md`

## Completion gate

1. Do not declare completion without evidence summary and regression result.
2. Explicitly report AI-doc updates performed (or state none).

## Update policy

1. Facts from code: update immediately.
2. Facts from UI interaction: add with `verified via interaction` note.
3. Unknown or conflicting facts: add `TODO-verify` instead of replacing existing fact blindly.
