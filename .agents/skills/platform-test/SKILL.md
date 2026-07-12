---
name: platform-test
description: Select and run proportionate tests for the Platform repository. Use when the user asks to test, verify, regress, integrate frontend and backend, exercise UI behavior, run checks, or start a local environment for inspection after a change or against existing behavior.
---

# Platform Testing

1. Locate the repository root and read `ai-doc/shared/testing.md` first.
2. Read the requested behavior and current diff, then load only the matched backend or domain testing document from `ai-doc/README.md`.
3. Choose the smallest sufficient level: unit/package test, frontend component test with mock data, local rendered/browser flow, or explicit frontend/backend integration.
4. For a small, isolated, frontend-only presentation or interaction component, default to a minimal independent example in the existing `frontend/src/debug/debug.jsx` harness. Reuse the changed production component, avoid login and formal business data, expose only the state and controls needed to inspect the target interaction, and do not add a new production route.
5. For complex frontend logic, cross-component state, route/module context, or a scenario requiring realistic verification, start or reuse Vite and exercise the feature in its actual module page instead of reducing it to an independent debug example, even when no backend is required.
6. Choose the data boundary deliberately: mock the backend when its contract is outside the change and deterministic fixtures cover the behavior; start the local real backend when auth, request/response contracts, persistence, timing, server-derived state, or end-to-end integration matters. Prefer mocks or local test configuration when a real backend would pollute formal data, and report which boundary was used.
7. Build the frontend, confirm the target route is reachable, and show it in the in-app browser when the user asks to see or try the result.
8. Do not treat unit tests as proof of visual layout or full browser behavior.
9. For shared code, test the changed consumer and one simple adjacent consumer when relevant.
10. You may add or update test files and debug fixtures, but do not silently modify production logic to make tests pass. Use `$platform-debug` or `$platform-dev` only when a production fix is requested.
11. When the user asks only to start services for self-inspection, confirm reachability and return URLs without performing acceptance testing.
12. Keep local test traffic on the configured localhost path unless external access is explicitly authorized, and clean up persistent test data when safe.
