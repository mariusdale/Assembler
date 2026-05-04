# CLAUDE.md

This file helps Claude Code agents orient quickly when working in this repository.

## Repo At A Glance

Assembler is a pnpm + Turbo monorepo using ESM and strict TypeScript.

```text
apps/cli/            Commander commands and Ink terminal UI
packages/types/      Shared contracts for scans, run plans, tasks, providers, events, and credentials
packages/core/       Project scanner, planner, executor, and SQLite state store
packages/providers/  Provider packs and API clients
tests/fixtures/      Framework-scoped sample apps for integration tests
docs/                Product, architecture, release, and support documentation
```

The current public beta path is Next.js, Astro, or static sites deployed through Vercel. Cloudflare Pages is available when users explicitly select it for static/edge deploy intents. The roadmap expands this through more framework strategies, configuration, and operational surfaces.

## Core Abstractions

- `ProviderPack` in `packages/types/src/index.ts`: provider lifecycle hooks for preflight, discover, plan, apply, verify, and rollback.
- `FrameworkStrategy` in `packages/core/src/planner/framework-strategy.ts`: per-framework planning that keeps framework-specific work out of `rule-engine.ts`.
- `DeploymentTarget` in `packages/types/src/index.ts`: per-target deployment planning so frameworks can deploy to Vercel, Cloudflare Pages, Netlify, Docker targets, and more.

## Critical Files

- `packages/types/src/index.ts`: public contracts shared by CLI, core, and providers.
- `packages/core/src/planner/project-scanner.ts`: scans package metadata, files, env examples, git remotes, and provider signals.
- `packages/core/src/planner/rule-engine.ts`: builds the current task DAG from a `ProjectScan`.
- `packages/core/src/executor/runtime.ts`: executes tasks, checkpoints status, handles retries, and routes provider actions.
- `apps/cli/src/cli.ts`: Commander command surface.
- `apps/cli/src/app.ts`: non-TUI command implementation.

## Local Workflow

```bash
corepack enable pnpm
pnpm install
pnpm lint
pnpm typecheck
pnpm build
pnpm test
pnpm --filter @mariusdale/assembler dev
```

Run the bundled local CLI with:

```bash
./bin/assembler --help
```

## Where To Add Things

- New provider: add `packages/providers/src/<name>/`, register it in `packages/providers/src/index.ts`, and add provider tests under `packages/providers/tests/`.
- New framework: add `packages/core/src/planner/strategies/<name>.ts`, then register it in the default framework registry.
- New deployment target: add an adapter under the owning provider package, then register it in the default target registry.
- New fixture: add it under `tests/fixtures/<framework>/<sample-name>/`.

## Testing Conventions

Tests use Vitest and live beside each package as `*.test.ts`. Provider HTTP behavior is mocked through the shared HTTP patterns in `packages/providers/src/shared/http.ts`. Integration fixtures live under `tests/fixtures/<framework>/`.

For planner changes, add tests that assert task IDs, dependencies, required providers, and meaningful task params. For provider changes, test idempotent reuse paths as well as create paths.

## Do Not Do This

- Do not add new `if (framework === 'x')` branches in `rule-engine.ts`; extend the framework strategy registry once M1 is in place.
- Do not hardcode deploy task sequences inside framework strategies; route deploy choices through the deployment target registry.
- Do not write `.assembler/state.db` outside the executor or state-store APIs.
- Do not add placeholder providers, examples, or docs for features that do not have an execution path.
- Do not commit `.env`, `.env.local`, `.assembler/`, provider tokens, or live connection strings.
