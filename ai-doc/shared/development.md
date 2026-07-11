# Development Guidance

Last verified: 2026-07-11

## Principles

1. Fix behavior in its owning layer rather than masking it in a caller or presentation fallback.
2. Prefer one minimal coherent change over scattered compatibility patches or speculative abstractions.
3. Keep shared code generic: pass business policy through explicit inputs instead of embedding scene names, storage keys, or current-domain defaults.
4. Inspect existing patterns and preserve unrelated working-tree changes.

## Small and large changes

A change is large when it does any of the following:

- adds or removes a service or major module;
- changes a frontend/backend API contract;
- changes schema, migration, persistent data, permissions, or config contracts;
- changes ownership of a route, shared abstraction, or reusable component;
- changes CI or deployment behavior;
- materially spans three or more modules.

Everything else may be treated as a small change when its expected behavior and ownership are clear.

## Development flow

1. For a small change, inspect the owning code and implement it directly.
2. For a large change, first confirm the architecture boundary and owning layers with the user, then confirm the user flow, API/data behavior, and migration or compatibility approach before editing.
3. Skip repeated confirmation when the user has already made those decisions explicitly.
4. Investigate technical facts that can be learned from code, configuration, or logs. Ask the user only when an unresolved choice would materially change product behavior, architecture, data, or external state.
5. When the task also requests verification, hand off to `$platform-test` after implementation.
6. Without a test request, limit checks to inexpensive formatting, type, or compile checks when useful and state clearly what was not tested.
7. When the change creates or changes a stable reusable contract, use `$platform-knowledge` before finishing.
