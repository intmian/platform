# Testing Guidance

Last verified: 2026-07-13

## Scope selection

Choose the smallest test that can answer the user's question:

1. Backend logic, service behavior, transformations, and pure utilities: targeted unit or package tests.
2. Frontend pure logic, hooks, and component interactions: unit or component tests with focused mock data.
3. Layout, visual state, routing, browser APIs, and real interaction behavior: a local rendered fixture or browser flow.
4. Frontend/backend contracts: start and integrate both services only when the user asks for integration testing or the requested test explicitly requires the real contract.
5. Shared components or utilities: test the changed consumer and perform a simple regression on at least one other relevant consumer.

Unit tests do not by themselves prove visual layout or full browser behavior.

## Execution rules

1. Read the user's requested scope and the current diff before selecting tests.
2. Load only the matched backend or domain testing document from `../README.md`.
3. Use the Codex in-app Browser as the default surface for local frontend rendering, responsive inspection, and browser interaction. Keep it in the background unless the user asks to see the page. Use standalone Playwright only by explicit request, for a required formal Playwright artifact/spec, or when the in-app Browser remains unavailable after its recovery flow.
4. Prefer an existing component harness or development-only debug page. Do not add a permanent production route solely for testing; clean up temporary fixtures after use.
5. The test workflow may add or update test files and fixtures, but must not silently change production behavior to make a test pass. Report the defect or use `$platform-debug`/`$platform-dev` when a production fix is requested.
6. Record persistent test data created or changed and clean it up when safe.
7. For local HTTP checks, use the configured localhost development path. Do not call production or other external state-changing endpoints without explicit authorization.

## Environment-only requests

When the user asks only to start the environment for their own inspection:

1. Start or reuse the requested services.
2. Confirm the processes are reachable at a health or page level.
3. Return the URLs and relevant startup notes.
4. Do not perform feature acceptance testing unless separately requested.
