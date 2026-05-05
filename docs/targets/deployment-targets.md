# Deployment Target Extensions

Framework strategies do not create provider-specific deploy tasks directly. They emit a `DeployIntent`, then the deployment target registry selects a compatible target.

This keeps framework detection separate from hosting-provider behavior:

```text
ProjectScan
  -> FrameworkStrategy
  -> DeployIntent
  -> DeploymentTargetRegistry
  -> DeploymentTarget.plan()
  -> task DAG seeds
```

## Contracts

The shared target contracts live in `packages/types/src/index.ts`:

- `DeployIntent`: artifact type, framework, optional build/output settings, Node version, and env var keys.
- `DeploymentTarget`: named target that can answer `supports(intent)` and turn an intent into deployment task seeds.
- `DeploymentTargetRegistry`: target collection used by the planner to select defaults or explicit preferences.

Default registration lives in `packages/core/src/planner/deployment-target-registry.ts`.

## Existing Targets

- Vercel is the default target and supports all non-unknown, non-Docker deploy intents.
- Cloudflare Pages supports explicit `static` and `ssr-edge` intents through `--target cloudflare-pages` or config `target: "cloudflare-pages"`.

## Adding A Target

1. Add provider API actions if the provider does not already support the target lifecycle.
2. Create `packages/core/src/planner/targets/<target>.ts`.
3. Implement `DeploymentTarget.supports(intent)` narrowly. Prefer exact artifact/framework support over broad claims.
4. Implement `DeploymentTarget.plan(intent, ctx)` with stable task ids, dependency ordering, and params derived from the intent.
5. Register the target in `createDefaultDeploymentTargetRegistry`.
6. Add planner tests for default selection, explicit preference, and unsupported intent behavior.
7. Add provider tests for create, deploy, readiness, verify, and idempotent existing-resource paths.
8. Document credentials, scope, and smoke-test steps under `docs/targets/`.

## Target Selection

Without a preference, the registry picks the first registered target that supports the intent. With a preference, the registry matches either target name or provider name:

```bash
assembler plan --target cloudflare-pages
assembler launch --target cloudflare
```

Project config can set the same default:

```json
{
  "target": "cloudflare-pages"
}
```

Command-line `--target` takes precedence over config.

## Planning Guidelines

- Keep target task ids provider-scoped, for example `cloudflare-pages-create-project`.
- Preserve the shared GitHub dependency shape: deployment should depend on pushed code and any required provider captures.
- Pass `buildCommand`, `outputDirectory`, and `nodeVersion` through params when the provider can use them.
- Throw a clear planner error when no registered target supports an intent.
- Keep rollback and verify behavior in provider packs, not planner target adapters.
