# March 29, 2026: Stripe Provider Implementation

## What was done

Implemented the Stripe provider as the fourth live provider in DevAssemble, replacing
the placeholder. The provider follows the same pattern as GitHub/Neon/Vercel.

### New files

- `packages/providers/src/stripe/client.ts` — StripeClient class with `getAccount()`,
  test/live key detection, and publishable key prefix derivation.
- `packages/providers/src/stripe/index.ts` — Full ProviderPack implementation with
  preflight and capture-keys action.
- `packages/providers/tests/stripe-provider.test.ts` — 8 tests covering preflight
  (missing key, bad format, invalid key, valid test key, valid live key) and capture-keys
  (test mode, live mode, publishable key passthrough).

### Modified files

- `packages/core/src/planner/rule-engine.ts` — Added `stripe-capture-keys` task seed
  to `createTaskSeedsFromProjectScan()` when stripe is detected. Added stripe as a
  predeploy dependency for Vercel env var sync.
- `packages/providers/src/vercel/index.ts` — Updated `collectEnvVars()` to sync
  `STRIPE_SECRET_KEY` from `stripe-capture-keys` (scan path) with fallback to
  `stripe-capture-secret-key` (old AppSpec path). Also syncs
  `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` when provided.
- `packages/providers/src/index.ts` — Registered real Stripe provider, removed from
  placeholders spread.
- `packages/providers/src/placeholders.ts` — Removed Stripe placeholder.
- `packages/providers/tests/index.test.ts` — Updated registry assertion for new
  Stripe actions.
- `apps/cli/src/app.ts` — Added `stripe` to `REQUIRED_LIVE_PROVIDERS` so preflight
  runs for it.
- `CLAUDE.md` — Updated to reflect Milestone 5, four live providers, Stripe design,
  and updated testing instructions.

## Design decisions

### Single capture-keys action (not create-product/configure-webhook)

Per the next phase plan, DevAssemble provisions infrastructure and syncs credentials.
It does NOT create Stripe products, prices, or webhook endpoints — those are business
logic decisions the user makes. The Stripe provider:

1. Validates the secret key against `/v1/account`
2. Detects test vs live mode from the key prefix
3. Outputs the secret key and mode for Vercel env var sync

### Publishable key handling

The Stripe API doesn't expose an endpoint to retrieve the publishable key from a
secret key. The user can either:
- Provide it as a task param (`publishableKey`)
- Add it to their `.env.example` and provide it via creds

If the publishable key is not provided, only `STRIPE_SECRET_KEY` gets synced to
Vercel. The `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` push is conditional.

### Preflight validation layers

The preflight checks three things in order:
1. Token presence (immediate fail if missing)
2. Key format (must start with `sk_test_`, `sk_live_`, `rk_test_`, or `rk_live_`)
3. API validation (hits `/v1/account`, catches 401)

This avoids unnecessary API calls when the key is obviously wrong.

## Test results

All 34 tests pass across the workspace. Typecheck clean in all 5 packages.
