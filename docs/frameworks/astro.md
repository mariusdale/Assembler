# Astro Support

Assembler can scan Astro projects and plan a Vercel deployment through the framework strategy registry.

## Detection

Astro is detected when `package.json` includes an `astro` dependency. The scanner also recognizes:

- official Clerk packages such as `@clerk/astro`, `@clerk/clerk-react`, and `@clerk/clerk-js`
- common Stripe webhook paths such as `src/pages/api/webhooks/stripe.ts`
- database env vars such as `DATABASE_URL`

## Deployment

The Astro strategy emits a deployment intent for the default Vercel target:

- static Astro projects use the `static` artifact
- configs with `output: 'server'` use the `ssr-node` artifact
- `npm` script `build` is passed through as the build command when present
- `dist` is used as the output directory

Current scope is plan creation and execution through the existing Vercel provider actions. Cloudflare Pages and other targets are tracked in the roadmap.
