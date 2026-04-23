# 2026-03-31: Distribution & Polish (Milestones 14+15)

## Milestone 14: Distribution

### npm Publish Setup
- Created `apps/cli/tsup.config.ts` — bundles workspace deps (`@assembler/core`, `@assembler/providers`, `@assembler/types`) into single ESM output, keeps native addons (`better-sqlite3`) and React/Ink external
- Updated `apps/cli/package.json`:
  - Renamed to `assembler` (from `@assembler/cli`)
  - Removed `private: true`
  - Added `repository`, `license`, `homepage`, `description`, `keywords`
  - Added `bundle` script using tsup
  - Moved workspace deps to devDependencies, runtime deps (better-sqlite3, anthropic) to dependencies
- Added `bundle` and `release` scripts to root `package.json`

### GitHub Actions Release Workflow
- Created `.github/workflows/release.yml` — triggers on `v*` tag push
- Steps: checkout, pnpm, node, install, lint, typecheck, build, test, bundle, publish to npm, create GitHub release

### README Overhaul
- Added npm/CI/license badges
- Installation section (`npm install -g assembler` / `npx assembler launch`)
- Terminal demo output in quick start
- Full provider table with status (8 live, 1 planned)
- Complete command reference (including new `doctor`)
- Credential setup with links to provider dashboards
- Sections for preview environments, custom domains, interactive mode

## Milestone 15: Polish & DX

### GitHub Trees/Blobs API
- Added 6 new methods to `GitHubClient`: `createBlob`, `createTree`, `createCommit`, `updateRef`, `getRef`, `pushFiles`
- `pushFiles` orchestrates: get HEAD ref -> create blobs -> create tree -> create commit -> update ref
- Updated `push-code` action to use `pushFiles` instead of per-file `createOrUpdateFile` calls
- Result: N+3 API calls instead of N*2 (each file needed GET+PUT before)
- `createOrUpdateFile` preserved for `commit-template` action (AppSpec path)

### Post-Deploy Health Check
- Added `health-check` action to Vercel provider
- Hits deployed URL, retries with 3s interval up to 30s timeout
- Returns `success: true` always — sets `healthy: false` with warning if URL doesn't return 200 (informational, doesn't fail the launch)
- Wired as final task in scan-based DAG: `vercel-health-check` depends on `vercel-wait-for-ready`
- Updated integration tests with new task

### TUI Error Recovery
- Updated `TaskProgressList` to accept `onFailureAction` callback
- On task failure, shows bordered error box with `[r]etry / [s]kip / [a]bort` options
- `LaunchScreen` handles each action:
  - Retry: resets task to pending, re-executes
  - Skip: marks task as skipped, continues
  - Abort: shows error and returns to menu
- Added `execute-paused` phase to LaunchScreen state machine

### `assembler doctor` Command
- Added `doctor()` method to `CliApp` interface — checks Node version, iterates all 8 providers, validates credentials via preflight
- Added CLI command with ora spinner and formatted output
- Added `DoctorScreen` TUI component with same diagnostic output
- Wired into TUI home menu and screen router

## Files Changed
- `apps/cli/tsup.config.ts` (new)
- `apps/cli/package.json`
- `.github/workflows/release.yml` (new)
- `package.json`
- `README.md`
- `packages/providers/src/github/client.ts` — Trees/Blobs API methods
- `packages/providers/src/github/index.ts` — batch push-code
- `packages/providers/src/vercel/index.ts` — health-check action
- `packages/core/src/planner/rule-engine.ts` — health-check task in DAG
- `packages/core/tests/launch-flow-integration.test.ts` — updated expectations
- `apps/cli/src/app.ts` — doctor interface and implementation
- `apps/cli/src/cli.ts` — doctor command
- `apps/cli/src/tui/app.tsx` — DoctorScreen routing
- `apps/cli/src/tui/types.ts` — doctor screen type
- `apps/cli/src/tui/screens/HomeScreen.tsx` — doctor menu item
- `apps/cli/src/tui/screens/DoctorScreen.tsx` (new)
- `apps/cli/src/tui/screens/LaunchScreen.tsx` — error recovery
- `apps/cli/src/tui/components/TaskProgressList.tsx` — failure action UI
