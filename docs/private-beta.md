# Private Beta Guide

## Who This Is For

DevAssemble is currently tuned for indie hackers building and launching **Next.js SaaS apps** from an existing project directory.

The beta is a good fit if you:

- already have a working Next.js app
- want GitHub, Vercel, and optionally Neon wired up from the terminal
- are comfortable giving product feedback after a guided and self-serve launch

## Supported Beta Scope

- Next.js project scanning and launch planning
- GitHub repo creation or reuse
- Vercel project creation, env sync, deploy, and health-check warnings
- Neon provisioning when `DATABASE_URL` is detected
- Provider key capture for Clerk, Stripe, Sentry, and Resend when detected
- Preview environments and custom domains as beta workflows

## What May Break

- Provider-side eventual consistency can still cause transient failures
- Preview deployments may return 401 because of Vercel Deployment Protection
- Schema migrations are still manual
- The beta assumes a relatively standard Next.js project layout

## How To Report A Failure

Include:

- the `runId`
- the first failing task
- the provider involved
- the remediation text shown in the CLI or TUI
- whether the issue happened during a guided launch or a self-serve retry

For triage details, use [support-runbook.md](support-runbook.md).
