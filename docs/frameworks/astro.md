# Astro Support

Assembler can scan Astro projects and plan deployment through the framework strategy registry. Vercel is the default target; static Astro deploy intents can be routed to Cloudflare Pages with `--target cloudflare-pages`.

## Detection

Astro is detected when `package.json` includes an `astro` dependency. The scanner also recognizes:

- official Clerk packages such as `@clerk/astro`, `@clerk/clerk-react`, and `@clerk/clerk-js`
- common Stripe webhook paths such as `src/pages/api/webhooks/stripe.ts`
- database env vars such as `DATABASE_URL`

## Deployment

The Astro strategy emits a deployment intent for the selected compatible target:

- static Astro projects use the `static` artifact
- configs with `output: 'server'` use the `ssr-node` artifact
- `npm` script `build` is passed through as the build command when present
- `dist` is used as the output directory

Current scope is plan creation and execution through the existing Vercel provider actions, plus explicit static targeting through Cloudflare Pages.
