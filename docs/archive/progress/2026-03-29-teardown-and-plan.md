# March 29, 2026: Milestone 6 — Teardown, Plan, and Deployment Protection Warning

## What was done

### 1. `assembler plan` command (dry run)

New command that runs the full scan → preflight → plan pipeline but stops before
executing. Shows:
- Detected framework and services
- Credential validation results
- Full execution plan with task details and cost estimates
- The saved run ID (can be used with `assembler execute <runId>`)

This lets users verify what Assembler will do before committing. Lowers the barrier
to trying the tool — "look before you leap."

### 2. `assembler teardown` command

New command that rolls back all resources created by a launch run:
- Finds the latest run (or accepts a specific run ID)
- Shows exactly what will be deleted (GitHub repo, Neon project, Vercel project)
- Requires explicit y/n confirmation (destructive action)
- Displays per-task rollback results
- Handles edge cases: already torn down, never executed, no successful tasks

This is the confidence multiplier — users know they can always undo a launch.

### 3. Deployment Protection warning

The completion summary after `assembler launch` now:
- Shows Stripe mode (test/live) when Stripe keys were synced
- Warns about Vercel Deployment Protection (preview URLs return 401)
- Explains how to disable it (Dashboard → Project Settings → Deployment Protection)
- Shows a hint about `assembler teardown`

### 4. Detected services display improvement

Changed `printDetectedServices()` to show all detected providers (not just neon/vercel),
so Stripe and any future providers are displayed during scan output.

## Files modified

- `apps/cli/src/cli.ts` — Added `plan` and `teardown` commands, `describeTeardownActions()`
  helper, Deployment Protection warning, Stripe mode in summary, teardown hint
- `apps/cli/tests/app.test.ts` — Updated credential assertion to be provider-list agnostic

## Design decisions

### Teardown shows what will be deleted before confirming

Rather than silently rolling back, teardown lists the specific resources (e.g.,
"GitHub repository: mariusdale/my-app", "Neon project: my-app-db") so the user
knows exactly what's about to be destroyed. This matches the "measure twice, cut once"
principle.

### Plan saves to state store

The `plan` command saves the RunPlan to the state store even though it doesn't execute.
This means a user could run `assembler plan` to preview, then `assembler execute`
to run the saved plan. This is intentional — it supports a cautious workflow.

## Test results

All 34 tests pass across the workspace. Typecheck clean in all 5 packages.
