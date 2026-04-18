# Demo Script

Target length: 3-5 minutes.

## Golden Path

1. Open the demo fixture in a clean working state.
2. Run `assembler` and start on the home screen.
3. Call out the readiness summary and recommended next action.
4. Open `Credentials` and show that required launch providers are already connected.
5. Open `Doctor` and confirm the project gate is ready.
6. Return to `Launch` and walk through:
   - readiness
   - warnings
   - required providers
   - expected outputs
   - execution plan
7. Start the launch and narrate:
   - current run id
   - active phase
   - recent activity
8. End on `Status` and confirm:
   - repo URL
   - preview URL
   - warnings or next steps

## Pre-Demo Checklist

- confirm GitHub, Vercel, and any demo-specific credentials are valid
- confirm the fixture project is clean and still detected as Next.js
- run `pnpm build` and `pnpm test`
- run packaged install smoke from the bundled CLI artifact
- complete one full launch rehearsal in advance
- capture backup screenshots or a transcript in case live provider APIs become unreliable during the demo
