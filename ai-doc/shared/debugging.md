# Debugging Guidance

Last verified: 2026-07-11

## Permission boundary

1. A request to inspect, diagnose, or explain a problem authorizes read-only investigation, not a code fix.
2. A request to fix, resolve, or repair a problem authorizes the required project code change.
3. Run post-fix tests only when the user asks for testing or verification; otherwise report that testing was not run.

## Diagnosis flow

1. Restate the observed behavior and the expected behavior that is already known.
2. Reproduce through the smallest available path, or inspect the closest code/log path when runtime reproduction is unavailable.
3. Classify the likely owning layer: route/handler, auth/account, storage/config, frontend/backend contract, shared library, or domain behavior.
4. Form one or more hypotheses and validate them with code tracing, logs, breakpoints, targeted requests, or minimal fixtures.
5. Do not ask the user to confirm a technical hypothesis before collecting evidence. Ask only for missing business expectations, reproduction data, credentials, or a choice with materially different outcomes.
6. If the root cause and fix are small and certain, apply the authorized fix using `$platform-dev` rules. For a non-trivial fix, complete diagnosis first and then use `$platform-dev` with its architecture gates.
7. If testing is requested, use `$platform-test` after the fix.

## Evidence locations

- Backend runtime and startup guidance: `backend/testing.md`
- Backend logs and tracing surfaces: `backend/observability.md`
- Frontend route/auth/request conventions: `frontend/architecture.md`
- Domain-specific checks: the matched domain testing and UI locator documents

Environment-specific sandbox or workstation failures are observations, not permanent defaults. Confirm the current environment before changing code around them.
