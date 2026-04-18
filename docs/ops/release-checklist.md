# Release Checklist

Use this checklist before a beta tag, a live demo, or a new onboarding wave.

## Verification

- `pnpm lint`
- `pnpm typecheck`
- `pnpm build`
- `pnpm test`
- packaged install smoke from the bundled CLI artifact
- one manual live `assembler launch` rehearsal against real providers
- one manual `assembler preview` rehearsal if previews will be shown

## Product Surface

- README matches the current public beta scope
- TUI header, home, help, doctor, launch, and status screens use the same product language
- the public help output does not foreground internal or legacy commands
- all active docs live under the reorganized `docs/` structure

## Demo Readiness

- demo fixture path is confirmed
- provider credentials are valid before the session
- expected repo URL and preview URL are known in advance
- backup screenshots or transcript are ready in case a provider API wobbles

## Release Mechanics

- npm publish path is green
- GitHub release notes call out the supported scope, known issues, and requested feedback
- support owner is assigned for the release window
