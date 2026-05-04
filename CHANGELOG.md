# Changelog

All notable changes to Assembler are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Initial public beta of Assembler — a TUI-first launcher for existing Next.js and Astro applications.
- Astro framework strategy with static and server-output deployment intents.
- Launch path across GitHub, Neon, Vercel with optional Clerk, Stripe, Sentry, and Resend integrations.
- Cloudflare DNS management for custom domains via `assembler domain add`.
- Preview environments per git branch via `assembler preview`.
- Environment variable sync via `assembler env pull` and `assembler env push`.
- Open-source contributor docs, architecture notes, security policy, and code of conduct.

### Removed

- Legacy prompt/template generation path and placeholder packages that were outside the supported launch scope.
