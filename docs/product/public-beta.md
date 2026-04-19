# Public Beta Guide

## Product Promise

Assembler is a TUI-first launcher for **existing Next.js applications**. The supported public beta path is intentionally narrow so the launch experience stays reliable:

- existing Next.js project directory
- GitHub and Vercel required
- Neon as the default database path when `DATABASE_URL` is detected
- Clerk, Stripe, Sentry, and Resend as optional detected integrations
- no web dashboard in this milestone

## What Assembler Handles

- scans the current project to confirm framework, lockfile health, and required providers
- creates or reuses the GitHub repository
- provisions Neon when the project indicates a database requirement
- links and deploys the project on Vercel
- syncs detected provider credentials into the deployment environment
- keeps launch, status, preview, and recovery workflows inside the terminal UI

## What To Expect

- provider APIs can still introduce transient delays or retries
- preview deployments may return `401` when Vercel Deployment Protection stays enabled
- schema migrations remain a manual app-level step after launch
- the beta assumes a relatively standard Next.js build and deployment setup

## Support Expectations

When reporting an issue, include:

- the `runId`
- the first failing task
- the provider involved
- the remediation shown in the CLI or TUI
- whether you retried with `resume` or cleaned up with `teardown`

Use the operational runbook in [`docs/ops/support-runbook.md`](../ops/support-runbook.md) for triage details.
