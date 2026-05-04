# Assembler

[![npm version](https://img.shields.io/npm/v/@mariusdale/assembler)](https://www.npmjs.com/package/@mariusdale/assembler)
[![CI](https://github.com/mariusdale/Assembler/actions/workflows/ci.yml/badge.svg)](https://github.com/mariusdale/Assembler/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Stability: public beta](https://img.shields.io/badge/stability-public%20beta-yellow)](docs/product/public-beta.md)
[![Node.js >=20](https://img.shields.io/badge/node-%3E%3D20-brightgreen)](package.json)

Provision the infrastructure your app needs and ship it from your terminal.

Assembler is a TUI-first CLI for existing applications. It scans the project you already built, plans the required infrastructure as a task DAG, executes provider actions with checkpoint and resume, and stores local run state in `.assembler/state.db`.

The public beta is honest about its current shape: the Next.js and Astro paths deploy through Vercel today. Static sites, Cloudflare Pages, and more targets are on the public roadmap.

Assembler does not generate application code or scaffold projects.

## Quick Start

```bash
npm install -g @mariusdale/assembler
```

Or run without installing:

```bash
npx @mariusdale/assembler
```

From an existing Next.js or Astro project:

```bash
cd your-app
assembler
```

The terminal UI is the primary experience:

1. Add provider credentials from `Credentials`.
2. Run `Doctor` to check local readiness and provider access.
3. Use `Launch` to review and execute the deployment plan.
4. Use `Status`, `Preview`, `Domains`, and `Environment Sync` for follow-up work.

Direct commands are available for automation:

| Command | Description |
|---|---|
| `assembler launch` | Scan, provision, deploy, and verify the current project |
| `assembler plan` | Show the launch plan without executing it |
| `assembler doctor` | Check local readiness and configured provider credentials |
| `assembler status [runId]` | Inspect deployment history or a specific run |
| `assembler resume <runId>` | Resume a failed run from its checkpoint |
| `assembler teardown [runId]` | Delete resources created by a launch run |
| `assembler env pull [runId]` | Pull Vercel env vars into `.env.local` |
| `assembler env push [runId]` | Push `.env.local` or `.env` vars to Vercel |
| `assembler preview [branch]` | Create a branch preview environment |
| `assembler preview-teardown [branch]` | Tear down a preview environment |
| `assembler domain add <domain>` | Configure Cloudflare DNS and register the domain with Vercel |
| `assembler creds add <provider> <token>` | Store provider credentials locally |
| `assembler creds list` | List configured credential providers |

## Compatibility

| Area | Supported today | Planned |
|---|---|---|
| Frameworks | Next.js, Astro | Static sites, Remix, SvelteKit, generic Node |
| Deployment targets | Vercel | Cloudflare Pages, Netlify, Docker-based targets |
| Providers | GitHub, Vercel, Neon, Clerk, Stripe, Sentry, Resend, Cloudflare DNS | Supabase, Railway, Fly.io, PostHog, Plausible, Linear |
| State | Local SQLite in `.assembler/state.db` | Optional dashboard and team sync |

See [ROADMAP.md](ROADMAP.md) for the milestone plan and the first contributor issues we want to open.

## Credentials

Credentials are stored locally in `.assembler/state.db` inside the project you run Assembler from.

```bash
assembler creds add github <github-token-with-repo-scope>
assembler creds add vercel token=<vercel-token>
assembler creds add neon <neon-account-api-key>
```

Optional providers are added the same way when your project uses them:

```bash
assembler creds add clerk token=<secret-key> publishableKey=<pk_...>
assembler creds add stripe <stripe-secret-key>
assembler creds add sentry <sentry-auth-token>
assembler creds add resend <resend-api-key>
assembler creds add cloudflare <cloudflare-api-token>
```

See [Credential setup](docs/credential-setup.md) for scopes and provider links.

## How It Works

```text
Project scan
  -> planner rules and provider detection
  -> task DAG
  -> executor
  -> ProviderPack actions
  -> SQLite state and recovery commands
```

The planner uses framework strategies that emit deployment intents. Deployment targets, starting with Vercel, decide whether they can satisfy those intents, so frameworks and hosting targets can evolve independently.

## Why Assembler?

| Compared with | Assembler focuses on |
|---|---|
| Terraform | SaaS-native app launch flows without asking users to manage state files |
| Vercel CLI | Hosting plus database, auth, email, DNS, previews, env sync, and teardown |
| Bash scripts | Idempotent provider actions, resumable runs, rollback hooks, and local history |

## Documentation

- [Documentation index](docs/README.md)
- [Architecture](docs/architecture.md)
- [Astro framework support](docs/frameworks/astro.md)
- [Public beta guide](docs/product/public-beta.md)
- [Credential setup](docs/credential-setup.md)
- [Release checklist](docs/ops/release-checklist.md)
- [Support runbook](docs/ops/support-runbook.md)
- [Contributing](CONTRIBUTING.md)
- [Security policy](SECURITY.md)

## Development

```bash
corepack enable pnpm
pnpm install
pnpm lint
pnpm typecheck
pnpm build
pnpm test
```

Run the local CLI:

```bash
./bin/assembler --help
```

## Contributing

Assembler is maintained in the open and has a roadmap designed for contributors. Start with [CONTRIBUTING.md](CONTRIBUTING.md), then look for issues labeled `good-first-issue` or pick up one of the milestone slices in [ROADMAP.md](ROADMAP.md).

## License

MIT
