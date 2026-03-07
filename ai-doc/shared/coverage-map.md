# AI Doc Coverage Map

Last verified: 2026-03-06

## Purpose

1. Show which code areas are intentionally covered by which `ai-doc` files.
2. Make missing documentation visible before future drift grows.

## System-layer coverage

1. Shared workflows:
   - `shared/engineering-workflow.md`
   - `shared/debug-workflow.md`
   - `shared/learning-workflow.md`
   - `shared/doc-skill-map.md`
   - `shared/reusable-tools.md`
2. Frontend shell:
   - `frontend/architecture.md`
   - covers `frontend/src/main.jsx`, `frontend/src/App.jsx`, shared auth/request/proxy conventions
3. Backend platform:
   - `backend/architecture.md`
   - `backend/gateway-auth.md`
   - `backend/config-and-ai.md`
   - `backend/observability.md`
   - `backend/services.md`

## Backend service deep coverage

1. `backend/services/account/*`:
   - `backend/account.md`
2. `backend/services/auto/*`:
   - `backend/auto.md`
3. `backend/services/cmd/*`:
   - `backend/cmd.md`
4. `backend/services/todone/*`:
   - `backend/todone-core.md`
5. `backend/services/web-storage/*`:
   - `backend/web-storage.md`

## Domain coverage

1. Todone:
   - `todone/knowledge.md`
   - `todone/testing.md`
   - `todone/ui-locator.md`
   - code area: `frontend/src/todone/*` + `backend/services/todone/*`
2. Library:
   - `library/knowledge.md`
   - `library/testing.md`
   - `library/ui-locator.md`
   - code area: library behavior built on `frontend/src/todone/Library*` + todone task data contract
3. Note mini:
   - `note-mini/knowledge.md`
   - `note-mini/testing.md`
   - code area: `frontend/src/misc/memos.tsx` + platform config/misc endpoints + external memos API

## Intentionally thin or uncovered areas

1. Admin UI pages are not yet documented as a dedicated domain.
2. Report UI (`frontend/src/report/*`) has no dedicated domain doc yet.
3. Debug UI (`frontend/src/debug/*`) has no dedicated domain doc yet.
4. Misc standalone pages (`love47`, `loss-fat`, `kana`, `rate/jianxing`) are not currently in `ai-doc`.

## Maintenance rules

1. New registered backend service must add:
   - a row here
   - an entry in `backend/services.md`
   - a matched deep doc under `backend/`
2. New documented domain module must add:
   - knowledge doc
   - testing doc
   - optional ui-locator doc when interactive verification matters
   - a row here
3. If a module is intentionally undocumented, list it under `Intentionally thin or uncovered areas`.
