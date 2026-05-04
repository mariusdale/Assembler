# Assembler Open-Source Launch Plan

Status: active implementation plan for the public beta launch.

## Current Baseline

Assembler is a scan-driven CLI for existing apps. The working beta path now covers:

- Next.js deployment through Vercel
- Astro deployment through Vercel
- GitHub repository creation or reuse
- Neon database provisioning
- optional Clerk, Stripe, Sentry, Resend, and Cloudflare DNS provider flows
- resumable task DAG execution with local SQLite state

The repo is organized for public contributors: issue templates, PR template, `CLAUDE.md`, roadmap, docs index, release workflow, and framework-scoped fixtures are in place.

## Shipped Milestones

M1 - Framework Strategy Registry: shipped.

- `FrameworkStrategy` lives in `packages/core/src/planner/framework-strategy.ts`.
- Next.js planning lives in `packages/core/src/planner/strategies/nextjs.ts`.
- Astro planning lives in `packages/core/src/planner/strategies/astro.ts`.
- `rule-engine.ts` owns shared provider setup and delegates framework-specific deploy work.

M2 - Deployment Target Abstraction: shipped.

- `DeployIntent`, `DeploymentTarget`, and `DeploymentTargetRegistry` are shared contracts.
- Framework strategies emit deploy intents instead of Vercel task sequences.
- Vercel is the default deployment target and receives the framework/build/output params from the intent.

M3 - Astro Support: shipped.

- Astro scans from `package.json` dependency evidence.
- Static Astro projects emit `static` deploy intents.
- Astro configs with `output: 'server'` emit `ssr-node` deploy intents.
- `tests/fixtures/astro/sample-app/` provides the first non-Next.js fixture.
- `docs/frameworks/astro.md` documents current scope.

## Remaining Launch Work

1. Run full verification before publishing:
   - `pnpm lint`
   - `pnpm typecheck`
   - `pnpm build`
   - `pnpm test`

2. Smoke test the primary CLI flows on a throwaway Next.js app:
   - `assembler plan`
   - `assembler launch`
   - `assembler status`
   - `assembler resume` after a forced retryable failure
   - `assembler teardown`

3. Smoke test Astro plan creation:
   - static Astro project
   - Astro project with `output: 'server'`
   - env detection for `DATABASE_URL`

4. Publish launch framing:
   - README says Next.js and Astro work today.
   - Roadmap says M1-M3 shipped and M4-M7 are next.
   - Public beta guide stays conservative about supported execution paths.

## Next Implementation Milestones

M4 - Static Site Flow.

- Add `static` to `ProjectFramework`.
- Add a static strategy for no-build `index.html` projects and package-based builds that output `dist`, `build`, `_site`, or `out`.
- Add `tests/fixtures/static/sample-site/`.

M5 - Cloudflare Pages Target.

- Add Cloudflare Pages provider actions.
- Add `cloudflarePagesTarget`.
- Route `static` and `ssr-edge` intents to Cloudflare Pages when explicitly selected.

M6 - Project Config File.

- Add `assembler.config.{ts,js,json}`.
- Allow explicit framework, target, build command, output directory, provider enable/disable, and env metadata.
- Add `assembler init` and `assembler config show`.

M7 - Desktop Deployments Dashboard.

- Read local `.assembler/state.db` files.
- Show runs, task DAGs, logs, previews, and recovery actions.

## Good First Issues

- Add `--target` parsing to `assembler plan` and `assembler launch`, wired to `deploymentTargetPreference`.
- Write the JSON schema for `assembler.config.json`.
- Add config consistency checks to `assembler doctor`.
- Move CLI/TUI framework and provider labels into a shared labels module.
- Add a no-build static site fixture.
- Add docs for the deployment target registry extension pattern.
