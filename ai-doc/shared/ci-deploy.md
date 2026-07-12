# CI And Platform Deployment

Last verified: 2026-07-12

## Current workflow

1. `.github/workflows/deploy.yml` runs on pushes to `master`.
2. It checks out submodules recursively, builds the Vite frontend with Node 18, builds `backend/main/main.go` with Go 1.22, packages both artifacts, and deploys over SCP/SSH.
3. When the pushed commit set contains `#ignoreDeploy`, the frontend build, backend build, and deploy jobs are skipped.
4. Local edits, staging, and local commits do not trigger this workflow; the push to `master` is the external trigger.
5. The workflow builds but does not run test suites, perform a post-deploy health check, or roll back automatically.
6. The workflow requests Go 1.22, while `backend/go.mod` declares Go 1.23 and toolchain 1.23.9.
7. Deploy packages `release.tar.gz`, uploads it to the production server, then invokes the server-owned deployment script over SSH. Server paths and host details come from protected CI configuration and are not documented here.

For any production configuration, secret, schema, or data change, also follow `shared/production-operations.md`. For Cloudflare D1 Worker operations, load `backend/d1-worker-operations.md`.

## Runtime Knowledge Boundary

The server-side deployment script is not stored in this repository. Its current process stop/start, release switching, health check, and rollback behavior are `TODO-verify` before relying on them. A successful GitHub Actions job proves only that the script returned success; it does not prove that the expected backend/frontend revision is active or that business requests work.

This document does not claim a currently deployed commit. Confirm it from authorized production evidence at the start of each deployment task.

## Deployment Operation

Before the deployment-triggering push:

```bash
cd "$(git rev-parse --show-toplevel)"
git status --short
git diff --check
git log -1 --oneline
```

Complete task-specific tests/builds, record the intended commit, confirm production configuration and data-migration gates, and ensure no backup, credential, real endpoint, screenshot, or local environment file is included.

Normal deployment trigger, only after explicit authorization:

```bash
git push origin master
```

Operational rules:

1. A local edit, stage, or commit does not deploy; a normal push to `master` does.
2. A pushed commit set containing `#ignoreDeploy` skips all three jobs; use it only when intentionally separating code publication from deployment.
3. `git push --force-with-lease` is not a normal deployment command. Use it only for an explicitly approved history repair after explaining which remote commits will be replaced and that it also triggers deployment unless skipped.
4. Watch the GitHub Actions run in the GitHub UI. Record its URL and require `Build Frontend`, `Build Backend`, and `Deploy` to succeed.
5. Verify deployed backend/frontend revisions, process health, dependent infrastructure authentication, and business behavior after CI.
6. During an incompatible stopped-service migration, keep old writers stopped through migration verify, deployment, startup, and smoke checks.
7. If deployment fails after the data representation changed, repair deployment while stopped or restore data before restarting an incompatible old release.

The operation ledger must distinguish:

- local commit created;
- push performed;
- CI jobs completed;
- server script completed;
- process started;
- expected frontend revision active;
- business smoke passed.

## Agent boundaries

1. Do not push or trigger deployment unless the user explicitly requests it.
2. Do not invoke workflow webhooks, production APIs, or production SSH as a substitute for the repository CI path without explicit authorization.
3. Localhost HTTP used for development and testing is allowed. Read-only public documentation access is allowed.
4. `backend/mian_go_lib` is part of the logical project scope but is an independent Git repository. Report its diff/commit separately and report the parent repository gitlink change.
5. Changes to repositories other than Platform and `backend/mian_go_lib` require explicit authorization.
