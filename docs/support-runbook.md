# Support Runbook

## Collect First

When a beta user reports a problem, collect:

- run id
- failing task id or name
- provider involved
- remediation text shown by DevAssemble
- whether retry, resume, or rollback was attempted

## Classify The Failure

1. **Credentials**
   Missing, expired, wrong scope, or wrong account-level token.

2. **Provider provisioning**
   Resource creation/linking failures, eventual consistency, quota limits, or repo integration issues.

3. **Deploy/build**
   Vercel build failures, preview auth surprises, or missing env vars.

4. **Project scan / assumptions**
   Lockfile issues, unsupported project layout, or env inference mismatches.

## Immediate Actions

- If credentials are invalid: ask the user to rerun `devassemble doctor`
- If the failure looks transient: recommend `devassemble resume <runId>`
- If the run created unwanted resources: recommend `devassemble teardown`
- If preview health-check warns with 401: confirm whether Vercel Deployment Protection is expected

## Escalation Notes

Include the run id, task id, provider, and first failing message in any internal escalation so the team can reproduce quickly.
