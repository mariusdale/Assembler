# DevAssemble Status

Last updated: 2026-04-16

## Current Position

DevAssemble is a CLI/TUI-first launcher for existing Next.js applications. The immediate focus is making the product polished enough for a live demo and disciplined enough for a controlled beta launch.

## Active Priorities

- professionalize the first-run TUI experience
- keep the launch promise narrow and consistent
- reduce the public CLI surface to commands we are prepared to support
- clean up the repo and docs so active materials are easy to find
- rehearse the golden demo path before the beta launch window

## Supported Beta Scope

- existing Next.js projects
- GitHub repository creation or reuse
- Vercel project creation, env sync, deployment, and verification
- Neon provisioning when `DATABASE_URL` is detected
- optional credential capture for Clerk, Stripe, Sentry, and Resend
- preview environments and custom domains as secondary beta workflows

## Known Constraints

- schema migrations are still manual
- preview protection can still produce `401` responses for unauthenticated visitors
- live provider rehearsal remains a manual release gate
- `apps/web` remains a placeholder only
