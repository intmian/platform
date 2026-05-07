# Shared Engineering Workflow

Last verified: 2026-05-07

## Scope

1. This is the default workflow for all engineering tasks in this repo:
   - feature delivery
   - bug fixing/debugging
   - refactor/performance work
2. Specialized playbooks (`debug-workflow.md`, `learning-workflow.md`) define only the delta from this baseline and must not repeat gates already defined here.

## Operating modes

1. Feature mode:
   - new behavior or behavior change requested by user
2. Debug mode:
   - existing behavior mismatch/failure investigation
   - also load `shared/debug-workflow.md` for fault-domain classification and environment-specific checks
3. Refactor/perf mode:
   - non-functional change with behavior parity target
4. Mixed mode:
   - default when one task spans more than one mode; follow the strictest gate.
5. Large-change mode:
   - applies when the task materially changes architecture, shared abstractions, config contracts, or cross-layer boundaries.
   - concrete triggers: modifies `shared/` directory exports; adds or removes config keys; changes API contracts across 3+ modules; introduces new service registration; restructures route ownership.
   - when triggered, step 1 and step 3 have additional design requirements below.

## Mandatory flow

1. Outcome lock:
   - restate target behavior and explicit non-goals before editing.
   - for large-change mode, explicitly identify the architecture boundary being changed and the layers that own the behavior.
   - when touching shared libraries or reusable utilities, explicitly state why the behavior belongs in the shared layer rather than the calling business layer
2. Baseline capture:
   - code baseline (key files/paths)
   - runtime baseline (browser snapshot/screenshot or logs/test output)
   - if baseline needs runtime evidence, do a lightweight runtime check here (full readiness gate is step 5)
3. Plan with risk map:
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
4. Implement minimal coherent slice:
   - prefer one complete vertical slice over scattered partial edits.
   - do not use frontend-only fallback/default rendering to mask a backend contract or runtime-verification gap; fix the owning layer first
   - do not move business rules, config ownership, scene names, or storage keys into shared libs unless the user explicitly asks for a shared abstraction and the generic contract is defensible
5. Runtime readiness:
   - before verification, explicitly check whether test backend and test frontend/dev server are already running; reuse if healthy, start only missing parts
   - backend reachable
   - frontend/dev runtime reachable (if UI involved)
   - auth context validated
   - when changing config contracts or backend defaults, verify that the running backend process is actually the new code/version before drawing conclusions from UI behavior
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

## Task scaling

The 12-step flow is the full baseline. Scope each step to the task — not all steps produce meaningful output for every task.

Always required (core loop):
- Steps 1-8: Outcome lock → Report. These are the engineering baseline. For trivial tasks, steps 2-3 and 8 may be one line each.

Conditional — skip with explicit `none` when vacuous:
- Step 9 (Retrospective): required when the task involved debugging, investigation, or a non-trivial decision. Skip for typo fixes, one-line config changes, and other changes with no root cause to analyze.
- Step 10 (Data mutation): required only when verification changed persistent state (created/updated/deleted entities). Skip when verification was read-only.
- Step 12 (Tool registration): required only when new reusable helpers/hooks/utilities/workflows were introduced. Skip when no new reusable code or pattern was created.

Always required (curation):
- Step 11 (AI-doc curation): always confirm whether an update is needed, even if the answer is `none`.

## Blocked path

1. When any mandatory gate cannot be satisfied (runtime unavailable, auth blocked, sandbox restriction), do not silently skip it.
2. Report: which gate is blocked, why, what was completed before it, and what the user can do to unblock.
3. Do not claim completion while any gate is blocked.

## Evidence standard

1. UI behavior claims require browser pre/post interaction evidence.
2. Frontend change verification must include normal-flow interaction evidence plus at least one adjacent regression interaction path.
3. UI change verification must include screenshot evidence of:
   - the changed area
   - at least one nearby non-target area to confirm no unintended impact
4. UI conclusion must explicitly state both "changed behavior works" and "no observed collateral UI impact" based on interaction + screenshot evidence.
5. Build/test success alone is insufficient for UI behavior conclusions.
6. Backend behavior-impacting fixes require at least one direct API verification path (not only compile/lint).
7. When runtime is unavailable, explicitly mark verification as blocked and do not claim completion.
8. Prefer `playwright-cli` when browser automation is available; use headless by default to avoid interrupting local work, headed only when visual observation is required or explicitly requested.
9. When browser launch fails due to existing Chrome session, close local Chrome processes and retry with one stable dev URL (prefer `127.0.0.1`).
10. Treat framework deprecation warnings as non-regression unless new runtime errors or behavior drift appears.

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

This is the single authoritative completion gate. All other docs reference this one.

1. Evidence required: target verification with pre/post evidence + at least one adjacent regression result (or explicit blocker with reason).
2. Report format: repro/baseline → patch → post-state → regression → residual risk.
3. Retrospective: mistake identified → root cause → prevention rule → process update in ai-doc (or explicit `none` with reason).
4. AI-doc update: updated in the same turn for behavior-changing work (or explicit `none`).
5. Reusable-tools update: `shared/reusable-tools.md` updated in the same turn when new tools/processes are introduced (or explicit `none`).
6. Commit text draft in this format:
   - `feat/fix/refac 模块: 一句话总结`
   - `- 改动需求或修复bug1`
   - `- ...`
