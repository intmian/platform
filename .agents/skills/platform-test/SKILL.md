---
name: platform-test
description: Select and run proportionate tests for the Platform repository. Use when the user asks to test, verify, regress, integrate frontend and backend, exercise UI behavior, run checks, or start a local environment for inspection after a change or against existing behavior.
---

# Platform Testing

1. Locate the repository root and read `ai-doc/shared/testing.md` first.
2. Read the requested behavior and current diff, then load only the matched backend or domain testing document from `ai-doc/README.md`.
3. Choose the smallest sufficient level: unit/package test, frontend component test with mock data, local rendered/browser flow, or explicit frontend/backend integration.
4. Do not treat unit tests as proof of visual layout or full browser behavior.
5. For shared code, test the changed consumer and one simple adjacent consumer when relevant.
6. You may add or update test files and fixtures, but do not silently modify production logic to make tests pass. Use `$platform-debug` or `$platform-dev` only when a production fix is requested.
7. When the user asks only to start services for self-inspection, confirm reachability and return URLs without performing acceptance testing.
8. Keep local test traffic on the configured localhost path unless external access is explicitly authorized, and clean up persistent test data when safe.
