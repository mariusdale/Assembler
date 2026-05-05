# Changelog

All notable changes to Assembler are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Initial public beta of Assembler — a TUI-first launcher for existing Next.js, Astro, and static site projects.
- Astro framework strategy with static and server-output deployment intents.
- Static site strategy for no-build `index.html` projects and package-based static outputs.
- Cloudflare Pages deployment target for explicit static/edge deploy target selection.
- `--target` support for `assembler plan` and `assembler launch`.
- Launch path across GitHub, Neon, Vercel with optional Clerk, Stripe, Sentry, and Resend integrations.
- Cloudflare DNS management for custom domains via `assembler domain add`.
- Preview environments per git branch via `assembler preview`.
- Environment variable sync via `assembler env pull` and `assembler env push`.
- Open-source contributor docs, architecture notes, security policy, and code of conduct.

### Removed

- Legacy prompt/template generation path and placeholder packages that were outside the supported launch scope.
