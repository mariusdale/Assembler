# Assembler — Codex Implementation Prompt

## What Assembler Is

Assembler is a CLI tool that automates the infrastructure provisioning and deployment lifecycle for developers who have already written their application code. It is NOT a code generator. It does NOT compete with Claude Code or Codex for writing application code. It solves the problem that comes AFTER the code is written: the 2-4 hours of manual dashboard-hopping across Vercel, Neon, Stripe, Cloudflare, and other services to provision infrastructure, generate API keys, wire environment variables, configure webhooks, and deploy.

The core user story: A founder finishes building their Next.js app with Claude Code. They run `assembler launch` from their project directory. Assembler detects what the project needs, builds an execution plan, asks for approval, and provisions everything — repo, database, hosting, environment variables, deployment — without the founder ever opening a browser dashboard.

## What Assembler Is NOT

- It is NOT a code generator or scaffolder. The user brings their own code.
- It is NOT a template engine. There is no golden-path app template. The user's existing project IS the input.
- It does NOT use an LLM to generate application code. The only LLM usage is in intent parsing (understanding what the user wants to provision) and optionally in project detection (scanning the repo to infer required services).
- It does NOT create provider accounts on behalf of users. Users supply their own API keys. Assembler orchestrates what happens with those keys.

## Deadline Context

There is a live demo next week. Every implementation decision should optimize for a working end-to-end demo of the primary flow: user points Assembler at their existing project → plan is generated → infrastructure is provisioned → app is deployed and live. Polish, breadth, and edge cases come after this works reliably.

---

## Architecture Overview

### Monorepo Structure

```
assembler/
├── apps/
│   └── cli/                  # CLI entry point (commander.js)
├── packages/
│   ├── core/                 # Planner, Executor, StateStore
│   │   ├── planner/          # Project scanner + rule engine
│   │   └── executor/         # DAG walker, retry, checkpoint, resume, rollback
│   ├── providers/            # All provider packs (GitHub, Neon, Vercel, etc.)
│   └── types/                # Shared TypeScript types
├── tests/
├── CLAUDE.md
├── turbo.json
└── package.json              # Turborepo workspace root
```

No `templates/` directory. No `apps/web/`. CLI only.

### Tooling

| Concern         | Choice           | Rationale                                   |
| --------------- | ---------------- | ------------------------------------------- |
| Monorepo        | Turborepo        | Fast, zero-config, good TS support          |
| Language        | TypeScript strict | Type safety for provider contracts          |
| Runtime         | Node.js 20+      | Native fetch, stable ESM                    |
| CLI framework   | Commander.js     | Lightweight, well-known                     |
| Testing         | Vitest           | Fast, native TS, Turborepo-compatible       |
| State storage   | SQLite (better-sqlite3) | Zero-infra local state, portable     |
| CI              | GitHub Actions   | Standard                                    |

---

## The Primary Flow: Bring Your Own Repo

This is the ONLY flow that matters for the demo. Everything else is secondary.

### Step 1: Project Detection

When the user runs `assembler launch` (or `assembler init`) from their project directory, Assembler scans the project to determine:

1. **Framework**: Next.js, Remix, Astro, plain Node, etc. (v1: Next.js only is fine)
2. **Database needs**: Does the project reference DATABASE_URL, Prisma, Drizzle, or any ORM config?
3. **Auth needs**: Does the project reference Clerk, Auth.js, or auth-related env vars?
4. **Payment needs**: Does the project reference Stripe env vars, webhook handlers, or billing code?
5. **Email needs**: Does the project reference Resend, SendGrid, or email env vars?
6. **Monitoring**: Does the project reference Sentry DSN, PostHog keys, etc.?
7. **Required env vars**: Parse `.env.example`, `.env.local.example`, or similar files to find all expected environment variables.

Detection strategy:
- Parse `package.json` for dependencies
- Scan `.env.example` / `.env.template` / `.env.local.example` for required variables
- Check for config files (`drizzle.config.ts`, `sentry.client.config.ts`, `next.config.js` with Sentry plugin, etc.)
- Check for known file patterns (`app/api/webhooks/stripe/route.ts`, `middleware.ts` with Clerk, etc.)

The output is a `ProjectScan` object that feeds into the planner.

### Step 2: Plan Generation

The planner takes the `ProjectScan` and produces a `RunPlan` — a DAG of tasks. This is a DETERMINISTIC rule engine, not an LLM call.

