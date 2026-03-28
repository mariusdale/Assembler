# Next Phase Plan: Stripe, Cloudflare DNS, and Provider Expansion

Written: 2026-03-28
Target start: 2026-03-29

## Current state

The core three-provider flow (GitHub → Neon → Vercel) works end-to-end against
real APIs. Preflight checks, execution, and the scan-based launch path are solid.

## Phase goals

1. Add Stripe provider (detect from dependencies/env vars, create products/prices, sync keys)
2. Add Cloudflare DNS provider (custom domain setup, DNS records, SSL)
3. Evaluate Neon vs Supabase and decide whether to add Supabase as an alternative

---

## Task 1: Stripe Provider

### What it does

Stripe is detected when the scanner finds:
- `stripe` in package.json dependencies
- `STRIPE_SECRET_KEY` or `STRIPE_PUBLISHABLE_KEY` in .env.example
- `app/api/webhooks/stripe/route.ts` (webhook handler)

The scanner already detects all of these. The planner needs to generate tasks,
and the provider needs to implement them.

### Tasks to generate (scan path)

```
stripe-preflight          → validate API key, check it's a test/live key
stripe-capture-keys       → read the publishable + secret keys from the Stripe dashboard API
stripe-sync-env-vars      → depends on vercel-create-project; sync STRIPE_SECRET_KEY +
                            NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY to Vercel
```

We should NOT auto-create products, prices, or webhook endpoints during `launch`.
That's business logic, not infrastructure. DevAssemble provisions infrastructure
and syncs credentials — it doesn't decide what the user is selling.

### What we should do

- **Preflight**: Validate the Stripe API key (hit `/v1/account`), confirm it works
- **Capture keys**: The user provides a secret key; we derive the publishable key
  from the Stripe API or ask for both
- **Sync to Vercel**: Push STRIPE_SECRET_KEY and NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
  as env vars

### What we should NOT do

- Create products/prices (that's user business logic)
- Set up webhooks automatically (the URL isn't known until after deployment, and
  webhook endpoints are tightly coupled to the app's route structure)
- Configure Stripe billing portal (user's choice)

### Implementation plan

1. Add `StripeClient` with `getAccount()` method
2. Implement `preflight()` — validate key, detect test vs live mode
3. Implement `apply()` for `capture-keys` action
4. Update rule engine `createTaskSeedsFromProjectScan()` to add stripe tasks
   when stripe is detected
5. Update Vercel `collectEnvVars` to sync stripe keys from the capture task
6. Add credential storage: `devassemble creds add stripe <secret-key>`

### Estimated effort: 2-3 hours

---

## Task 2: Cloudflare DNS

### When it's needed

Cloudflare DNS is only needed when the user wants a custom domain. For the
`devassemble launch` flow (which deploys to a Vercel preview URL), custom domains
are NOT in scope. They're a post-launch step.

### Recommendation: Defer Cloudflare DNS

Here's why:
- `devassemble launch` gets you a working `.vercel.app` preview URL
- Custom domains require the user to own the domain AND have it on Cloudflare
- DNS propagation adds minutes of waiting and failure modes
- Vercel handles SSL automatically for custom domains added through their dashboard

Custom domain support should be a separate command (e.g., `devassemble domain add`)
rather than part of the initial launch flow. The old AppSpec-based plan included
Cloudflare because it was trying to do everything at once. The scan-based model is
more incremental.

### If we do add it later

```
cloudflare-preflight      → validate API token, check zone access
cloudflare-add-domain     → add domain to Vercel project
cloudflare-create-records → create CNAME records pointing to Vercel
cloudflare-verify-dns     → poll until DNS propagates
vercel-add-domain         → add custom domain to Vercel project
vercel-verify-domain      → verify domain ownership
```

### Estimated effort: 4-5 hours (when we get to it)

---

## Task 3: Neon vs Supabase

### TL;DR

They're different tools. Neon is a better fit for DevAssemble right now.
Supabase could be added as an alternative later.

### Neon

**What it is**: Serverless Postgres. Just the database.

Pros for DevAssemble:
- Simple API — create project, get connection string, done
- Serverless scaling, branches for preview environments
- Free tier is generous (0.5 GB storage, 190 compute hours/month)
- Pure Postgres — works with Prisma, Drizzle, any ORM
- API is straightforward to automate

Cons:
- Just a database. No auth, storage, realtime, or edge functions
- That's fine — DevAssemble doesn't need those from the DB provider

### Supabase

**What it is**: Backend-as-a-service built on Postgres. Database + Auth + Storage +
Realtime + Edge Functions.

Pros:
- More features out of the box (auth, storage, realtime)
- Popular with indie hackers and early-stage startups
- Good free tier (500 MB database, 1 GB storage, 50K monthly active users)
- Strong ecosystem and community

Cons for DevAssemble:
- **Heavier API surface** — creating a Supabase project provisions a database, auth
  instance, storage bucket, API gateway, and more. More things to wait for, more
  things that can fail.
- **Overlapping concerns** — if the user already has Clerk for auth, Supabase auth
  is redundant. If they have Vercel for hosting, Supabase Edge Functions overlap.
- **Management API is less granular** — harder to provision just the database without
  the full platform
- **Connection model is different** — Supabase uses connection pooling (Supavisor)
  by default, which changes the connection string format and can cause issues with
  some ORMs

### Recommendation

**Keep Neon as the default for now.** It's the simplest tool for what DevAssemble
needs: provision a Postgres database and hand back a connection string.

**Add Supabase as an optional alternative later.** The scanner could detect it from:
- `@supabase/supabase-js` in dependencies
- `SUPABASE_URL` / `SUPABASE_ANON_KEY` in .env.example

When detected, DevAssemble would create a Supabase project and sync the URL + anon
key to Vercel. But this is a separate provider, not a replacement for Neon.

---

## Proposed work order for tomorrow

### Morning (2-3 hours)

1. **Stripe provider implementation**
   - StripeClient + preflight
   - capture-keys action
   - Rule engine integration
   - Vercel env var sync
   - Tests

### Afternoon (1-2 hours)

2. **Polish and edge cases**
   - Add Deployment Protection warning to completion summary
   - Improve error messages for common failures
   - Test the full flow with a project that has both DATABASE_URL and STRIPE_SECRET_KEY
   - Document the Stripe credential setup in CLAUDE.md

### Defer to later

3. Cloudflare DNS (separate `devassemble domain` command)
4. Supabase as alternative database provider
5. Git Trees API for faster file upload

## Open questions for tomorrow

- Should `devassemble creds add stripe` accept just the secret key and derive
  the publishable key? Or require both?
- Should Stripe preflight distinguish between test and live keys and warn if
  the user is about to deploy with test keys to a production environment?
- Do we want a `devassemble plan` command that shows the plan without executing?
  This would help users verify before committing.
