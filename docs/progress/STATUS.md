# DevAssemble — Project Status

Last updated: 2026-03-28

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
| 5. Stripe provider + polish | **Next** | 2026-03-29 |

## What works

- **Project scanning**: Detects framework (Next.js, Remix, Astro, Node), providers
  from dependencies and config files, env var requirements from `.env.example`.
- **Rule engine**: Generates a topologically sorted task DAG from a `ProjectScan`.
  Handles both new repos and existing git remotes.
- **Preflight checks**: Validates GitHub token + repo scope, Neon API key + account
  level, Vercel token + GitHub integration. Reports all errors with remediation hints.
- **Executor**: DAG-walking runtime with retry, checkpoint/resume, and rollback.
  SQLite state store persists across runs.
- **GitHub provider**: Create/reuse repo, push project files via Contents API.
- **Neon provider**: Create project, create database, capture connection URL.
  Branch resolution fallback, owner name inference from connection string.
- **Vercel provider**: Create project, link to GitHub repo (with idempotent
  recreate), sync env vars, trigger deployment, poll for readiness.
- **CLI UX**: Scan summary, credential check, plan display, confirmation prompt,
  per-task execution display, completion summary box.

## What doesn't work yet

- **No schema migrations**: Removed from the scan plan. Users must run their own
  migrations post-deploy.
- **Old template path** (`init` command) still exists but is untested after the
  scan pivot changes. Not a priority.
- **No CI integration tests** against real providers. Only unit/mock tests exist.
- **No Stripe support**: Planned for Milestone 5.
- **No custom domain support**: Cloudflare DNS deferred to a future `devassemble domain` command.

## Known issues

1. GitHub Contents API is slow for large projects (one file per request). Need to
   switch to the Git Trees/Blobs API for repos with many files.
2. Vercel preview deployments return 401 due to Deployment Protection. Need to
   warn in completion summary or disable via API.
3. Neon eventual consistency: solved with `waitForProjectReady()` polling, but
   similar patterns may appear with other providers.

## Repository structure

```
apps/cli/                CLI entry point
apps/web/                Placeholder (no web dashboard)
packages/types/          Shared type contracts
packages/core/           Planner + executor
packages/providers/      GitHub, Neon, Vercel implementations
docs/                    Learnings and task specs
docs/progress/           Session logs and status tracking
test-fixtures/           Test projects for live validation
```