Rules:
- Project exists locally but no remote repo → add GitHub repo creation + initial push tasks
- Project already has a remote repo → skip repo creation, use existing remote
- Database env vars detected → add Neon provisioning tasks (create project, create database, produce DATABASE_URL)
- Auth env vars detected → add Clerk tasks (or flag for manual setup with guidance)
- Stripe env vars detected → add Stripe tasks (product, price, webhook, portal)
- Hosting needed → add Vercel tasks (create project, link repo, set env vars, deploy)
- For env vars that map to a known provider: auto-generate the provisioning tasks
- For env vars that don't map to a known provider: flag them as "manual — user must supply value" and prompt during execution

### Step 3: Plan Review and Approval

Display the plan to the user in the terminal:
- Ordered list of tasks with descriptions
- Cost estimates where applicable (Neon free tier, Vercel free tier, Stripe test mode, etc.)
- Approval gates for billable resources or production actions
- Clear indication of which env vars will be auto-provisioned vs. which the user must supply manually

The user approves the plan before any external API calls are made.

### Step 4: Execution

The executor walks the DAG:
1. Find tasks with all dependencies satisfied
2. Execute via the appropriate provider pack
3. Verify the result
4. Persist state (checkpoint)
5. Move to next task

On failure: retry per policy, then surface clear error with remediation hint. User can resume from checkpoint after fixing the issue.

### Step 5: Result

At the end, print a summary:
- Live URL (Vercel preview or production)
- GitHub repo URL
- Database connection info (masked)
- List of all env vars that were set
- Any manual steps remaining

---

## Core Types (packages/types)

```typescript
// What the project scanner produces
interface ProjectScan {
  name: string;
  framework: 'nextjs' | 'remix' | 'astro' | 'node' | 'unknown';
  directory: string;
  hasGitRemote: boolean;
  gitRemoteUrl?: string;
  detectedProviders: DetectedProvider[];
  requiredEnvVars: EnvVarRequirement[];
  packageJson: Record<string, unknown>;
}

interface DetectedProvider {
  provider: string;        // 'neon' | 'clerk' | 'stripe' | 'vercel' | 'resend' | 'sentry' | 'posthog'
  confidence: 'high' | 'medium' | 'low';
  evidence: string[];      // what files/deps triggered detection
}

interface EnvVarRequirement {
  name: string;
  provider?: string;       // which provider generates this, if known
  source: string;          // where it was detected (.env.example, package.json, etc.)
  isAutoProvisionable: boolean;  // can Assembler generate this?
}

// Execution types (keep from original plan — these are solid)
type TaskStatus = 'pending' | 'running' | 'success' | 'failed' | 'skipped' | 'rolled_back' | 'awaiting_approval' | 'awaiting_operator';

interface Task {
  id: string;
  name: string;
  provider: string;
  action: string;
  params: Record<string, unknown>;
  dependsOn: string[];
  outputs: Record<string, unknown>;
  status: TaskStatus;
  risk: 'low' | 'medium' | 'high';
  requiresApproval: boolean;
  retryPolicy: { maxRetries: number; backoffMs: number };
  timeoutMs: number;
  error?: string;
  remediationHint?: string;
  startedAt?: Date;
  completedAt?: Date;
}

interface RunPlan {
  id: string;
  projectScan: ProjectScan;
  tasks: Task[];
  estimatedCostUsd: number;
  createdAt: Date;
  status: 'draft' | 'approved' | 'executing' | 'completed' | 'failed' | 'rolled_back';
}

// Provider contract
interface ProviderPack {
  name: string;
  actions: string[];
  preflight(creds: Credentials): Promise<PreflightResult>;  // validate creds BEFORE execution
  apply(task: Task, ctx: ExecutionContext): Promise<TaskResult>;
  verify(task: Task, ctx: ExecutionContext): Promise<VerifyResult>;
  rollback(task: Task, ctx: ExecutionContext): Promise<RollbackResult>;
}

// Preflight result — this is critical for the demo
interface PreflightResult {
  valid: boolean;
  errors: PreflightError[];
}

interface PreflightError {
  code: string;
  message: string;
  remediation: string;  // exact instructions for the user to fix this
  url?: string;         // direct link to the relevant settings page
}

interface ExecutionContext {
  runId: string;
  projectScan: ProjectScan;
  getOutput(taskId: string, key: string): unknown;
  getCredential(provider: string): Promise<Credentials>;
  log(level: 'info' | 'warn' | 'error', msg: string, meta?: object): void;
  emitEvent(event: RunEvent): void;
}
```

