# March 28, 2026: First Live End-to-End Test (Scan Path)

## What happened

Ran `devassemble launch` against real provider APIs for the first time using the
scan-based "bring your own repo" flow. Used a minimal Next.js test fixture with
a `.env.example` declaring `DATABASE_URL`.

### Run 1 (automated, from Claude Code)

10/10 tasks succeeded on the first attempt:
- GitHub: created private repo, pushed 7 project files via Contents API
- Neon: created project + database, captured DATABASE_URL
- Vercel: created project, linked to GitHub, synced DATABASE_URL, deployed, reached READY

Preview URL returned a 401 — this is Vercel's standard Deployment Protection for
preview deployments (requires Vercel login cookie). The deployment itself was confirmed
READY by the wait-for-ready task.

### Run 2 (manual, from terminal)

Failed at "Create Neon database" with HTTP 423:
```
project already has running conflicting operations, scheduling of new ones is prohibited
```

**Root cause**: Neon's `create-project` API returns success while internal provisioning
operations (branch setup, endpoint creation) are still running. The `create-database`
task fired immediately and got rejected.

**Fix**: Added `waitForProjectReady()` to the Neon provider that polls
`GET /projects/{id}/operations` every 2 seconds until all active operations complete
before attempting database creation. 30-second timeout with a clear remediation message.

### Run 3 (manual, from terminal, after fix)

10/10 tasks succeeded. Full flow working from the user's terminal.

## What we learned

### 1. Provider-side race conditions are real

Neon's 423 is a textbook eventually-consistent API. The project exists but isn't ready
for mutations. This pattern will likely appear with other providers too (Stripe webhook
setup, Cloudflare DNS propagation). The fix pattern — poll for readiness before
proceeding — should be the standard approach.

### 2. Retry policy alone isn't enough

The executor's retry mechanism (2 retries, 1s backoff) wasn't sufficient for the Neon
race. The backoff was too short and retries too few. Better to handle readiness at the
provider level with explicit polling than to rely on generic retries for
provider-specific timing issues.

### 3. Vercel Deployment Protection is a UX surprise

Preview deployments on Vercel return 401 to unauthenticated visitors. This is correct
behavior but will confuse users who expect to click the preview URL and see their app.
We should either:
- Warn about this in the completion summary
- Or disable deployment protection via API during project creation (if possible)

### 4. The Contents API works but won't scale

GitHub's Contents API pushes one file per request. For our 7-file test fixture this
was fine. For a real project with hundreds of files, this will be extremely slow.
Future improvement: switch to Git Trees/Blobs API for bulk file uploads.

### 5. The scan-based flow is fundamentally sound

The full pipeline — scan → preflight → plan → confirm → execute → summary — worked
as designed. The DAG execution, checkpoint/resume, and provider abstraction all held up.
The bugs we hit were all provider-specific timing issues, not architectural problems.

## Resources created during testing

All test resources were manually cleaned up between runs:
- GitHub: `mariusdale/sample-nextjs-app` (private repo)
- Neon: `sample-nextjs-app-db` project
- Vercel: `sample-nextjs-app` project with GitHub link
