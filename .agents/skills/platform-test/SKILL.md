---
name: platform-test
description: Select and run proportionate tests for the Platform repository. Use when the user asks to test, verify, regress, integrate frontend and backend, exercise UI behavior, run checks, or start a local environment for inspection after a change or against existing behavior.
---

# Platform Testing

1. Locate the repository root and read `ai-doc/shared/testing.md` first.
2. Read the requested behavior and current diff, then load only the matched backend or domain testing document from `ai-doc/README.md`.
3. Choose the smallest sufficient level: unit/package test, frontend component test with mock data, local rendered/browser flow, or explicit frontend/backend integration.
4. For local frontend rendering, visual inspection, responsive checks, or browser interaction, use the Codex in-app Browser through `browser:control-in-app-browser` as the default browser surface. Keep it in the background unless the user asks to see or try the page. Use standalone Playwright only when the user explicitly requests it, a formal Playwright artifact/spec is required, or the in-app Browser remains unavailable after its documented recovery flow.
5. For a small, isolated, frontend-only presentation or interaction component, default to a minimal independent example in the existing `frontend/src/debug/debug.jsx` harness. Reuse the changed production component, avoid login and formal business data, expose only the state and controls needed to inspect the target interaction, and do not add a new production route.
6. For complex frontend logic, cross-component state, route/module context, or a scenario requiring realistic verification, start or reuse Vite and exercise the feature in its actual module page instead of reducing it to an independent debug example, even when no backend is required.
7. Choose the data boundary deliberately: mock the backend when its contract is outside the change and deterministic fixtures cover the behavior; start the local real backend when auth, request/response contracts, persistence, timing, server-derived state, or end-to-end integration matters. Prefer mocks or local test configuration when a real backend would pollute formal data, and report which boundary was used.
8. Build the frontend, confirm the target route is reachable, then exercise it in the in-app Browser when browser evidence is part of the requested verification.
9. Do not treat unit tests as proof of visual layout or full browser behavior.
10. For shared code, test the changed consumer and one simple adjacent consumer when relevant.
11. You may add or update test files and debug fixtures, but do not silently modify production logic to make tests pass. Use `$platform-debug` or `$platform-dev` only when a production fix is requested.
12. When the user asks only to start services for self-inspection, confirm reachability and return URLs without performing acceptance testing.
13. Keep local test traffic on the configured localhost path unless external access is explicitly authorized, and clean up persistent test data when safe.
