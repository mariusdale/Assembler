# March 27, 2026: Live Execution Learnings And Next Stage Plan

## What We Learned Today

### 1. The core product promise is real

We proved the core DevAssemble flow against live services:

- create a GitHub repository
- provision Neon infrastructure
- create and link a Vercel project
- sync environment variables
- deploy a live app

That matters more than mock-only progress. The product now has a real end-to-end path.

### 2. Live integrations expose issues that unit tests miss

Several bugs only appeared once we ran against real provider APIs:

- executor verification was using stale task state instead of freshly produced outputs
- GitHub repo creation needed idempotent handling when a retry encountered an already-created repo
- Neon project creation did not reliably return a usable `branchId`
- Neon database creation now requires `database.owner_name`
- Vercel repository linking had to be modeled as project creation with Git metadata, not a later patch
- Vercel deployment creation required a `name` field in the payload

The lesson is simple: passing local tests is not enough for infrastructure automation. Real provider contract testing has to become part of the development loop.

### 3. External account setup is part of the product surface

The first live run was blocked by account and integration prerequisites:

- GitHub token scope for repo creation
- Neon account-level API key instead of a project-scoped key
- Vercel login connection to GitHub
- Vercel GitHub App installation

This is not “user error.” These are real onboarding requirements that the product needs to detect and explain clearly.

### 4. Resume and checkpointing paid off

The executor design held up well under real failure conditions.

Because runs persisted task state and events, we were able to:

- fix code without losing the run
- swap credentials without restarting from zero
- continue from the failed step instead of reprovisioning everything

That is a strong product foundation and worth preserving.

### 5. Template quality is now a launch blocker

The infrastructure path worked, but the generated Next.js app still had to survive a real hosted build.

The first deployment failures were not infra failures. They were template correctness failures. That changes the priority order for the next stage:

- generated app quality
- deployment confidence
- testing depth

These now matter as much as provider breadth.

## What We Fixed Today

- executor verify path now uses the outputs produced during the same task execution
- GitHub create-repo is idempotent across retries
- Neon branch resolution falls back to branch lookup
- Neon database creation resolves and submits the owner name correctly
- Vercel linking now recreates or resolves the linked project correctly
- Vercel deploy payload now includes the required project `name`
- the golden-path Next.js template no longer uses `JSX.Element` return annotations that broke hosted builds

## Current Product State

As of today, DevAssemble can produce a working live result for the golden path:

- prompt -> plan
- execute against real providers
- create repo
- provision database
- create deployment

This is enough to justify the next phase: hardening the system instead of broadening it prematurely.

## Next Stage Goal

The next stage is not “add more providers first.”

The next stage is:

**turn the current golden path into a reliable, repeatable beta product**

That means a new user should be able to run DevAssemble with minimal manual intervention and get a working preview consistently.

## Next Stage Plan

### 1. Harden provider onboarding and preflight checks

Before execution starts, DevAssemble should validate:

- GitHub token scopes
- Neon key type and project creation ability
- Vercel login connection status
- Vercel GitHub App installation status

Goal:

- fail before provisioning starts
- show clear remediation steps
- avoid discovering account problems halfway through a run

### 2. Add real end-to-end acceptance coverage

We need a test tier for live-provider smoke runs and a second tier for contract-style mocked provider tests.

Immediate testing priorities:

- replay the golden path with seeded test accounts
- verify resume behavior after forced failure at each major step
- verify rollback behavior for partially completed runs
- verify generated app builds locally before remote deployment
- verify Vercel deployment reaches a ready state

### 3. Improve template robustness

The template now needs to be treated like a product, not a placeholder.

Immediate template work:

- local production build verification in CI
- health route and DB connectivity checks
- better environment validation
- basic landing page and dashboard polish
- removal of fragile typing or framework assumptions

### 4. Make execution safer and more observable

The local state store is useful, but we need better operator ergonomics.

Next improvements:

- richer `status` and `events` output
- structured error summaries by provider
- surfaced remediation hints for failed tasks
- clearer distinction between provider failure, account setup failure, and template failure

### 5. Stabilize the deployment lifecycle

The product should understand the real deployment lifecycle end to end.

Needed improvements:

- wait for Vercel deployment readiness explicitly
- detect hosted build failures and surface the logs cleanly
- support a redeploy command for the current run
- reduce race conditions from multiple fast GitHub commits

### 6. Prepare a small private beta

Only after the golden path is reliable should we widen scope.

Beta readiness checklist:

- one polished demo flow
- credential onboarding guide
- one-click or one-command happy path
- recovery path when a provider setup step is missing
- internal runbook for support and debugging

## Proposed Tomorrow Plan

### Morning

- push today’s provider and template fixes
- add provider preflight checks for GitHub, Neon, and Vercel
- add clearer CLI remediation messages

### Midday

- add local template production-build validation
- add an executor/integration test for deployment-ready waiting
- add a redeploy path for the generated app

### Afternoon

- run the golden path again from scratch with a clean app
- document exact onboarding requirements
- tighten the beta checklist and define the first external test user flow

## Strategic Rule For The Next Sprint

Do not expand provider surface area until the current golden path is boringly reliable.

Reliability beats breadth right now.
