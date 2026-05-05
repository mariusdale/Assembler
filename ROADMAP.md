# Roadmap

Assembler is launching as a focused public beta: Next.js, Astro, and static sites deploy through Vercel today, with Cloudflare Pages available for explicit static/edge targets. The next work is about making configuration and operations broader without regressing the working path.

Two principles guide the roadmap:

- Never regress the working Next.js + Vercel + Neon path.
- Introduce extension points as refactors before adding new behavior.

## M1 - Framework Strategy Registry

Replace the `if (framework === 'nextjs')` block in `packages/core/src/planner/rule-engine.ts` with a `FrameworkStrategy` registry. Re-implement Next.js as the first strategy with no behavior change.

Deliverables:

- `packages/core/src/planner/framework-strategy.ts`
- `packages/core/src/planner/strategies/nextjs.ts`
- registry-driven planning in `rule-engine.ts`
- tests proving Next.js plan parity

Status: shipped. Scope: medium.

## M2 - Deployment Target Abstraction

Decouple Vercel from being the only deployment target. Framework strategies should emit generic deploy intents, and registered targets should decide whether they can satisfy them.

Deliverables:

- `DeployIntent`, `DeploymentTarget`, and `DeploymentTargetRegistry` types
- deployment target registry in `packages/core`
- Vercel target adapter
- tests for capability matching and explicit preference

Status: shipped. Scope: medium-large. Depends on M1.

## M3 - Astro Support

Add the first non-Next.js framework strategy. Astro is the first target because it covers both static and SSR modes and is already part of the `ProjectFramework` union.

Deliverables:

- `packages/core/src/planner/strategies/astro.ts`
- Astro config detection
- generalized Clerk and Stripe detection
- `tests/fixtures/astro/sample-app/`
- `docs/frameworks/astro.md`

Status: shipped. Scope: large. Depends on M1 and M2.

## M4 - Static Site Flow

Support any project that produces a static output directory such as `dist/`, `build/`, `_site/`, or `out/`. Include no-build projects that only have an `index.html`.

Deliverables:

- static framework strategy
- `static` project framework type
- `tests/fixtures/static/sample-site/`
- tests for package-based and no-build static sites

Status: shipped. Scope: medium. Depends on M1 and M2.

## M5 - Cloudflare Pages Target

Prove the deployment target abstraction with a second real target. Cloudflare Pages is the first target because the Cloudflare provider already exists and Pages is a meaningful Vercel alternative for static and edge workloads.

Deliverables:

- Cloudflare Pages client and provider actions
- `cloudflarePagesTarget`
- static deploy and build-from-git support
- `docs/targets/cloudflare-pages.md`

Status: shipped. Scope: large. Depends on M2.

## M6 - Project Config File

Add `assembler.config.{ts,js,json}` so users can override heuristics with explicit framework, target, build, output, env, provider, and hook settings.

Deliverables:

- project config loader
- JSON schema
- scan overrides
- `assembler init`
- `docs/configuration.md`

Status: planned. Scope: large. Depends on M1 and M2.

## M7 - Desktop Deployments Dashboard

Add a read-only cross-project dashboard that reads existing `.assembler/state.db` files and shows deployments, run timelines, task DAGs, and previews.

Deliverables:

- `apps/desktop/`
- `packages/state-reader/`
- project registry at `~/.assembler/registry.json`
- release workflow for desktop builds

Status: planned. Scope: extra-large.

## Later Candidates

- M8: GitHub Actions templates through `assembler init --ci`
- M9: plugin system for external `ProviderPack` packages
- M10: multi-language apps through Docker strategies and Docker-capable targets
- M11: hosted or self-hosted web dashboard
- M12: optional team state sync

## Good First Issues To Seed

- Write the JSON schema for `assembler.config.json`.
- Add `assembler doctor` checks for config schema and framework consistency.
- Move CLI provider and framework labels into a dedicated labels module.
- Add `assembler config show`.
- Add smoke-test docs for `assembler plan --target cloudflare-pages`.
