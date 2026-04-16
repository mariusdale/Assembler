# Support Runbook

## Collect First

When a beta user reports a problem, collect:

- `runId`
- first failing task name or id
- provider involved
- remediation text shown by DevAssemble
- whether `doctor`, `resume <runId>`, or `teardown` was attempted

## Classification

1. Credentials — missing, expired, wrong scope, or wrong account-level token.
2. Provider provisioning — resource creation failures, quota limits, repo integrations, or eventual consistency.
3. Deploy/build — Vercel build failures, preview protection surprises, or missing env vars.
4. Project readiness — unsupported framework, lockfile issues, missing build script, or repo assumptions.

## Immediate Actions

- If required credentials are missing or invalid: run `devassemble doctor`
- If the failure looks transient after correction: run `devassemble resume <runId>`
- If unwanted resources were created during a test: run `devassemble teardown`
- If preview verification shows `401`: confirm whether Vercel Deployment Protection is expected

## Escalation Format

Internal escalation should include the `runId`, first failing task, provider, and the first visible failure message so someone else can reproduce quickly.
