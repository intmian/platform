---
name: platform-debug
description: Diagnose and resolve defects in the Platform repository. Use when behavior is broken, inconsistent, failing, slow, or unexplained; for requests to reproduce issues, inspect logs, trace frontend/backend paths, use breakpoints, identify root cause, or fix a confirmed bug.
---

# Platform Debugging

1. Locate the repository root, read `ai-doc/shared/debugging.md` first, then load only the relevant architecture, observability, backend testing, and domain documents.
2. Distinguish diagnosis-only requests from requests that authorize a fix.
3. Reproduce or inspect the smallest failing path, classify the owning layer, form hypotheses, and validate them with code tracing, logs, breakpoints, targeted requests, or minimal fixtures.
4. Do not ask the user to confirm a technical guess before collecting evidence. Ask only for missing expectations, reproduction inputs, credentials, or choices with materially different outcomes.
5. For an authorized small and certain fix, use `$platform-dev` rules and change it directly. For a non-trivial fix, finish root-cause analysis before entering the development architecture gates.
6. Use `$platform-test` only when the user requests testing or verification. Otherwise state that post-fix testing was not run.
7. Do not turn workstation or sandbox symptoms into permanent code workarounds without verifying the current environment.