---

## CLI Commands (apps/cli)

### Demo-critical commands (implement these first)

| Command | Behavior |
| --- | --- |
| `assembler launch` | The primary command. Scans current directory, generates plan, asks for approval, executes. Combines init + execute into one flow. |
| `assembler creds add <provider>` | Guided credential setup. Opens the exact URL where the user generates their API key, explains what scopes/permissions are needed, waits for paste, validates immediately. |
| `assembler creds list` | Shows configured providers with validation status (valid/expired/missing scopes). Never shows raw key values. |
| `assembler status` | Shows current run status: completed tasks, pending tasks, failures, live URLs. |
| `assembler resume` | Resume a failed run from last checkpoint. |

### Post-demo commands (implement later)

| Command | Behavior |
| --- | --- |
| `assembler rollback` | Rollback the current run in reverse dependency order. |
| `assembler redeploy` | Trigger a fresh deployment for the current run's project. |
| `assembler plan` | Generate and display a plan without executing (dry run). |

### CLI UX

- Use `ora` for spinners during async operations
- Use `chalk` for colored output: green = success, yellow = approval prompt, red = error, cyan = info
- Approval prompts must be explicit y/n with clear descriptions
- Error output must always include a remediation hint — never just "failed"
- On successful completion, print a boxed summary with the live URL prominently displayed

---

## Provider Packs — Implementation Order for Demo

Only three providers are needed for the demo. Implement in this order:

### Provider 1: GitHub

Actions: `create-repo`, `push-code`, `configure-webhook`

Key behaviors:
- Create repo under the user's account (NOT an org unless specified)
- Initial commit of the user's existing project code
- Idempotent: if repo already exists from a retry, detect and continue
- Preflight: validate token has `repo` scope

Known issues from prior live testing (already fixed, preserve these fixes):
- Repo creation must be idempotent across retries
- Token scope validation is essential — `repo` scope required for creation

### Provider 2: Neon

Actions: `create-project`, `create-database`, `get-connection-string`

Key behaviors:
- Create Neon project, create database within it
- Return both pooled and direct connection strings
- Inject DATABASE_URL (and DIRECT_DATABASE_URL if needed) into execution context
- Preflight: validate API key is account-level, not project-scoped

Known issues from prior live testing (already fixed, preserve these fixes):
- Branch resolution must fall back to branch lookup if `branchId` not returned directly
- Database creation requires `database.owner_name` — resolve and submit correctly

### Provider 3: Vercel

Actions: `create-project`, `link-repo`, `set-env-vars`, `deploy`, `wait-for-ready`

Key behaviors:
- Create Vercel project linked to the GitHub repo (model as project creation with Git metadata, not a later patch)
- Set all environment variables from prior task outputs
- Trigger deployment
- Wait for deployment to reach ready state (poll with timeout)
- Return the live preview URL
- Preflight: validate token, check GitHub App installation status, check GitHub connection

Known issues from prior live testing (already fixed, preserve these fixes):
- Repository linking must be modeled as project creation with Git metadata
- Deploy payload requires `name` field
- Must wait for deployment readiness explicitly — do not assume deploy is instant

---

## Preflight Checks — Critical for Demo Reliability

Before ANY execution begins, run ALL provider preflight checks. This is the single most important quality-of-life feature for the demo.

```
$ assembler launch

Scanning project... ✓ Next.js app detected
Checking credentials...
  ✓ GitHub: token valid, repo scope confirmed
  ✓ Neon: account-level API key confirmed
  ✗ Vercel: GitHub App not installed

  → To fix: Install the Vercel GitHub App at https://github.com/apps/vercel
    Then run `assembler launch` again.
```

Fail fast. Fail clearly. Never discover a credential problem halfway through a run.

---

## State Store (SQLite)

Three tables:

1. **runs**: `id`, `project_scan` (JSON), `plan` (JSON), `status`, `created_at`, `updated_at`
2. **events**: `id`, `run_id`, `task_id`, `event_type`, `data` (JSON), `created_at` — append-only audit log
3. **credentials**: `provider`, `encrypted_value`, `metadata` (JSON), `created_at`, `updated_at`

On every task status change: UPDATE run + INSERT event in a single transaction. This enables resume.

Store location: `~/.assembler/state.db`
Credentials location: `~/.assembler/credentials.db` (separate file, stricter permissions)

---

## Demo Script — This Is What "Done" Looks Like

The demo should work exactly like this:

