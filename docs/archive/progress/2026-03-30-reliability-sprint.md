# 2026-03-30 — Reliability Sprint Session

## Goal

Make the core three-provider launch path (GitHub → Neon → Vercel) reliable and package Assembler for first users. No new features — only bug fixes, error handling, tests, and documentation.

## What was done

### Phase 1: Reliability

**Test fixture** — Created `tests/fixtures/sample-nextjs-app/` with a minimal Next.js project (next, drizzle-orm, @neondatabase/serverless, .env.example with DATABASE_URL). Used for scanner/planner verification.

**Launch flow integration test** — `packages/core/tests/launch-flow-integration.test.ts` with 6 scenarios:
- Correct task DAG for Next.js + Neon (no git remote)
- Correct dependency edges for every task
- Stripe/Clerk task inclusion when those providers are detected
- Existing repo task switching (github-use-existing-repo vs github-create-repo)
- Full mock execution that validates every `ctx.getOutput()` call matches real output keys
- Resume after failure: skips completed tasks, retries failed, continues to completion

**Error handling hardened across all three core providers:**

| Provider | Change |
|---|---|
| GitHub | Rollback handles 404 (repo already deleted). push-code wraps 404/403 with remediation hints. parseGitHubRemoteUrl error includes expected format. |
| Neon | create-project is now idempotent (lists existing projects by name, reuses if match found). capture-database-url throws if URL is undefined instead of silently outputting undefined. Rollback handles 404. |
| Vercel | create-project is now idempotent (getProject by name, reuse if exists). link-repository no longer destructively deletes projects linked to a different repo — throws with guidance instead. wait-for-ready errors include inspector URL, last known state, and dashboard URL. |

**Resume/checkpoint verified** — Read through the entire executor runtime. The checkpoint system is solid: `saveRunWithEvent` uses SQLite transactions, `normalizeRunPlanForResume` correctly resets failed/running/blocked tasks. Covered by existing executor tests and the new integration test.

### Phase 2: Launch Packaging

**Setup wizard** — Replaced the old team-onboarding `setup` command with a guided 3-step credential wizard:
1. GitHub (opens token creation URL with repo scope pre-selected)
2. Neon (opens API key settings)
3. Vercel (opens token creation, warns about GitHub App installation)

Each step: opens browser, prompts for paste, validates immediately via discover(), stores via credential store. Checks for existing credentials and offers to replace. Idempotent re-runs.

**Fixed pre-existing type errors** in `app.ts`:
- Preview plan status was `'pending'` (invalid) → changed to `'approved'`
- Domain plan status was `'pending'` → `'approved'`
- `executor.execute()` was called with RunPlan instead of `{ runPlan }` (ExecuteRunOptions)
- Result access was `result.tasks` instead of `result.runPlan.tasks`
- PreviewResult with exactOptionalPropertyTypes needed conditional spread

**README.md** — Rewrote from developer-facing workspace README to user-facing quickstart (what it does, quickstart, commands table, how it works).

**docs/credential-setup.md** — Step-by-step guide for creating each provider token.

## Key learnings

### Output wiring is the most fragile part of the system

The task DAG executor uses hard-coded task IDs in `ctx.getOutput('task-id', 'key')` calls. If a task ID changes in the rule engine but isn't updated in the provider's `apply()` method, the output silently returns `undefined` and the downstream task either fails with a confusing error or silently produces incomplete results.

The Vercel provider's `collectEnvVars()` function is the highest-risk area — it has ~15 hard-coded task ID lookups across both the scan-based and AppSpec-based paths. The integration test I wrote catches this class of bug by asserting that every `getOutput()` call returns a truthy value during mock execution.

### Idempotency was inconsistent

GitHub had 422 handling for repo creation (idempotent), but Neon and Vercel had none. A resumed run that re-executed create-project would fail on the second attempt because the name was taken. Both Neon and Vercel now check for existing resources before creating.

### The `link-repository` destructive behavior was dangerous

Vercel's `createOrResolveLinkedProject()` would delete and recreate a project if it was linked to a different repo. This is dangerous during resume — if the user manually linked the project to a different repo between runs, Assembler would silently delete it. Changed to throw with guidance instead.

### Type errors accumulate in app.ts

The `app.ts` file had accumulated type errors from multiple sessions of changes (preview flow, domain flow) that were never caught because the build wasn't run consistently. The `exactOptionalPropertyTypes` tsconfig option makes optional properties strict — you can't assign `undefined` to them, you must omit the key entirely.

### The executor's sleep injection pattern is excellent for testing

The executor accepts a `sleep` function parameter, which tests replace with `() => Promise.resolve()`. This makes the full DAG execution run synchronously in tests. Same pattern used for `now` and `idGenerator`. Worth preserving for future providers.

## Test counts

- Before: 54 tests across 16 files
- After: 60 tests across 17 files (+6 in launch-flow-integration.test.ts)
- All passing, all packages build clean

## What's next

- Live end-to-end test against real APIs (the integration test validates wiring but not actual API behavior)
- Stripe env var wiring needs a live test (capture-keys → Vercel sync)
- Consider adding a `--dry-run` flag to `launch` that runs preflight without execution
- The preview command's DATABASE_URL placeholder (`'__PLACEHOLDER__'`) is still not resolved — needs to set the real branch database URL after Neon branch creation
