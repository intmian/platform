---
name: platform-dev
description: Implement features, refactors, and authorized code fixes in the Platform repository. Use for requests to develop, add, change, refactor, implement, or repair project code; combine with platform-debug for investigated bugs, platform-test when verification is requested, and platform-knowledge when stable contracts change.
---

# Platform Development

1. Locate the repository root, read `ai-doc/shared/development.md` first, then load only the relevant system and domain documents through `ai-doc/README.md`.
2. Classify the work as small or large using the documented triggers.
3. Implement a small, well-owned change directly.
4. For a large change, confirm architecture ownership first and concrete user/API/data flow second. Skip confirmation already supplied by the user.
5. Discover technical facts from code, configuration, and logs. Ask only about unresolved choices that materially change product behavior, architecture, data, or external state.
6. Preserve unrelated working-tree changes and keep shared abstractions generic.
7. If testing or verification is requested, use `$platform-test` after implementation. Otherwise run only inexpensive static or compile checks when useful and report what was not tested.
8. If a stable reusable contract changes, use `$platform-knowledge` before finishing.
