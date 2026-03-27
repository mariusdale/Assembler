# DevAssemble

DevAssemble is a monorepo for an AI-assisted SaaS provisioning toolchain. This repository currently contains the Milestone 1 bootstrap: shared TypeScript contracts, placeholder packages for future milestones, and a minimal CLI.

## Workspace

- `apps/cli`: Commander-based CLI entry point
- `apps/web`: Placeholder for the future operator dashboard
- `packages/types`: Shared contracts used across the monorepo
- `packages/core`: Placeholder planner/executor package
- `packages/providers`: Placeholder provider pack registry
- `templates`: Future golden-path application templates

## Getting started

This repo uses pnpm via Corepack.

```bash
corepack enable pnpm
pnpm install
pnpm build
pnpm test
```

To inspect the CLI help after building:

```bash
./bin/devassemble --help
```
