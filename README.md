# DevAssemble

[![npm version](https://img.shields.io/npm/v/devassemble)](https://www.npmjs.com/package/devassemble)
[![CI](https://github.com/devassemble/devassemble/actions/workflows/ci.yml/badge.svg)](https://github.com/devassemble/devassemble/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

**Launch and operate your existing Next.js application from the terminal.**

DevAssemble is a **TUI-first** launcher for teams that want a narrow, reliable deployment workflow instead of a wide product surface. Install it, run `devassemble`, and manage the supported launch path from the terminal UI: credentials, readiness, launch, status, previews, domains, and environment sync.

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
npm install -g devassemble
```

Or run directly:

```bash
npx devassemble
```

## Quick Start

```bash
cd your-nextjs-app
devassemble
```

Recommended TUI flow:

1. Open `Credentials` if required providers are not connected yet.
2. Open `Doctor` if the project needs readiness checks or remediation.
3. Open `Launch` to review the launch briefing and execute the run.
4. Use `Status`, `Preview`, `Domains`, and `Environment Sync` for follow-up operations.

## What DevAssemble Does

- scans `package.json`, `.env.example`, and project structure to confirm the supported launch path
- creates or reuses the GitHub repository
- provisions Neon when the project indicates a database requirement
- deploys and verifies the project on Vercel
- syncs detected provider credentials into the deployment environment
- keeps launch and recovery steps inside the terminal experience

## Direct Commands

Most teams should run `devassemble` and stay in the TUI. Direct commands remain available for automation and fast follow-up work.

| Command | Description |
|---|---|
| `devassemble launch` | Scan, provision, and deploy your project |
| `devassemble plan` | Show what `launch` would do without executing |
| `devassemble doctor` | Check project readiness and provider credentials |
| `devassemble status` | Inspect deployment history |
| `devassemble resume <runId>` | Resume a failed run from its checkpoint |
| `devassemble teardown` | Delete resources created by a launch |
| `devassemble env pull` | Pull env vars from Vercel into `.env.local` |
| `devassemble env push` | Push local env vars to Vercel |
| `devassemble preview [branch]` | Create a preview environment |
| `devassemble preview-teardown [branch]` | Tear down a preview environment |
| `devassemble domain add <domain>` | Configure a custom domain |
| `devassemble creds add <provider> <token>` | Add provider credentials |
| `devassemble creds list` | List configured providers |
| `devassemble setup` | Legacy CLI shortcut for guided credential setup |

## Requirements

- Node.js >= 20
- an existing Next.js project

## Feedback

Useful beta feedback should include:

- `runId`
- first failing task
- provider involved
- remediation text shown by DevAssemble

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
