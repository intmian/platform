---
name: frontend-expert
description: Frontend development and debugging specialist for this Vite-based project. Use when working on files under frontend/, running local UI development, investigating page data-loading issues, or reproducing frontend bugs with MCP Playwright (snapshot, console, network, screenshot).
---

# Frontend Expert

Follow this workflow for frontend tasks in this repository.

## Start local frontend

1. Run `npm install` in `frontend/`.
2. Run `npm run dev` in `frontend/`.
3. Use `http://127.0.0.1:5173` as the default local URL.

## Preferred debugging method

Use MCP Playwright instead of local `@playwright/test` E2E, because this repo standardizes frontend debugging on MCP Playwright.

## MCP Playwright workflow

1. Confirm frontend service is reachable at `http://127.0.0.1:5173`.
2. Open the target page and capture a snapshot first.
3. If the `library` page has no data:
   - Click the top-left avatar/entry to open login.
   - Login with account `admin`.
   - Read admin password from backend runtime folder (`pack` or `test`) in `base_setting` field `admin_pwd`.
   - Refresh or re-enter the page.
4. Preserve evidence at key points:
   - Snapshot for structure and accessibility state.
   - Screenshot when visual confirmation is needed.
   - Console and network checks for JS errors and failed APIs.
5. Prioritize root-cause classification:
   - API returned no data.
   - Auth state missing or expired.
   - Frontend render condition not satisfied.

## Interaction strategy

1. Prefer `snapshot` to locate reliable element references before `click/type/press`.
2. Reproduce with minimal steps first, then add interactions incrementally.
3. Wait for page stability after each key action before collecting evidence.
4. Separate conclusions into three parts: symptom, evidence, likely root cause.

## Output expectation

When reporting debugging results, provide:

1. Repro steps.
2. Evidence summary (snapshot/screenshot/console/network).
3. Root-cause hypothesis with confidence.
4. Next fix candidate and verification plan.
