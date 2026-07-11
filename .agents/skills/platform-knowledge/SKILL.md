---
name: platform-knowledge
description: Locate, explain, verify, refresh, and write documentation for the Platform repository. Use for questions about project knowledge, architecture, conventions, document routing, stale docs, README updates, coverage maintenance, or stable contracts introduced or changed by development and debugging work.
---

# Platform Knowledge

1. Locate the repository root, read `ai-doc/README.md` first, and follow its authority, reading, and writing rules.
2. Load only the system, domain, testing, coverage, or user-facing documents needed for the current question.
3. Verify material facts against current code or runtime before asserting or refreshing them. Code and verified behavior override plans and stale notes.
4. Persist stable contracts, ownership, reusable behavior, recurring failure patterns, and durable constraints. Keep one-off commands, patch traces, and temporary experiments in the task report instead.
5. Update `Last verified` only when the document's material facts were actually checked. Use `TODO-verify` for unresolved conflicts.
6. Merge duplicate content rather than appending history. Update `shared/coverage-map.md` for coverage changes and `shared/reusable-tools.md` for reusable helpers or preferred flows.
7. Update root or module README files when installation, operation, or user-facing usage changes; do not treat `plan/` or `docs/plan/` as current truth without code verification.
