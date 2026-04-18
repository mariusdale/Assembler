# Assembler

Assembler is a CLI tool that provisions infrastructure and deploys existing projects.
It does NOT generate code. Users build their app, then run `assembler launch` from
their project directory to go live without touching any provider dashboards.

## Current milestone: Post-deploy health check (Milestone 12)

Milestones 1-11 are complete. The CLI has launch, setup, plan, teardown, env sync,
preview environments, custom domains, and eight live providers.

## Architecture

```
apps/cli/          CLI entry point (commander, ora, chalk)
packages/types/    Shared type contracts (ProjectScan, RunPlan, Task, ProviderPack, etc.)
packages/core/     Planner (rule engine, project scanner) and executor (DAG runtime, state store)
packages/providers/ Provider implementations (github, neon, stripe, vercel, clerk, cloudflare, sentry, resend) + placeholders
apps/web/          Placeholder — no web dashboard in scope
```

## Key flows

- `assembler launch` — scan → preflight → plan → confirm → execute → summary
- `assembler plan` — scan → preflight → plan display (dry run, no execution)
- `assembler teardown [runId]` — roll back all resources created by a launch run
- `assembler env pull [runId]` — pull env vars from Vercel into `.env.local`
- `assembler env push [runId]` — push local `.env.local`/`.env` to Vercel
- `assembler setup` — onboard new team member (find Vercel project, pull env vars)
- `assembler preview [branch]` — create per-branch preview env (Neon branch + Vercel deploy)
- `assembler preview-teardown [branch]` — tear down preview environment
- `assembler domain add <domain>` — configure custom domain (Cloudflare DNS + Vercel)
- `assembler init <prompt>` — old LLM/heuristic path (AppSpec-based, not used by launch)
- `assembler execute` / `resume` / `rollback` — operate on stored run plans

## Conventions

- **No code generation.** Assembler provisions infrastructure and deploys what exists.
- **Preflight before execution.** All provider credentials are validated before any resource-creating API call.
- **Every error needs a remediation hint.** Never surface raw HTTP errors.
- **Idempotent provider actions.** If a resource already exists, detect and continue.
- **Checkpoint after every task.** SQLite state store updates after every status change.
- Eight live providers: GitHub, Neon, Stripe, Vercel, Clerk, Cloudflare, Sentry, Resend. PostHog remains a placeholder.

## Provider credentials

Stored locally in `.assembler/state.db`. Added via `assembler creds add <provider> <token>`.
Vercel supports structured entries: `assembler creds add vercel token=<tok> teamId=<id>`.
Clerk supports structured entries: `assembler creds add clerk token=<secret-key> publishableKey=<pk_...>`.

## Known design decisions

- The old AppSpec/template path (`init`, `createRunPlan`) is kept but the `launch` flow never touches it.
- The scan-based path (`createRunPlanFromProjectScan`) is the active code path for `launch`.
- Neon schema migration was removed from the scan plan — Assembler doesn't run user code. Users run their own migrations post-deploy.
- Vercel's `wait-for-ready` uses its own `setTimeout`-based sleep, independent of the executor's retry sleep.

## Stripe provider design

- Stripe is detected when the scanner finds `stripe` in package.json or `STRIPE_*` env vars.
- The scan path generates a single `stripe-capture-keys` task (no product/price/webhook creation — that's user business logic).
- `capture-keys` validates the secret key against `/v1/account`, detects test vs live mode, and outputs `secretKey` + `mode`.
- Vercel env var sync picks up `STRIPE_SECRET_KEY` and `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` from the capture task outputs.

## Clerk provider design

- Clerk is detected when the scanner finds `@clerk/nextjs` in package.json or `CLERK_*` env vars.
- The scan path generates a single `clerk-capture-keys` task (same pattern as Stripe).
- `capture-keys` validates the secret key against `GET /v1/instances`, outputs `secretKey` + `publishableKey` + `mode`.
- Vercel env var sync picks up `CLERK_SECRET_KEY` and `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`.

## Sentry provider design

- Sentry is detected when the scanner finds `@sentry/nextjs` in deps, `SENTRY_DSN` in env vars, or `sentry.*.config.*` files.
- The scan path generates a single `sentry-capture-dsn` task (no project creation — Assembler reads existing Sentry projects).
- `capture-dsn` lists orgs → finds/matches project (prefers Next.js-related slugs) → reads DSN from project keys.
- Vercel env var sync picks up `SENTRY_DSN` from the capture task outputs.
- Token format: `sntrys_` prefix or 64-character hex string.

## Resend provider design

- Resend is detected when the scanner finds `resend` in deps or `RESEND_API_KEY` in env vars.
- The scan path generates a single `resend-capture-api-key` task (same capture-keys pattern).
- `capture-api-key` validates the API key against `GET /api-keys`, outputs `apiKey`.
- Vercel env var sync picks up `RESEND_API_KEY` from the capture task outputs.
- Key format: `re_` prefix.

## Cloudflare provider design

- Cloudflare is used for custom domain DNS management via `assembler domain add`.
- Actions: `lookup-zone` (find zone by domain), `create-dns-record` (CNAME → `cname.vercel-dns.com`), `verify-dns`.
- `domain add` is a standalone post-launch command that builds a mini task DAG and executes it.
- Vercel `add-domain` action registers the domain on the Vercel project; SSL is auto-provisioned.

## Preview environments design

- `assembler preview [branch]` creates an isolated environment per git branch.
- Creates a Neon branch (instant copy-on-write from production) with its own connection URI.
- Sets a preview-scoped `DATABASE_URL` env var on the Vercel project.
- Triggers a Vercel preview deployment for the branch.
- Preview records are stored in `previews` table in the SQLite state store.
- `assembler preview-teardown [branch]` deletes the Neon branch and marks the preview as torn down.
- If the production run has no Neon, the preview skips database branching and just deploys.

## Testing a live run

1. Create/use a Next.js project with a `.env.example` containing `DATABASE_URL=`
   (and optionally `STRIPE_SECRET_KEY=` / `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=`)
2. `assembler creds add github <github-pat-with-repo-scope>`
3. `assembler creds add neon <neon-account-api-key>`
4. `assembler creds add stripe <stripe-secret-key>` (only if project uses Stripe)
5. `assembler creds add sentry <sentry-auth-token>` (only if project uses Sentry)
6. `assembler creds add resend <resend-api-key>` (only if project uses Resend)
7. `assembler creds add vercel token=<vercel-token>`
8. `cd <project-dir> && assembler launch`
