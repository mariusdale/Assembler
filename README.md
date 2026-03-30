# DevAssemble

Launch your app from the terminal. No dashboard-hopping.

DevAssemble scans your project, detects what infrastructure it needs, provisions everything across GitHub, Neon, and Vercel, and deploys — all from one command. You build the app; DevAssemble handles the rest.

## Quickstart

```bash
npm install -g devassemble
devassemble setup
cd your-project
devassemble launch
```

## What you need

- **GitHub account** — for repository hosting ([sign up](https://github.com/signup))
- **Neon account** (free) — for Postgres database ([sign up](https://console.neon.tech))
- **Vercel account** (free) — for hosting and deployments ([sign up](https://vercel.com/signup))

DevAssemble uses YOUR accounts. It never creates resources under its own infrastructure.

## Supported stack

Next.js projects with Neon (Postgres). DevAssemble detects your framework and database from `package.json` and `.env.example`.

## Commands

| Command | Description |
|---|---|
| `devassemble setup` | Guided credential setup (run this first) |
| `devassemble launch` | Scan, plan, and deploy your project |
| `devassemble plan` | Show what `launch` would do without executing |
| `devassemble status` | Show the current run status |
| `devassemble resume <runId>` | Resume a failed run from where it stopped |
| `devassemble teardown` | Delete all resources created by a launch |
| `devassemble env pull` | Pull env vars from Vercel into `.env.local` |
| `devassemble env push` | Push local env vars to Vercel |
| `devassemble preview [branch]` | Create a preview environment with database branch |
| `devassemble domain add <domain>` | Configure a custom domain (Cloudflare + Vercel) |

## How it works

1. **Scan** — DevAssemble reads your `package.json`, `.env.example`, and project structure to detect your framework and required services.
2. **Plan** — A task DAG is generated: create GitHub repo, push code, provision Neon database, create Vercel project, link repo, sync env vars, deploy.
3. **Approve** — You review the plan and confirm before any resources are created.
4. **Execute** — Tasks run in dependency order. Each step is checkpointed to SQLite so you can resume if anything fails.
5. **Live** — Your app is deployed with all env vars wired up. You get a preview URL immediately.

## Credential setup

Run `devassemble setup` for a guided walkthrough, or add credentials manually:

```bash
devassemble creds add github <personal-access-token>
devassemble creds add neon <api-key>
devassemble creds add vercel token=<token>
```

See [docs/credential-setup.md](docs/credential-setup.md) for detailed instructions on creating each token.

## Development

This repo uses pnpm via Corepack.

```bash
corepack enable pnpm
pnpm install
pnpm build
pnpm test
```
