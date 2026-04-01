# DevAssemble

[![npm version](https://img.shields.io/npm/v/devassemble)](https://www.npmjs.com/package/devassemble)
[![CI](https://github.com/devassemble/devassemble/actions/workflows/ci.yml/badge.svg)](https://github.com/devassemble/devassemble/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

**Launch your Next.js app from the terminal. No dashboard-hopping.**

DevAssemble scans your project, detects what infrastructure it needs, provisions everything, and deploys — all from one command. You build the app; DevAssemble handles the rest.

## Private Beta

DevAssemble is in a **private beta** focused on indie hackers shipping **Next.js SaaS apps**. The current product promise is intentionally narrow:

- Scan an existing Next.js app
- Provision GitHub, Neon, and Vercel
- Capture common provider credentials and sync env vars
- Show a launch-ready TUI before, during, and after deploys

If you want the beta process, supported scope, and feedback expectations, start here:

- [Private beta guide](docs/private-beta.md)
- [Release checklist](docs/release-checklist.md)
- [Support runbook](docs/support-runbook.md)
- [Outreach assets](docs/outreach.md)

```
$ devassemble launch

  Scanning project...
  ✓ Next.js app detected
    • Database: Neon
    • Auth: Clerk
    • Payments: Stripe
    • Hosting: Vercel

  Execution Plan:
    1. Create GitHub repository
    2. Push local project code
    3. Create Neon project
    4. Capture Clerk API keys
    5. Capture Stripe API keys
    6. Create Vercel project
    7. Sync environment variables
    8. Deploy to Vercel preview
    9. Verify deployment health

  ✓ Launch complete!
    Preview: https://my-app-abc123.vercel.app
    Repo:    https://github.com/you/my-app
```

## Install

```bash
npm install -g devassemble
```

Or run directly:

```bash
npx devassemble launch
```

## Quick Start

```bash
# 1. Set up your provider credentials (guided walkthrough)
devassemble setup

# 2. Go to your project directory
cd your-nextjs-app

# 3. Launch
devassemble launch
```

That’s the core beta flow. DevAssemble scans your `package.json` and `.env.example`, provisions a database, creates a GitHub repo, pushes your code, and deploys to Vercel with the detected environment variables wired up.

## Providers

| Provider | What it does | Status |
|---|---|---|
| **GitHub** | Repository hosting, code push | Beta |
| **Neon** | Postgres database provisioning | Beta |
| **Vercel** | Hosting, deployments, env vars | Beta |
| **Clerk** | Authentication key capture | Beta |
| **Stripe** | Payment key capture | Beta |
| **Sentry** | Error tracking DSN capture | Beta |
| **Resend** | Email API key capture | Beta |
| **Cloudflare** | Custom domain DNS management | Beta |
| **PostHog** | Product analytics | Planned |

## Commands

| Command | Description |
|---|---|
| `devassemble launch` | Scan, provision, and deploy your project |
| `devassemble plan` | Show what `launch` would do (dry run) |
| `devassemble setup` | Guided credential setup |
| `devassemble doctor` | Check system readiness and credentials |
| `devassemble status` | Show current run status |
| `devassemble resume <runId>` | Resume a failed run from where it stopped |
| `devassemble teardown` | Delete all resources created by a launch |
| `devassemble env pull` | Pull env vars from Vercel into `.env.local` |
| `devassemble env push` | Push local env vars to Vercel |
| `devassemble preview [branch]` | Create preview environment with database branch |
| `devassemble preview-teardown [branch]` | Tear down preview environment |
| `devassemble domain add <domain>` | Configure custom domain (Cloudflare + Vercel) |
| `devassemble creds add <provider> <token>` | Add provider credentials |
| `devassemble creds list` | List configured providers |

## Supported Beta Scope

- Existing **Next.js** project directories
- Launch flow centered on **GitHub + Vercel**, with **Neon** when `DATABASE_URL` is detected
- Credential capture and env sync for Clerk, Stripe, Resend, and Sentry when detected
- Preview environments and custom domains as beta workflows

## How It Works

1. **Scan** — Reads `package.json`, `.env.example`, and project structure to detect your framework and required services.
2. **Preflight** — Validates all provider credentials before any resources are created.
3. **Plan** — Generates a task DAG: repo creation, database provisioning, env var sync, deployment.
4. **Approve** — You review the plan and confirm.
5. **Execute** — Tasks run in dependency order, checkpointed to SQLite for resumability.
6. **Health Check** — Verifies the deployment is reachable and surfaces warnings when Vercel preview protection blocks a public 200.

## Credential Setup

Run `devassemble setup` for a guided walkthrough, or add credentials manually:

```bash
devassemble creds add github <personal-access-token>
devassemble creds add neon <api-key>
devassemble creds add vercel token=<token>
devassemble creds add stripe <secret-key>
devassemble creds add clerk token=<secret-key> publishableKey=<pk_...>
devassemble creds add sentry <auth-token>
devassemble creds add resend <api-key>
```

### Required accounts

- **GitHub** — [Personal access token](https://github.com/settings/tokens) with `repo` scope
- **Vercel** — [API token](https://vercel.com/account/tokens) + [GitHub integration](https://vercel.com/integrations/github) installed

### Optional (auto-detected from your project)

- **Neon** — [API key](https://console.neon.tech/app/settings/api-keys) (if `DATABASE_URL` in `.env.example`)
- **Stripe** — [Secret key](https://dashboard.stripe.com/apikeys) (if `stripe` in `package.json`)
- **Clerk** — [Secret key](https://dashboard.clerk.com) (if `@clerk/nextjs` in `package.json`)
- **Sentry** — [Auth token](https://sentry.io/settings/auth-tokens/) (if `@sentry/nextjs` in `package.json`)
- **Resend** — [API key](https://resend.com/api-keys) (if `resend` in `package.json`)

## Interactive Mode

Run `devassemble` with no arguments to launch the interactive TUI:

```bash
devassemble
```

Navigate with arrow keys to launch, view status, manage credentials, and more.

The TUI now shows:

- launch readiness and blockers before execution
- live task progress plus recent run activity during execution
- outcome summaries, warnings, and next steps after execution

## Preview Environments

Create isolated preview environments per git branch:

```bash
devassemble preview feature-auth
```

This creates a Neon database branch (instant copy-on-write) and triggers a Vercel preview deployment with its own `DATABASE_URL`.

```bash
devassemble preview-teardown feature-auth
```

## Custom Domains

```bash
devassemble domain add myapp.com
```

Configures Cloudflare DNS and registers the domain on your Vercel project. SSL is auto-provisioned.

## Requirements

- Node.js >= 20
- A Next.js project

## Feedback

Private beta feedback is most useful when it includes:

- your `runId`
- the first failing task name
- the provider involved
- the remediation text shown by DevAssemble

The support flow and triage checklist are documented in [docs/support-runbook.md](docs/support-runbook.md).

## Development

```bash
corepack enable pnpm
pnpm install
pnpm build
pnpm test
```

## License

MIT
