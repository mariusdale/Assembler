# DevAssemble

[![npm version](https://img.shields.io/npm/v/devassemble)](https://www.npmjs.com/package/devassemble)
[![CI](https://github.com/devassemble/devassemble/actions/workflows/ci.yml/badge.svg)](https://github.com/devassemble/devassemble/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

**Launch your Next.js app from the terminal. No dashboard-hopping.**

DevAssemble is designed to be **TUI-first**. Install it, run `devassemble`, and do the rest from the interactive interface: set up credentials, review the plan, launch, check status, manage previews, sync env vars, and recover from failures without memorizing commands.

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
$ devassemble

  DevAssemble
  Launch-ready deployment for Next.js SaaS apps

  > Launch project
    Credentials
    Status
    Preview environments
    Domains
    Environment sync

  Scanning project...
  ✓ Next.js app detected
  ✓ Launch readiness: ready_with_warnings

  Expected outputs:
    Repo:    https://github.com/you/my-app
    Preview: https://my-app-abc123.vercel.app

  ✓ Launch complete!
```

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
# 1. Go to your project directory
cd your-nextjs-app

# 2. Start DevAssemble
devassemble
```

From the TUI, the normal beta flow is:

1. Open `Credentials` if you have not connected providers yet.
2. Choose `Launch project` to review the readiness briefing and confirm.
3. Use `Status`, `Preview environments`, `Domains`, and `Environment sync` for follow-up actions.

That is the primary product experience. DevAssemble scans your `package.json` and `.env.example`, provisions infrastructure, creates a GitHub repo, pushes your code, deploys to Vercel, and keeps the rest of the workflow inside the TUI.

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

## TUI-First Workflow

Run DevAssemble with no arguments to open the interactive TUI:

```bash
devassemble
```

The TUI is intended to be the main way people use the product. From there you can:

- launch a project after reviewing readiness, warnings, and expected outputs
- connect and validate provider credentials
- watch live progress, retries, failures, and remediation steps during a run
- inspect recent runs, outcomes, warnings, and next steps afterward
- create preview environments and tear them down
- configure domains
- sync environment variables

## Direct Commands

Most developers should just run `devassemble` and stay in the TUI. The direct commands below are still available for automation, shortcuts, and power users.

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

Use the `Credentials` section in the TUI for the normal guided setup flow.

If you prefer a direct command, `devassemble setup` is still available, and you can also add credentials manually:

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

## Preview Environments

The recommended path is to create and manage previews from the TUI.

If you want a direct command:

Create isolated preview environments per git branch:

```bash
devassemble preview feature-auth
```

This creates a Neon database branch (instant copy-on-write) and triggers a Vercel preview deployment with its own `DATABASE_URL`.

```bash
devassemble preview-teardown feature-auth
```

## Custom Domains

The recommended path is to configure domains from the TUI.

If you want a direct command:

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
