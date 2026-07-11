# AI Doc Coverage Map

Last verified: 2026-07-11

## Shared guidance

- Development: `shared/development.md`
- Testing: `shared/testing.md`
- Debugging: `shared/debugging.md`
- CI and deployment: `shared/ci-deploy.md`
- Reusable tools and flows: `shared/reusable-tools.md`
- Documentation coverage: this file

## System coverage

- Frontend shell, routes, shared auth/request/config/AI UI: `frontend/architecture.md`
- Backend bootstrap: `backend/architecture.md`
- Gateway and auth: `backend/gateway-auth.md`
- Config, AI, and R2: `backend/config-and-ai.md`
- Logs, BI, tracing, and profiling: `backend/observability.md`
- Services and permissions: `backend/services.md`
- Backend runtime/testing: `backend/testing.md`

## Backend service coverage

- `backend/services/account/*`: `backend/account.md`
- `backend/services/auto/*`: `backend/auto.md`
- `backend/services/cmd/*`: `backend/cmd.md`
- `backend/services/todone/*`: `backend/todone-core.md`
- `backend/services/web-storage/*`: `backend/web-storage.md`

## Domain coverage

- Todone: `todone/knowledge.md`, `todone/testing.md`, `todone/ui-locator.md`
- Library: `library/knowledge.md`, `library/testing.md`, `library/ui-locator.md`
- Note Mini: `note-mini/knowledge.md`, `note-mini/testing.md`
- Subscription: `subscription/knowledge.md`
- Family money book: `money/knowledge.md`, `money/testing.md`, `money/ui-locator.md`

## Intentionally thin or uncovered

- Admin UI pages have no dedicated domain document.
- Report UI (`frontend/src/report/*`) has no dedicated domain document.
- Debug UI (`frontend/src/debug/*`) has no dedicated domain document.
- Misc standalone pages such as `love47`, `loss-fat`, `kana`, and `rate/jianxing` are not currently documented.

## Maintenance

1. A newly documented backend service needs a services catalog entry, a deep document, and a row here.
2. A newly documented domain normally needs a knowledge document, a testing document when repeatable verification matters, and an optional UI locator for interaction-heavy behavior.
3. List intentionally undocumented areas rather than implying full coverage.
