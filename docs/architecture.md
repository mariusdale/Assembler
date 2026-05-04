# Architecture

Assembler is a scan-driven deployment CLI. Users bring an existing app, then Assembler plans and executes provider tasks needed to launch it. The stable public beta path is Next.js or Astro deployed through Vercel; the roadmap expands this through more framework strategies and deployment targets.

## Packages

```text
apps/cli/            Commander commands and Ink terminal UI
packages/types/      Shared contracts for scans, run plans, tasks, providers, events, and credentials
packages/core/       Project scanner, planner, executor, SQLite-backed state store
packages/providers/  Provider packs and API clients
tests/fixtures/      Framework-scoped sample apps used by integration tests
```

## Launch Flow

```text
scan project
  -> validate project readiness
  -> build run plan from ProjectScan
  -> preflight required provider credentials
  -> execute task DAG
  -> checkpoint state after every task status change
  -> summarize deployment and recovery options
```

The active planner entry point is `createRunPlanFromProjectScan`. It uses evidence from `package.json`, env example files, framework files, and git metadata. There is no prompt-to-app or template-generation path.

Framework-specific planning lives in `FrameworkStrategy` modules under `packages/core/src/planner/strategies/`. Strategies emit deployment intents, and the deployment target registry selects a compatible target such as Vercel. Shared provider setup remains in `rule-engine.ts`.

## Provider Model

Each provider exports a `ProviderPack`:

- `preflight` validates credentials before resource creation.
- `discover` returns account metadata for credential UX.
- `plan` describes task templates when needed.
- `apply` performs the provider action.
- `verify` checks the resource after creation or update.
- `rollback` removes or reverses resources when teardown is possible.

Provider actions should be idempotent. If a repository, project, env var, DNS record, or deployment target already exists, the provider should detect it and continue with stable outputs.

## Live Providers

- GitHub: create or reuse repository, push local project files
- Vercel: create project, link repository, sync env vars, deploy, health check, custom domains
- Neon: create project/database, capture connection string, create preview branches
- Clerk: validate configured keys and capture them for deployment
- Stripe: validate configured keys and capture them for deployment
- Sentry: discover project DSN and capture it for deployment
- Resend: validate API key and capture it for deployment
- Cloudflare: look up zones, create DNS records, verify DNS

## State

Assembler stores local state in `.assembler/state.db` in the project directory where it runs. The state store records:

- run plans and task status
- task outputs needed by downstream tasks
- run events and logs
- provider credential references and metadata
- preview environment records

State is local by design. Users should not commit `.assembler/`.

## Failure Handling

Every user-facing failure should explain what happened and how to recover. The normal recovery paths are:

- `assembler doctor` for credential and local-readiness checks
- `assembler resume <runId>` for retrying a corrected or transient failure
- `assembler teardown [runId]` for deleting resources created by a run

Raw provider HTTP errors should be wrapped before they reach the CLI or TUI.
