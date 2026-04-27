# Assembler

[![npm version](https://img.shields.io/npm/v/@mariusdale/assembler)](https://www.npmjs.com/package/@mariusdale/assembler)
[![CI](https://github.com/mariusdale/Assembler/actions/workflows/ci.yml/badge.svg)](https://github.com/mariusdale/Assembler/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

Assembler launches and operates an existing Next.js application from the terminal. It scans the project you already built, provisions the matching infrastructure, deploys to Vercel, and keeps follow-up operations like previews, domains, environment sync, teardown, and resume inside one CLI.

Assembler does not generate application code or scaffold projects.

## Supported Scope

The current public beta supports:

- existing Next.js project directories
- GitHub repository creation or reuse
- Vercel project creation, repository linking, env sync, deployment, and health checks
- Neon provisioning when database env vars or database packages are detected
- optional Clerk, Stripe, Sentry, and Resend credential capture and Vercel env sync
- Cloudflare DNS management for custom domains
- per-branch preview environments with Neon branch isolation when a production Neon database exists

## Install

```bash
npm install -g @mariusdale/assembler
```

Or run without installing:

```bash
npx @mariusdale/assembler
```

## Quick Start

```bash
cd your-nextjs-app
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

## Documentation

- [Documentation index](docs/README.md)
- [Architecture](docs/architecture.md)
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

## License

MIT
