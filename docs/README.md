# Documentation

This directory contains the active documentation for Assembler.

## Start Here

- [Architecture](architecture.md) explains the package boundaries and launch flow.
- [Astro framework support](frameworks/astro.md) documents the first non-Next.js strategy.
- [Deployment target extensions](targets/deployment-targets.md) explains how framework strategies route deploy intents to targets.
- [Cloudflare Pages target](targets/cloudflare-pages.md) documents explicit static/edge deploy target selection.
- [Project configuration](configuration.md) explains `assembler.config.*` overrides and commands.
- [Launch plan](launch-plan.md) tracks current implementation status and launch verification.
- [Roadmap](../ROADMAP.md) lists the open-source milestones and contributor entry points.
- [Credential setup](credential-setup.md) lists provider token requirements.
- [Public beta guide](product/public-beta.md) defines the supported product scope.
- [Release checklist](ops/release-checklist.md) covers release verification.
- [Smoke tests](ops/smoke-tests.md) lists manual CLI checks for release candidates and demos.
- [Support runbook](ops/support-runbook.md) covers triage for failed launches.

## Repository Automation

- `.github/workflows/ci.yml` runs lint, typecheck, build, and tests on pushes and pull requests.
- `.github/workflows/release.yml` runs the same verification on `v*` tags, bundles the CLI, publishes npm, and creates a GitHub Release.

## Documentation Rules

- Keep root-level docs limited to project-wide entry points such as `README.md`, `ROADMAP.md`, `CLAUDE.md`, `CONTRIBUTING.md`, `SECURITY.md`, `CODE_OF_CONDUCT.md`, `CHANGELOG.md`, and `LICENSE`.
- Put active product docs under `docs/product/`.
- Put operational runbooks under `docs/ops/`.
- Do not commit personal notes, generated exports, `.docx` files, or milestone scratchpads.
- Remove obsolete docs instead of archiving them in the repository.
