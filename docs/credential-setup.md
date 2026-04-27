# Credential Setup

Assembler validates provider credentials before it creates resources. Credentials are stored locally in `.assembler/state.db` for the project directory where you run the CLI.

## Required for Launch

### GitHub

Assembler uses GitHub to create or reuse a repository and push the local project files.

1. Create a personal access token at <https://github.com/settings/tokens>.
2. Grant the `repo` scope.
3. Add it to Assembler:

```bash
assembler creds add github <github-token>
```

For teardown of repositories created by Assembler, the token also needs delete permissions. Without that scope, Assembler will explain the manual cleanup step.

### Vercel

Assembler uses Vercel to create projects, link repositories, set env vars, trigger deployments, verify health, and attach domains.

1. Create a token at <https://vercel.com/account/tokens>.
2. Use an account or team scope that can manage the target project.
3. Add it to Assembler:

```bash
assembler creds add vercel token=<vercel-token>
```

For teams, include the team ID:

```bash
assembler creds add vercel token=<vercel-token> teamId=<team-id>
```

Install the Vercel GitHub App for the GitHub account or organization that owns the repository: <https://github.com/apps/vercel>.

## Required When Detected

### Neon

Required when Assembler detects database usage through `DATABASE_URL`, `DIRECT_DATABASE_URL`, Drizzle, Prisma, `pg`, or Neon packages.

```bash
assembler creds add neon <neon-account-api-key>
```

Use an account-level API key from <https://console.neon.tech/app/settings/api-keys>. Project-scoped keys cannot create new projects.

### Clerk

Required when Assembler detects Clerk packages or env vars.

```bash
assembler creds add clerk token=<clerk-secret-key> publishableKey=<clerk-publishable-key>
```

### Stripe

Required when Assembler detects Stripe packages or env vars.

```bash
assembler creds add stripe <stripe-secret-key>
```

### Sentry

Required when Assembler detects Sentry packages, env vars, or config files.

```bash
assembler creds add sentry <sentry-auth-token>
```

Supported token formats are Sentry tokens with an `sntrys_` prefix or 64-character hexadecimal tokens.

### Resend

Required when Assembler detects Resend packages or env vars.

```bash
assembler creds add resend <resend-api-key>
```

Resend keys start with `re_`.

### Cloudflare

Required for `assembler domain add <domain>`.

```bash
assembler creds add cloudflare <cloudflare-api-token>
```

The token must be able to read zones and edit DNS records for the target zone.

## Verify

Run:

```bash
assembler doctor
```

Doctor checks configured provider credentials and reports remediation steps for missing or invalid credentials.
