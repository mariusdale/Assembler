# Contributing to Assembler

Thanks for your interest in improving Assembler. This guide covers everything you need to go from a fresh clone to a merged PR.

Assembler is a TUI-first launcher for existing Next.js applications. It **provisions** and **deploys** — it does not generate application code. Keep this in mind when proposing features.

## Prerequisites

- Node.js >= 20
- pnpm via corepack: `corepack enable pnpm`
- git

## Setup

```bash
git clone https://github.com/mariusdale/Assembler.git
cd Assembler
pnpm install
pnpm build
pnpm test
```

To run the CLI from your working copy:

```bash
./bin/assembler --help
```

## Project layout

```
apps/cli/           # CLI + TUI entry point (commander, ora, chalk)
packages/types/     # Shared type contracts (ProjectScan, RunPlan, Task, ProviderPack)
packages/core/      # Planner (rule engine, scanner) and executor (DAG runtime, state store)
packages/providers/ # Provider packs: github, neon, stripe, vercel, clerk, cloudflare, sentry, resend
tests/fixtures/     # Sample Next.js app used by integration tests
templates/          # Optional reference templates (not required to use Assembler)
```

For architecture detail, provider design notes, and conventions, see [`CLAUDE.md`](CLAUDE.md).

## How to add a provider

Assembler currently ships eight live providers. New providers follow a consistent pattern — the cleanest recent examples are `stripe`, `clerk`, `sentry`, and `resend`, which all use a single `capture-keys` action.

1. Create `packages/providers/src/<name>/` with an action file and a provider definition.
2. Implement `preflight` (validates credentials before any resource-creating call) and the action handlers.
3. Register the provider in the scan rule engine so it's detected from `package.json` dependencies or `.env.example` variables.
4. Wire outputs into the Vercel env var sync step if the provider exposes secrets.
5. Add tests under `packages/providers/tests/` covering the happy path, idempotent reuse, and preflight failure.

Follow the documented conventions:

- **Idempotent.** If a resource already exists, detect and continue — do not fail.
- **Preflight before execution.** No resource-creating API call runs before credentials are validated.
- **Remediation hints on every error.** Never surface raw HTTP errors to users.
- **Checkpoint after every task.** State must be recoverable via `assembler resume <runId>`.

## Code style

- TypeScript strict mode. No `any` unless genuinely unavoidable.
- ESLint: `pnpm lint`. Fix warnings before opening a PR.
- No code generation or scaffolding logic in provider packs — that contradicts the product scope.

## Testing

```bash
pnpm lint
pnpm typecheck
pnpm build
pnpm test
```

All four must pass before your PR can land. The test suite uses [Vitest](https://vitest.dev/).

For bugs reproduced against real providers, include:

- the `runId`
- the first failing task
- the provider involved
- the remediation text Assembler printed

See [`docs/ops/support-runbook.md`](docs/ops/support-runbook.md) for the support triage format.

## Pull requests

- Keep PRs tightly scoped. One concern per PR.
- Reference any related issue in the description.
- For live-run bugs, include a reproduction snippet and the `runId` from your local state store.
- Update [`CHANGELOG.md`](CHANGELOG.md) under `## [Unreleased]` if your change is user-visible.

## Where to ask questions

- **Bugs and feature requests:** [GitHub Issues](https://github.com/mariusdale/Assembler/issues)
- **Security vulnerabilities:** do not open a public issue — email the maintainer privately instead.

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).
