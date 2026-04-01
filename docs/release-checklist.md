# Private Beta Release Checklist

Use this checklist before cutting a beta tag or inviting a new cohort.

## Verification

- `pnpm lint`
- `pnpm typecheck`
- `pnpm build`
- `pnpm test`
- one manual live `devassemble launch` smoke test against real providers
- one manual `devassemble preview` smoke test
- one install smoke test via global install, `npx`, or release candidate tarball

## Product Readiness

- README matches the current supported beta scope
- `docs/progress/STATUS.md` reflects the current feature set
- known issues are refreshed
- TUI launch, status, and completion flows reflect current behavior

## Release Mechanics

- prerelease tags publish to npm with the `beta` dist-tag
- GitHub prerelease notes call out:
  - what changed
  - known issues
  - what feedback is needed from beta users

## Beta Ops

- shortlist of 10-20 indie hackers is up to date
- walkthrough script is current
- support runbook is current
- issue triage owner is assigned for the wave
