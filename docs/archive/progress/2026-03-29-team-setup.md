# March 29, 2026: Milestone 8 — Team Onboarding with `assembler setup`

## What was done

### `assembler setup` command

One command for new team members to get a working local environment after cloning
a project that was previously launched with Assembler.

**Flow:**
1. Scans the project (detect framework, providers, env var requirements)
2. Finds the Vercel project automatically by matching the git remote URL
3. Falls back to project name lookup if git remote matching fails
4. Pulls all env vars from Vercel into `.env.local`
5. Reports any missing provider credentials (informational, not blocking)

**The key insight**: a new developer doesn't have `.assembler/state.db` because
that file is gitignored. So `setup` can't look up the Vercel project from a stored
run. Instead, it uses the Vercel API's `repoUrl` filter on `GET /v10/projects` to
find the project linked to the current git remote.

### Files modified

- `packages/providers/src/vercel/client.ts` — Added `listProjects(filters)` method
  with `repoUrl` filter. Exported `VercelProjectResponse` type.
- `packages/providers/src/index.ts` — Exported `VercelClient` class.
- `apps/cli/src/app.ts` — Added `setup()` method, `SetupResult` interface,
  `normalizeGitUrl()` (SSH→HTTPS conversion), `toSlug()` helper.
- `apps/cli/src/cli.ts` — Added `setup` command with spinner and result display.

### Design decisions

**Git remote URL normalization**: Git remotes can be HTTPS (`https://github.com/owner/repo.git`)
or SSH (`git@github.com:owner/repo.git`). The Vercel API expects HTTPS format, so
we normalize SSH URLs before searching.

**Fallback to project name**: If the git remote lookup fails (e.g., the remote was
renamed or the Vercel project was linked differently), we try `getProject()` with the
slugified project name as a last resort.

**Missing credentials are informational, not errors**: The new developer might not
have Neon or Stripe credentials yet — that's fine for local development. They just
need the env vars from Vercel. We report missing credentials but don't block setup.

**No Neon branch creation (yet)**: Creating a personal database branch for each
developer is a great future feature (Milestone 9: preview environments), but adding
it here would increase complexity. For now, the developer uses the shared database
URL from the pulled env vars and runs their own migrations.

## Example output

```
$ assembler setup
✓ Local environment configured

Setup complete:
  ✓ Next.js project detected
  ✓ Vercel project: sample-nextjs-app
  ✓ 3 env var(s) written to .env.local

Missing provider credentials (not required for local dev):
  ! Neon: run assembler creds add neon <token>

You can now run your dev server. Env vars are in .env.local.
```

## What this enables

**Before**: New developer joins → clones repo → asks "where are the env vars?" →
waits for someone to share credentials → manually creates `.env.local` → 1-2 hours.

**After**: New developer joins → clones repo → `assembler creds add vercel token=<tok>` →
`assembler setup` → env vars pulled → `npm run dev` → 60 seconds.

## Test results

All 34 tests pass. Typecheck clean in all 5 packages.

## Session summary (March 29, 2026)

Today we shipped 4 milestones:

| Milestone | What |
|-----------|------|
| 5 | Stripe provider (preflight, capture-keys, Vercel sync) |
| 6 | `plan` (dry run), `teardown` (resource cleanup), Deployment Protection warning |
| 7 | `env pull` and `env push` (Vercel env var sync) |
| 8 | `setup` (team onboarding — auto-discover Vercel project, pull env vars) |

Assembler now has 9 commands: `launch`, `setup`, `plan`, `teardown`, `env pull`,
`env push`, `creds add/list`, plus the lower-level `execute`/`resume`/`rollback`.
