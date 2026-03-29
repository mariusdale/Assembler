# DevAssemble — Project Status

Last updated: 2026-03-29

## Overview

DevAssemble is a CLI tool that scans an existing project directory, provisions
infrastructure (GitHub repo, Neon database, Vercel hosting), and deploys the
user's code — all without the user touching any provider dashboard.

## Milestone history

| Milestone | Status | Date |
|-----------|--------|------|
| 1. Skeleton (workspace, types, CI) | Complete | 2026-03-26 |
| 2. Live providers (GitHub, Neon, Vercel) | Complete | 2026-03-27 |
| 3. Scan pivot, preflights, launch UX | Complete | 2026-03-28 |
| 4. End-to-end demo validation | Complete | 2026-03-28 |
| 5. Stripe provider + polish | Complete | 2026-03-29 |
| 6. Teardown, plan, Deployment Protection | Complete | 2026-03-29 |
| 7. Env sync (`env pull` / `env push`) | Complete | 2026-03-29 |
| 8. Team onboarding (`devassemble setup`) | Complete | 2026-03-29 |
| 9. Preview environments (`devassemble preview`) | **Next** | — |

## What works

- **Project scanning**: Detects framework (Next.js, Remix, Astro, Node), providers
  from dependencies and config files, env var requirements from `.env.example`.
- **Rule engine**: Generates a topologically sorted task DAG from a `ProjectScan`.
  Handles both new repos and existing git remotes.
- **Preflight checks**: Validates GitHub token + repo scope, Neon API key + account
  level, Stripe secret key format + API validation, Vercel token + GitHub integration.
  Reports all errors with remediation hints.
- **Executor**: DAG-walking runtime with retry, checkpoint/resume, and rollback.
  SQLite state store persists across runs.
- **GitHub provider**: Create/reuse repo, push project files via Contents API.
- **Neon provider**: Create project, create database, capture connection URL.
  Branch resolution fallback, owner name inference from connection string.
- **Vercel provider**: Create project, link to GitHub repo (with idempotent
  recreate), sync env vars, trigger deployment, poll for readiness.
- **Stripe provider**: Validates secret key format and API, detects test/live mode,
  captures keys for Vercel env var sync.
- **CLI UX**: Scan summary, credential check, plan display, confirmation prompt,
  per-task execution display, completion summary box with Deployment Protection warning.
- **`devassemble plan`**: Dry-run command — scan, preflight, and plan without executing.
- **`devassemble teardown`**: Destroys all resources created by a launch run with
  confirmation and per-resource progress display.
- **`devassemble env pull`**: Pulls env vars from Vercel into `.env.local`.
- **`devassemble env push`**: Pushes local `.env.local`/`.env` vars to Vercel.
- **`devassemble setup`**: Onboards new team members — auto-discovers Vercel project
  from git remote, pulls env vars to `.env.local`.

## What doesn't work yet

- **No schema migrations**: Removed from the scan plan. Users must run their own
  migrations post-deploy.
- **Old template path** (`init` command) still exists but is untested after the
  scan pivot changes. Not a priority.
- **No CI integration tests** against real providers. Only unit/mock tests exist.
- **Stripe capture-keys only**: Validates key and syncs to Vercel. No product/price/webhook
  creation (by design — that's user business logic).
- **No custom domain support**: Cloudflare DNS deferred to a future `devassemble domain` command.

## Known issues

1. GitHub Contents API is slow for large projects (one file per request). Need to
   switch to the Git Trees/Blobs API for repos with many files.
2. Vercel preview deployments return 401 due to Deployment Protection. Warning
   now shown in completion summary; disabling via API is a future improvement.
3. Neon eventual consistency: solved with `waitForProjectReady()` polling, but
   similar patterns may appear with other providers.

## Repository structure

```
apps/cli/                CLI entry point
apps/web/                Placeholder (no web dashboard)
packages/types/          Shared type contracts
packages/core/           Planner + executor
packages/providers/      GitHub, Neon, Stripe, Vercel implementations
docs/                    Learnings and task specs
docs/progress/           Session logs and status tracking
test-fixtures/           Test projects for live validation
```
