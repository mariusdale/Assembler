# Assembler

[![npm version](https://img.shields.io/npm/v/@mariusdale/assembler)](https://www.npmjs.com/package/@mariusdale/assembler)
[![CI](https://github.com/mariusdale/Assembler/actions/workflows/ci.yml/badge.svg)](https://github.com/mariusdale/Assembler/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

**Launch and operate your existing Next.js application from the terminal.**

Assembler is a **TUI-first** launcher for teams that want a narrow, reliable deployment workflow instead of a wide product surface. Install it, run `assembler`, and manage the supported launch path from the terminal UI: credentials, readiness, launch, status, previews, domains, and environment sync.

## Public Beta Scope

The supported beta promise is intentionally focused:

- existing **Next.js** project directories only
- **GitHub** and **Vercel** are required for the launch path
- **Neon** is the default database path when `DATABASE_URL` is detected
- **Clerk**, **Stripe**, **Sentry**, and **Resend** are optional detected integrations
- no web dashboard in this milestone

Start with these docs:

- [Public beta guide](docs/product/public-beta.md)
- [Release checklist](docs/ops/release-checklist.md)
- [Support runbook](docs/ops/support-runbook.md)
- [Demo script](docs/go-to-market/demo-script.md)
- [Documentation index](docs/README.md)

## Install

```bash
npm install -g @mariusdale/assembler
```

Or run directly:

```bash
npx @mariusdale/assembler
```

## Quick Start

```bash
cd your-nextjs-app
assembler
```

Recommended TUI flow:

1. Open `Credentials` if required providers are not connected yet.
2. Open `Doctor` if the project needs readiness checks or remediation.
3. Open `Launch` to review the launch briefing and execute the run.
4. Use `Status`, `Preview`, `Domains`, and `Environment Sync` for follow-up operations.

## What Assembler Does

- scans `package.json`, `.env.example`, and project structure to confirm the supported launch path
- creates or reuses the GitHub repository
- provisions Neon when the project indicates a database requirement
- deploys and verifies the project on Vercel
- syncs detected provider credentials into the deployment environment
- keeps launch and recovery steps inside the terminal experience

## Direct Commands

Most teams should run `assembler` and stay in the TUI. Direct commands remain available for automation and fast follow-up work.

| Command | Description |
|---|---|
| `assembler launch` | Scan, provision, and deploy your project |
| `assembler plan` | Show what `launch` would do without executing |
| `assembler doctor` | Check project readiness and provider credentials |
| `assembler status` | Inspect deployment history |
| `assembler resume <runId>` | Resume a failed run from its checkpoint |
| `assembler teardown` | Delete resources created by a launch |
| `assembler env pull` | Pull env vars from Vercel into `.env.local` |
| `assembler env push` | Push local env vars to Vercel |
| `assembler preview [branch]` | Create a preview environment |
| `assembler preview-teardown [branch]` | Tear down a preview environment |
| `assembler domain add <domain>` | Configure a custom domain |
| `assembler creds add <provider> <token>` | Add provider credentials |
| `assembler creds list` | List configured providers |
| `assembler setup` | Legacy CLI shortcut for guided credential setup |

## Requirements

- Node.js >= 20
- an existing Next.js project

## Feedback

Useful beta feedback should include:

- `runId`
- first failing task
- provider involved
- remediation text shown by Assembler

See [docs/ops/support-runbook.md](docs/ops/support-runbook.md) for the operational triage flow.

## Development

```bash
corepack enable pnpm
pnpm install
pnpm build
pnpm test
```

## License

MIT
