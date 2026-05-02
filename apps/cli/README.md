# Assembler

Provision the infrastructure your app needs and ship it from your terminal.

Assembler is a TUI-first CLI for existing applications. It scans the project you already built, plans the required infrastructure as a task DAG, executes provider actions with checkpoint and resume, and stores local run state in `.assembler/state.db`.

The public beta supports the Next.js + Vercel path today. Astro, static sites, Cloudflare Pages, and more targets are on the public roadmap.

## Install

```bash
npm install -g @mariusdale/assembler
```

Or run without installing:

```bash
npx @mariusdale/assembler
```

## Quick Start

From an existing Next.js project:

```bash
cd your-nextjs-app
assembler
```

The terminal UI is the primary experience:

1. Add provider credentials from `Credentials`.
2. Run `Doctor` to check local readiness and provider access.
3. Use `Launch` to review and execute the deployment plan.
4. Use `Status`, `Preview`, `Domains`, and `Environment Sync` for follow-up work.

## Supported Today

- Existing Next.js project directories
- GitHub repository creation or reuse
- Vercel project creation, repository linking, env sync, deployment, and health checks
- Neon provisioning when database env vars or database packages are detected
- Optional Clerk, Stripe, Sentry, and Resend credential capture and Vercel env sync
- Cloudflare DNS management for custom domains
- Per-branch preview environments with Neon branch isolation

## Links

- GitHub: <https://github.com/mariusdale/Assembler>
- Documentation: <https://github.com/mariusdale/Assembler#readme>
- Roadmap: <https://github.com/mariusdale/Assembler/blob/main/ROADMAP.md>
