# Assembler Open-Source Launch Plan

Status: active implementation plan for the public beta launch.

## Current Baseline

Assembler is a scan-driven CLI for existing apps. The working beta path now covers:

- Next.js deployment through Vercel
- Astro deployment through Vercel
- static site deployment through Vercel
- static/edge deployment through Cloudflare Pages when explicitly selected
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
- Static site planning lives in `packages/core/src/planner/strategies/static.ts`.
- `rule-engine.ts` owns shared provider setup and delegates framework-specific deploy work.

M2 - Deployment Target Abstraction: shipped.

- `DeployIntent`, `DeploymentTarget`, and `DeploymentTargetRegistry` are shared contracts.
- Framework strategies emit deploy intents instead of Vercel task sequences.
- Vercel is the default deployment target and receives the framework/build/output params from the intent.
- Cloudflare Pages is registered as an explicit target for static and edge intents.

M3 - Astro Support: shipped.

- Astro scans from `package.json` dependency evidence.
- Static Astro projects emit `static` deploy intents.
- Astro configs with `output: 'server'` emit `ssr-node` deploy intents.
- `tests/fixtures/astro/sample-app/` provides the first non-Next.js fixture.
- `docs/frameworks/astro.md` documents current scope.

M4 - Static Site Flow: shipped.

- `static` is part of `ProjectFramework`.
- No-build root `index.html` projects scan as static sites.
- Package-based static projects with `dist/`, `build/`, `_site/`, or `out/` output scan as static sites.
- `tests/fixtures/static/sample-site/` covers the no-build path.

M5 - Cloudflare Pages Target: shipped.

- `cloudflarePagesDeploymentTarget` handles explicit `static` and `ssr-edge` deploy intents.
- Cloudflare provider actions can create Pages projects, trigger deployments, and check deployment readiness.
- `assembler plan --target cloudflare-pages` and `assembler launch --target cloudflare-pages` pass target preference to planning.
- `docs/targets/cloudflare-pages.md` documents current scope.

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

4. Smoke test static and target selection:
   - no-build `index.html` site
   - package-based static site with `dist/index.html`
   - `assembler plan --target cloudflare-pages`

5. Publish launch framing:
   - README says Next.js, Astro, static sites, and explicit Cloudflare Pages targeting work today.
   - Roadmap says M1-M5 shipped and M6-M7 are next.
   - Public beta guide stays conservative about supported execution paths.

## Next Implementation Milestones

M6 - Project Config File.

- Add `assembler.config.{ts,js,json}`.
- Allow explicit framework, target, build command, output directory, provider enable/disable, and env metadata.
- Add `assembler init` and `assembler config show`.

M7 - Desktop Deployments Dashboard.

- Read local `.assembler/state.db` files.
- Show runs, task DAGs, logs, previews, and recovery actions.

## Good First Issues

- Write the JSON schema for `assembler.config.json`.
- Add config consistency checks to `assembler doctor`.
- Move CLI/TUI framework and provider labels into a shared labels module.
- Add docs for the deployment target registry extension pattern.
- Add smoke-test docs for `assembler plan --target cloudflare-pages`.
