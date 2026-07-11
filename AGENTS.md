# Platform Agent Rules

## Scope and sources

- This repository contains the Platform application and the `backend/mian_go_lib` Git submodule. The submodule is in project scope, but it has an independent Git history and must be reported separately when changed.
- Use `ai-doc/README.md` as the index for stable architecture and domain knowledge.
- Resolve conflicts in this order: current code and runtime behavior, `ai-doc`, module README files, then `plan/` and `docs/plan/` historical or future-looking material.

## Skill routing

- Use `$platform-dev` for feature work, refactors, and authorized code fixes.
- Use `$platform-debug` for bug investigation, reproduction, root-cause analysis, and requested fixes.
- Use `$platform-test` only when the user asks for testing, verification, regression, integration, or a local environment to inspect.
- Use `$platform-knowledge` for locating, explaining, refreshing, or writing project documentation. Also use it when a code change creates or changes a reusable contract.
- Compose skills when needed: debug then dev for a non-trivial fix, test after a requested implementation, and knowledge after a stable contract change.

## Always-on boundaries

- Preserve unrelated user changes in the working tree.
- Do not push, trigger deployment, call external state-changing HTTP endpoints or webhooks, use production APIs, or SSH to production unless the user explicitly asks. Localhost HTTP and read-only public documentation access are allowed.
- A push to `master` triggers the repository deployment workflow unless the pushed commit set contains `#ignoreDeploy`; see `ai-doc/shared/ci-deploy.md`.
- Do not modify code in another repository unless explicitly authorized. `backend/mian_go_lib` is the declared exception because it is part of this project's logical scope.

## Tech stack

- Frontend: Vite + React (`frontend/`)
- Backend: Go + Gin, entry `backend/main/main.go`
