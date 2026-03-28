# DevAssemble

DevAssemble is a CLI tool that provisions infrastructure and deploys existing projects.
It does NOT generate code. Users build their app, then run `devassemble launch` from
their project directory to go live without touching any provider dashboards.

## Current milestone: Demo-ready (Milestone 2)

Milestone 1 (skeleton, workspace, types, CI) is complete.
We are now finishing Milestone 2: a working end-to-end launch flow for the three
core providers (GitHub, Neon, Vercel).

## Architecture

```
apps/cli/          CLI entry point (commander, ora, chalk)
packages/types/    Shared type contracts (ProjectScan, RunPlan, Task, ProviderPack, etc.)
packages/core/     Planner (rule engine, project scanner) and executor (DAG runtime, state store)
packages/providers/ Provider implementations (github, neon, vercel) + placeholders for future ones
apps/web/          Placeholder — no web dashboard in scope
```

## Key flows

- `devassemble launch` — scan → preflight → plan → confirm → execute → summary
- `devassemble init <prompt>` — old LLM/heuristic path (AppSpec-based, not used by launch)
- `devassemble execute` / `resume` / `rollback` — operate on stored run plans

## Conventions

- **No code generation.** DevAssemble provisions infrastructure and deploys what exists.
- **Preflight before execution.** All provider credentials are validated before any resource-creating API call.
- **Every error needs a remediation hint.** Never surface raw HTTP errors.
- **Idempotent provider actions.** If a resource already exists, detect and continue.
- **Checkpoint after every task.** SQLite state store updates after every status change.
- Three providers only: GitHub, Neon, Vercel. No scope expansion.

## Provider credentials

Stored locally in `.devassemble/state.db`. Added via `devassemble creds add <provider> <token>`.
Vercel supports structured entries: `devassemble creds add vercel token=<tok> teamId=<id>`.

## Known design decisions

- The old AppSpec/template path (`init`, `createRunPlan`) is kept but the `launch` flow never touches it.
- The scan-based path (`createRunPlanFromProjectScan`) is the active code path for `launch`.
- Neon schema migration was removed from the scan plan — DevAssemble doesn't run user code. Users run their own migrations post-deploy.
- Vercel's `wait-for-ready` uses its own `setTimeout`-based sleep, independent of the executor's retry sleep.

## Testing a live run

1. Create/use a Next.js project with a `.env.example` containing `DATABASE_URL=`
2. `devassemble creds add github <github-pat-with-repo-scope>`
3. `devassemble creds add neon <neon-account-api-key>`
4. `devassemble creds add vercel token=<vercel-token>`
5. `cd <project-dir> && devassemble launch`
