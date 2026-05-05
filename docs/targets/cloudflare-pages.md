# Cloudflare Pages Target

Assembler can route static deploy intents to Cloudflare Pages when the target is selected explicitly:

```bash
assembler plan --target cloudflare-pages
assembler launch --target cloudflare-pages
```

The target currently supports:

- no-build static projects with a root `index.html`
- package-based static projects with `dist/`, `build/`, `_site/`, or `out/` output
- deploy intents with artifact `static` or `ssr-edge`

Vercel remains the default target. Cloudflare Pages is selected only when the user passes `cloudflare-pages` or the provider alias `cloudflare`.

## Credentials

Cloudflare Pages actions need an API token and account id:

```bash
assembler creds add cloudflare token=<api-token> accountId=<account-id>
```

The token must be able to manage Pages projects for that account. Existing Cloudflare DNS commands still use the same provider credential.

## Planned Follow-Up

- Add `assembler doctor` checks for Pages-specific token scopes and account id presence.
- Add richer status output for Cloudflare Pages preview URLs.
