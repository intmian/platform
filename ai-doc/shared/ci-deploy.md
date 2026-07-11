# CI And Deployment

Last verified: 2026-07-11

## Current workflow

1. `.github/workflows/deploy.yml` runs on pushes to `master`.
2. It checks out submodules recursively, builds the Vite frontend with Node 18, builds `backend/main/main.go` with Go 1.22, packages both artifacts, and deploys over SCP/SSH.
3. When the pushed commit set contains `#ignoreDeploy`, the frontend build, backend build, and deploy jobs are skipped.
4. Local edits, staging, and local commits do not trigger this workflow; the push to `master` is the external trigger.

## Agent boundaries

1. Do not push or trigger deployment unless the user explicitly requests it.
2. Do not invoke workflow webhooks, production APIs, or production SSH as a substitute for the repository CI path without explicit authorization.
3. Localhost HTTP used for development and testing is allowed. Read-only public documentation access is allowed.
4. `backend/mian_go_lib` is part of the logical project scope but is an independent Git repository. Report its diff/commit separately and report the parent repository gitlink change.
5. Changes to repositories other than Platform and `backend/mian_go_lib` require explicit authorization.
