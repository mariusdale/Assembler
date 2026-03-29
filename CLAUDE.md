# DevAssemble

DevAssemble is a CLI tool that provisions infrastructure and deploys existing projects.
It does NOT generate code. Users build their app, then run `devassemble launch` from
their project directory to go live without touching any provider dashboards.

## Current milestone: Provider expansion (Milestone 5)

Milestones 1-4 are complete (skeleton, live providers, scan pivot, e2e validation).
Milestone 5 adds Stripe as the fourth live provider and expands credential handling.

## Architecture

```
apps/cli/          CLI entry point (commander, ora, chalk)
packages/types/    Shared type contracts (ProjectScan, RunPlan, Task, ProviderPack, etc.)
packages/core/     Planner (rule engine, project scanner) and executor (DAG runtime, state store)
packages/providers/ Provider implementations (github, neon, stripe, vercel) + placeholders
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
- Four live providers: GitHub, Neon, Stripe, Vercel. Others remain placeholders.

## Provider credentials

Stored locally in `.devassemble/state.db`. Added via `devassemble creds add <provider> <token>`.
Vercel supports structured entries: `devassemble creds add vercel token=<tok> teamId=<id>`.

## Known design decisions

- The old AppSpec/template path (`init`, `createRunPlan`) is kept but the `launch` flow never touches it.
- The scan-based path (`createRunPlanFromProjectScan`) is the active code path for `launch`.
- Neon schema migration was removed from the scan plan — DevAssemble doesn't run user code. Users run their own migrations post-deploy.
- Vercel's `wait-for-ready` uses its own `setTimeout`-based sleep, independent of the executor's retry sleep.

## Stripe provider design

- Stripe is detected when the scanner finds `stripe` in package.json or `STRIPE_*` env vars.
- The scan path generates a single `stripe-capture-keys` task (no product/price/webhook creation — that's user business logic).
- `capture-keys` validates the secret key against `/v1/account`, detects test vs live mode, and outputs `secretKey` + `mode`.
- Vercel env var sync picks up `STRIPE_SECRET_KEY` and `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` from the capture task outputs.

## Testing a live run

1. Create/use a Next.js project with a `.env.example` containing `DATABASE_URL=`
   (and optionally `STRIPE_SECRET_KEY=` / `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=`)
2. `devassemble creds add github <github-pat-with-repo-scope>`
3. `devassemble creds add neon <neon-account-api-key>`
4. `devassemble creds add stripe <stripe-secret-key>` (only if project uses Stripe)
5. `devassemble creds add vercel token=<vercel-token>`
6. `cd <project-dir> && devassemble launch`
