# Shared Engineering Workflow

Last verified: 2026-03-25

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
5. Large-change mode:
   - applies when the task materially changes architecture, shared abstractions, config contracts, or cross-layer boundaries.

## Mandatory flow

1. Outcome lock:
   - restate target behavior and explicit non-goals before editing.
   - for large-change mode, explicitly identify the architecture boundary being changed and the layers that own the behavior.
   - when touching shared libraries or reusable utilities, explicitly state why the behavior belongs in the shared layer rather than the calling business layer
2. Runtime readiness:
   - before testing, explicitly check whether test backend and test frontend/dev server are already running; reuse if healthy, start only missing parts
   - backend reachable
   - frontend/dev runtime reachable (if UI involved)
   - auth context validated
   - when changing config contracts or backend defaults, verify that the running backend process is actually the new code/version before drawing conclusions from UI behavior
3. Baseline capture:
   - code baseline (key files/paths)
   - runtime baseline (browser snapshot/screenshot or logs/test output)
4. Plan with risk map:
   - touch points
   - behavior risk
   - data/schema risk
   - rollback path
   - for large-change mode, write a detailed architecture design before implementation:
     - ownership by layer/module
     - config contract and default-value source of truth
     - migration/backward-compatibility plan
     - verification plan
   - do not implement large-change mode until the user has reviewed and agreed to the design
   - for shared-lib changes, include a boundary check:
     - what is generic and reusable
     - what remains business-specific
     - why the proposed API does not encode current business policy
5. Implement minimal coherent slice:
   - prefer one complete vertical slice over scattered partial edits.
   - do not use frontend-only fallback/default rendering to mask a backend contract or runtime-verification gap; fix the owning layer first
   - do not move business rules, config ownership, scene names, or storage keys into shared libs unless the user explicitly asks for a shared abstraction and the generic contract is defensible
6. Verify target behavior:
   - code-level check (build/test/type/lint where relevant)
   - for any frontend change, run interaction verification that simulates a normal user flow (not only isolated clicks)
   - runtime/interaction evidence for UI behavior changes
   - for config/default-value work, confirm the value shown in UI is coming from the intended backend/runtime path, not from a temporary frontend fallback
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
12. Reusable tool/process registration:
   - when introducing a new reusable helper/hook/utility/simple workflow, document it in `shared/reusable-tools.md` in the same turn
   - include minimal usage, inputs/options, and where it is already used
   - if there is a competing older path, mark preferred usage to avoid duplicate patterns

## Evidence standard

1. UI behavior claims require browser pre/post interaction evidence.
2. Frontend change verification must include normal-flow interaction evidence plus at least one adjacent regression interaction path.
3. UI change verification must include screenshot evidence of:
   - the changed area
   - at least one nearby non-target area to confirm no unintended impact
4. UI conclusion must explicitly state both "changed behavior works" and "no observed collateral UI impact" based on interaction + screenshot evidence.
5. Build/test success alone is insufficient for UI behavior conclusions.
6. When runtime is unavailable, explicitly mark verification as blocked and do not claim completion.
7. When browser automation is available, prefer `playwright-cli` over non-CLI browser tooling.
8. Prefer headless browser verification by default to avoid interrupting local work; use headed mode only when visual observation is required or explicitly requested.

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
5. Repeated failure patterns to guard explicitly:
   - changing shared/library code before proving the boundary belongs there
   - trusting stale runtime processes during verification
   - adding presentation-layer fallback that hides missing backend/default-value behavior
   - encoding business policy inside a reusable lib API instead of passing it in from the owning layer

## Completion gate

1. Task is not complete without target verification evidence and adjacent regression result (or explicit blocker).
2. Task is not complete without retrospective output.
3. For behavior-changing work, AI-doc update is required in the same turn.
4. For newly introduced reusable tools/processes, `shared/reusable-tools.md` update is required in the same turn.
