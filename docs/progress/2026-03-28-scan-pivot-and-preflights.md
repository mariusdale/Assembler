# March 28, 2026: Scan-Based Pivot Completion and Preflight Implementation

## Context

DevAssemble was transitioning from a prompt/template-based model (user describes an app,
DevAssemble scaffolds and deploys it) to a scan-based "bring your own repo" model (user
builds their app, DevAssemble provisions infrastructure and deploys it). A prior agent
(Codex) started the pivot — the new types, scanner, and rule engine existed but the
wiring was incomplete.

## What was done

### 1. Provider preflight implementations

Added real `preflight()` methods to all three providers:

- **GitHub**: Hits `/user` API, reads `X-OAuth-Scopes` header to verify the `repo` scope.
  Added `requestJsonWithHeaders()` to the HTTP layer to expose response headers.
- **Neon**: Calls `listProjects()` to validate the API key. Detects 401 (invalid key)
  and 403 (project-scoped key, not account-level).
- **Vercel**: Calls `/v2/user` to validate the token, then checks `/v1/integrations/configurations`
  for the GitHub integration.

Each returns a `PreflightResult` with structured error codes, human-readable messages,
remediation instructions, and direct URLs.

The preflight orchestration in `app.ts` was rewritten to collect ALL errors across all
providers before reporting, rather than failing on the first one.

### 2. Fixed scan-path wiring in Vercel provider

Three bugs where the Vercel provider still referenced old template-path task outputs:

- **`deploy-preview`**: Was looking for SHA from `github-scaffold-template` / `github-initial-commit`.
  Now checks `github-push-code.latestCommitSha` first (scan path), falling back to old sources.
- **`link-repository`**: Was hardcoded to `github-create-repo` outputs. Now uses a
  `resolveRepoOutput()` helper that checks both `github-use-existing-repo` and `github-create-repo`.
- **`collectEnvVars`**: Old provider references (clerk, sentry, etc.) are harmless — `push()`
  silently skips undefined values. No change needed, just documented.

### 3. Rewrote CLI launch UX

Replaced bare `console.log` output with a phased display:

1. Scan spinner (ora) → "Next.js app detected"
2. Detected services list
3. Per-provider preflight pass/fail with chalk colors
4. Numbered execution plan with auto/approval labels and cost hints
5. y/n confirmation prompt
6. Per-task execution results with checkmarks/crosses
7. Completion summary box with preview URL, repo URL, database info

Added `scan()`, `createPlan()`, `preflight()`, and `executePlan()` to `CliApp` so the
CLI can orchestrate each phase with display.

### 4. Bug fixes

- **Executor sleep was a no-op**: `sleep: () => Promise.resolve()` meant retry backoff
  fired instantly. Fixed to use real `setTimeout`.
- **Neon schema migration was a stub**: `run-schema-migration` returned `{ success: true }`
  without doing anything. Removed from the scan plan entirely — DevAssemble doesn't run
  user code. Users run their own migrations post-deploy.
- **Three pre-existing typecheck errors**: Fixed missing `projectScan` field in test
  ExecutionContext objects, removed spurious `confirmTaskApproval` property.

## What we learned

1. **The scan-based path was 90% wired but the last 10% was critical.** The Vercel
   deploy-preview action would have failed on every scan-path run because it looked for
   a commit SHA from a template task that doesn't exist in the scan plan. This kind of
   cross-provider output dependency is the hardest thing to verify without running
   end-to-end.

2. **Preflight checks need response headers.** GitHub's scope information is only available
   via the `X-OAuth-Scopes` response header, not in the JSON body. The HTTP layer needed
   a new function for this.

3. **"Collect all errors" beats "fail fast" for preflight.** A user with multiple
   credential issues needs to see all of them at once, not fix one, re-run, discover
   the next.

4. **The old code path should be left alone.** The `init` command and `createRunPlan(appSpec)`
   still work for the template path. Deleting them would break the `init` command and tests.
   The launch flow simply never calls them.

## Current state

- `pnpm build` — 5/5 pass
- `pnpm typecheck` — 5/5 pass
- `pnpm test` — 27 tests pass
- All changes pushed to `origin/main`

## What's next

First live end-to-end test of `devassemble launch` against real provider APIs with a
test Next.js project. Need to:

1. Create a minimal Next.js test fixture
2. Store real GitHub / Neon / Vercel credentials
3. Run the full flow and fix whatever breaks
