# Shared Engineering Workflow

Last verified: 2026-02-23

## Scope

1. This is the default workflow for all engineering tasks in this repo:
   - feature delivery
   - bug fixing/debugging
   - refactor/performance work
2. Any specialized playbook (for example `debug-workflow.md`) is a sub-playbook and must not bypass this workflow.

## Operating modes

1. Feature mode:
   - new behavior or behavior change requested by user
2. Debug mode:
   - existing behavior mismatch/failure investigation
3. Refactor/perf mode:
   - non-functional change with behavior parity target
4. Mixed mode:
   - default when one task spans more than one mode; follow the strictest gate.

## Mandatory flow

1. Outcome lock:
   - restate target behavior and explicit non-goals before editing.
2. Runtime readiness:
   - backend reachable
   - frontend/dev runtime reachable (if UI involved)
   - auth context validated
3. Baseline capture:
   - code baseline (key files/paths)
   - runtime baseline (MCP snapshot or logs/test output)
4. Plan with risk map:
   - touch points
   - behavior risk
   - data/schema risk
   - rollback path
5. Implement minimal coherent slice:
   - prefer one complete vertical slice over scattered partial edits.
6. Verify target behavior:
   - code-level check (build/test/type/lint where relevant)
   - runtime/interaction evidence for UI behavior changes
7. Run adjacent regression path:
   - at least one nearby non-target path
8. Report with evidence:
   - repro/baseline
   - patch
   - post-state
   - regression
   - residual risk
9. Retrospective and process evolution:
   - identify mistakes in this run
   - root cause analysis
   - prevention rule
   - process update in `ai-doc` when needed
10. Data mutation accounting:
   - record entities changed during verification
   - provide cleanup plan (or perform cleanup when safe and requested)
11. AI-doc curation before write-back:
   - keep only reusable knowledge for future tasks
   - drop patch-only process context and one-off exploration noise
   - write stable conclusions (contracts, root-cause patterns, environment blockers), not transient execution details

## Evidence standard

1. UI behavior claims require MCP pre/post interaction evidence.
2. Build/test success alone is insufficient for UI behavior conclusions.
3. When runtime is unavailable, explicitly mark verification as blocked and do not claim completion.

## Process evolution protocol

1. Do not treat workflow changes as minor append-only notes.
2. If repeated friction or failure pattern is observed, prefer structural workflow rewrite over local patching.
3. Allowed structural changes:
   - add/remove/reorder mandatory gates
   - split into mode-specific tracks
   - tighten completion criteria
4. Every structural process change must include:
   - what failed
   - why old process allowed it
   - what gate now prevents recurrence

## Completion gate

1. Task is not complete without target verification evidence and adjacent regression result (or explicit blocker).
2. Task is not complete without retrospective output.
3. For behavior-changing work, AI-doc update is required in the same turn.
