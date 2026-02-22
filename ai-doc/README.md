# AI Docs Index

Purpose: provide repository-local, task-scoped knowledge for AI agents.

Use rules:

1. Read this index first.
2. Only load documents relevant to the current task.
3. Prefer code verification over stale notes when conflicts appear.
4. After confirming new behavior from code or real interaction, update the matched doc.
5. Record `Last verified` date on every updated document.

Routing:

1. Cross-module debugging/process: `shared/debug-workflow.md`
2. Library domain logic: `library/knowledge.md`
3. Library testing matrix: `library/testing.md`
4. Library interactive UI map: `library/ui-locator.md`

Update policy:

1. Facts from code: update immediately.
2. Facts from UI interaction: add with `verified via interaction` note.
3. Unknown or conflicting facts: add `TODO-verify` instead of replacing existing fact blindly.