```bash
# 1. One-time credential setup (already done before demo)
assembler creds add github
assembler creds add neon
assembler creds add vercel

# 2. User has an existing Next.js project they built with Claude Code
cd ~/my-saas-app

# 3. One command to launch
assembler launch

# Output:
# Scanning project... ✓ Next.js app detected
# Detected services:
#   • Database: Neon (found DATABASE_URL in .env.example, drizzle.config.ts)
#   • Hosting: Vercel (Next.js project)
#
# Checking credentials...
#   ✓ GitHub: valid
#   ✓ Neon: valid
#   ✓ Vercel: valid
#
# Execution Plan:
#   1. Create GitHub repo 'my-saas-app'          [auto]
#   2. Push code to repo                         [auto]
#   3. Create Neon project 'my-saas-app'         [auto - free tier]
#   4. Create database                           [auto]
#   5. Create Vercel project                     [auto - free tier]
#   6. Link Vercel ↔ GitHub                      [auto]
#   7. Set environment variables (3 vars)        [auto]
#   8. Deploy to preview                         [auto]
#   9. Wait for deployment ready                 [auto]
#
# Estimated cost: $0.00 (all free tier)
# Proceed? (y/n): y
#
# Executing...
#   ✓ GitHub repo created: github.com/user/my-saas-app
#   ✓ Code pushed (47 files)
#   ✓ Neon project created
#   ✓ Database 'my-saas-app-db' created
#   ✓ Vercel project created
#   ✓ Repository linked
#   ✓ 3 environment variables set
#   ✓ Deployment triggered
#   ⠋ Waiting for deployment... (this may take 1-2 minutes)
#   ✓ Deployment ready!
#
# ┌──────────────────────────────────────────────────┐
# │                                                  │
# │   ✓ my-saas-app is live!                         │
# │                                                  │
# │   Preview:  https://my-saas-app.vercel.app       │
# │   Repo:     https://github.com/user/my-saas-app  │
# │   Database: Neon (connection string in Vercel)    │
# │                                                  │
# └──────────────────────────────────────────────────┘
```

---

## Implementation Priority Order

Given the one-week deadline, implement in this exact order. Each step should be a working, testable increment.

### Day 1-2: Foundation
1. Monorepo setup (Turborepo, TypeScript, Vitest)
2. Core types (packages/types)
3. CLI skeleton with commander.js (`assembler launch`, `assembler creds add/list`, `assembler status`, `assembler resume`)
4. SQLite state store
5. Credential store with basic encryption

### Day 3: Project Scanner + Planner
1. Project scanner — parse package.json, scan .env.example, detect framework and providers
2. Rule engine — convert ProjectScan into RunPlan DAG
3. Plan display in CLI with approval prompt

### Day 4: Executor + GitHub Provider
1. DAG executor with checkpoint/resume
2. GitHub provider pack (create-repo, push-code)
3. Preflight check for GitHub
4. Test: scan project → plan → create repo + push code

### Day 5: Neon + Vercel Providers
1. Neon provider pack (create-project, create-database, get-connection-string)
2. Vercel provider pack (create-project, link-repo, set-env-vars, deploy, wait-for-ready)
3. Preflight checks for both
4. Wire env var passing between providers (Neon DATABASE_URL → Vercel env vars)

### Day 6: End-to-End Integration
1. Full golden path test against real providers
2. Fix whatever breaks (there will be things)
3. Resume/checkpoint testing
4. Error messages and remediation hints

### Day 7: Demo Polish
1. CLI UX polish (spinners, colors, summary box)
2. Credential onboarding flow (`assembler creds add` with guided URLs and validation)
3. Dry run of the exact demo script above
4. Fix any remaining rough edges

---

## Critical Rules

1. **No code generation.** Assembler does not generate, scaffold, or modify the user's application code. It provisions infrastructure and deploys what already exists.
2. **No templates.** There is no golden-path template. The user's project is the input.
3. **Preflight before execution.** Always validate all credentials and prerequisites before making any API calls that create resources.
4. **Fail with remediation.** Every error message must include what went wrong AND how to fix it, including direct URLs where applicable.
5. **Idempotent operations.** Every provider action must handle retries gracefully. If a resource already exists from a previous attempt, detect it and continue.
6. **Checkpoint everything.** After every task status change, persist to SQLite. The user must be able to `assembler resume` after any failure.
7. **User's accounts, user's credentials.** All resources are created under the user's own provider accounts using their own API keys. Assembler never creates resources under its own accounts.
