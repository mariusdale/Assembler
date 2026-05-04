# Contributing to Assembler

Thanks for helping improve Assembler. The public beta is intentionally narrow today: the stable path provisions infrastructure and deploys existing Next.js and Astro applications. The roadmap broadens that through more framework strategies, deployment targets, and providers. Assembler does not generate application code, create business logic, or maintain a hosted service.

## Getting Started

Prerequisites:

- Node.js 20 or newer
- pnpm through Corepack
- git

```bash
git clone https://github.com/mariusdale/Assembler.git
cd Assembler
corepack enable pnpm
pnpm install
pnpm build
pnpm test
```

Run the local CLI:

```bash
./bin/assembler --help
```

## Repository Layout

```text
apps/cli/            CLI and terminal UI entry point
packages/types/      Shared TypeScript contracts
packages/core/       Project scanner, planner, executor, and state store
packages/providers/  Provider packs for GitHub, Neon, Vercel, Clerk, Stripe, Cloudflare, Sentry, and Resend
tests/fixtures/      Framework-scoped sample applications used by integration tests
docs/                Contributor, product, release, and support documentation
```

See [docs/architecture.md](docs/architecture.md) for the main flows, package boundaries, and provider conventions.

## Development Commands

```bash
pnpm lint
pnpm typecheck
pnpm build
pnpm test
```

Run all four before opening a pull request. The test suite uses Vitest.

## Product Rules

- No code generation. Assembler deploys the app in the current project directory.
- Preflight credentials before resource-creating API calls.
- Return remediation hints for user-facing failures.
- Make provider actions idempotent. Existing resources should be reused when possible.
- Checkpoint task state after every status change so `assembler resume <runId>` can recover safely.
- Do not add placeholders for providers or apps that are not implemented.

## Adding or Changing a Provider

1. Add or update the provider package under `packages/providers/src/<provider>/`.
2. Implement credential validation in `preflight`.
3. Keep API failures wrapped with actionable remediation text.
4. Register scan detection in `packages/core/src/planner/project-scanner.ts` only when the provider has a real execution path.
5. Add shared provider setup in `packages/core/src/planner/rule-engine.ts` or framework-specific planning under `packages/core/src/planner/strategies/`.
6. Add provider tests under `packages/providers/tests/`.
7. Add or update Vercel env sync only for outputs that the provider actually produces.

Good providers are boring in the best way: credential checks are early, actions can be safely retried, and the task outputs are stable contracts.

## Pull Requests

- Keep PRs focused on one concern.
- Include the user-facing behavior change in the PR description.
- Add tests for planner changes, provider behavior, and regression fixes.
- Update [CHANGELOG.md](CHANGELOG.md) under `## [Unreleased]` for user-visible changes.
- For live-provider bugs, include the `runId`, first failing task, provider involved, and remediation text shown by Assembler.

## Security

Do not open a public issue for vulnerabilities or leaked secrets. Follow [SECURITY.md](SECURITY.md).

## License

By contributing, you agree that your contributions are licensed under the [MIT License](LICENSE).
