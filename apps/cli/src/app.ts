import { execFile as execFileCb } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';

import {
  createAnthropicAppSpecParser,
  createAnthropicClient,
  createRunPlanFromProjectScan,
  createExecutor,
  planPrompt,
  scanProject,
  SqliteRunStateStore,
} from '@devassemble/core';
import { createProviderRegistry, NeonClient, VercelClient } from '@devassemble/providers';
import type { AppSpec, Credentials, DiscoveryResult, PreviewRecord, ProjectScan, RunEvent, RunPlan } from '@devassemble/types';

const STATE_DIRECTORY_NAME = '.devassemble';
const STATE_FILENAME = 'state.db';
const REQUIRED_LIVE_PROVIDERS = new Set(['clerk', 'cloudflare', 'github', 'neon', 'stripe', 'vercel']);

export interface LaunchResult {
  projectScan: ProjectScan;
  preflightResults: PreflightCheckResults;
  runPlan: RunPlan;
}

export interface CliApp {
  scan(): Promise<ProjectScan>;
  createPlan(projectScan: ProjectScan): RunPlan;
  preflight(runPlan: RunPlan): Promise<PreflightCheckResults>;
  executePlan(runPlan: RunPlan): Promise<RunPlan>;
  launch(): Promise<LaunchResult>;
  init(prompt: string): Promise<RunPlan>;
  execute(runId?: string): Promise<RunPlan>;
  status(runId?: string): Promise<RunPlan>;
  events(runId?: string): Promise<RunEvent[]>;
  resume(runId: string): Promise<RunPlan>;
  rollback(runId: string): Promise<RunPlan>;
  envPull(runId?: string): Promise<EnvPullResult>;
  envPush(runId?: string): Promise<EnvPushResult>;
  setup(): Promise<SetupResult>;
  preview(branchName?: string): Promise<PreviewResult>;
  previewTeardown(branchName?: string): Promise<PreviewTeardownResult>;
  domainAdd(domain: string): Promise<DomainAddResult>;
  addCredential(provider: string, entries: string[]): Promise<void>;
  listCredentials(): Promise<string[]>;
  discover(provider: string): Promise<DiscoveryResult>;
}

export interface PreviewResult {
  branchName: string;
  previewUrl?: string;
  databaseUrl?: string;
  neonBranchId?: string;
}

export interface PreviewTeardownResult {
  branchName: string;
  deletedBranch: boolean;
}

export interface DomainAddResult {
  domain: string;
  dnsRecordCreated: boolean;
  vercelDomainAdded: boolean;
  verified: boolean;
}

export interface EnvPullResult {
  filePath: string;
  variables: Record<string, string>;
  projectName: string;
}

export interface EnvPushResult {
  pushed: string[];
  projectName: string;
}

export interface SetupResult {
  projectScan: ProjectScan;
  vercelProjectName: string;
  envVarCount: number;
  envFilePath: string;
  missingCredentials: string[];
}

export function createCliApp(cwd = process.cwd()): CliApp {
  const stateStore = new SqliteRunStateStore({
    filename: resolveStateFile(cwd),
  });
  stateStore.initialize();
  const providerRegistry = createProviderRegistry();

  const executor = createExecutor({
    stateStore,
    providers: providerRegistry,
    credentialResolver: (provider, record): Promise<Credentials> =>
      Promise.resolve(resolveCredentials(provider, record)),
    sleep: (ms) => new Promise<void>((resolve) => setTimeout(resolve, ms)),
  });

  return {
    scan: async (): Promise<ProjectScan> => {
      return scanProject(cwd);
    },
    createPlan: (projectScan: ProjectScan): RunPlan => {
      const runPlan: RunPlan = {
        ...createRunPlanFromProjectScan(projectScan),
        status: 'approved',
      };
      stateStore.saveRun(runPlan);
      return runPlan;
    },
    preflight: async (runPlan: RunPlan): Promise<PreflightCheckResults> => {
      ensureLiveCredentials(runPlan, stateStore);
      return runPreflightChecks(runPlan, stateStore, providerRegistry);
    },
    executePlan: async (runPlan: RunPlan): Promise<RunPlan> => {
      const result = await executor.execute({ runPlan });
      return result.runPlan;
    },
    launch: async (): Promise<LaunchResult> => {
      const projectScan = await scanProject(cwd);
      const runPlan: RunPlan = {
        ...createRunPlanFromProjectScan(projectScan),
        status: 'approved',
      };

      stateStore.saveRun(runPlan);
      ensureLiveCredentials(runPlan, stateStore);
      const preflightResults = await runPreflightChecks(runPlan, stateStore, providerRegistry);

      const result = await executor.execute({
        runPlan,
      });

      return { projectScan, preflightResults, runPlan: result.runPlan };
    },
    init: async (prompt: string): Promise<RunPlan> => {
      const parser = process.env.ANTHROPIC_API_KEY
        ? createAnthropicAppSpecParser({
            client: createAnthropicClient(process.env.ANTHROPIC_API_KEY),
            model: process.env.DEVASSEMBLE_ANTHROPIC_MODEL ?? 'claude-sonnet-4-20250514',
          })
        : createHeuristicParser();

      const result = await planPrompt(prompt, {
        parser,
      });

      const approvedRunPlan: RunPlan = {
        ...result.runPlan,
        status: 'approved',
      };
      stateStore.saveRun(approvedRunPlan);

      return approvedRunPlan;
    },
    execute: async (runId?: string): Promise<RunPlan> => {
      const targetRunId = runId ?? findLatestRunId(stateStore);
      if (!targetRunId) {
        throw new Error('No runs found in the local state store.');
      }

      const runPlan = stateStore.loadRun(targetRunId);
      if (!runPlan) {
        throw new Error(`Run "${targetRunId}" was not found.`);
      }

      ensureLiveCredentials(runPlan, stateStore);

      const result = await executor.execute({
        runPlan:
          runPlan.status === 'draft'
            ? {
                ...runPlan,
                status: 'approved',
              }
            : runPlan,
      });

      return result.runPlan;
    },
    status: (runId?: string): Promise<RunPlan> => {
      return Promise.resolve(loadRun(stateStore, runId));
    },
    events: (runId?: string): Promise<RunEvent[]> =>
      Promise.resolve(stateStore.listEvents(loadRun(stateStore, runId).id)),
    resume: async (runId: string): Promise<RunPlan> => {
      const result = await executor.resume(runId);
      return result.runPlan;
    },
    rollback: async (runId: string): Promise<RunPlan> => executor.rollback(runId),
    setup: async (): Promise<SetupResult> => {
      // 1. Scan the project
      const projectScan = await scanProject(cwd);

      // 2. Check which credentials we have / are missing
      const detectedProviderNames = [
        ...new Set(projectScan.detectedProviders.map((p) => p.provider)),
      ].filter((p) => REQUIRED_LIVE_PROVIDERS.has(p));
      // Vercel is always needed for setup (even if not explicitly detected)
      if (!detectedProviderNames.includes('vercel')) {
        detectedProviderNames.push('vercel');
      }

      const missingCredentials = detectedProviderNames.filter(
        (p) => !stateStore.getCredentialRecord(p),
      );

      // 3. Must have Vercel credentials to proceed
      const vercelRecord = stateStore.getCredentialRecord('vercel');
      if (!vercelRecord) {
        throw new Error(
          'Vercel credentials are required for setup. Add them with "devassemble creds add vercel token=<tok>".',
        );
      }

      const vercelCreds = resolveCredentials('vercel', vercelRecord);
      const client = new VercelClient(vercelCreds);

      // 4. Find the Vercel project linked to this git remote
      let vercelProjectName: string | undefined;

      if (projectScan.gitRemoteUrl) {
        const repoUrl = normalizeGitUrl(projectScan.gitRemoteUrl);
        const { projects } = await client.listProjects({ repoUrl, limit: 1 });
        vercelProjectName = projects[0]?.name;
      }

      // Fallback: try project name directly
      if (!vercelProjectName) {
        try {
          const project = await client.getProject(toSlug(projectScan.name));
          vercelProjectName = project.name;
        } catch {
          // Project not found — that's fine, we'll throw below
        }
      }

      if (!vercelProjectName) {
        throw new Error(
          `Could not find a Vercel project linked to this repository. Run "devassemble launch" first to create one.`,
        );
      }

      // 5. Pull env vars
      const { envs } = await client.listProjectEnvVars(vercelProjectName);
      const variables: Record<string, string> = {};
      for (const env of envs) {
        if (env.value && env.key) {
          variables[env.key] = env.value;
        }
      }

      const envFilePath = resolve(cwd, '.env.local');
      const content = formatEnvFile(variables);
      writeFileSync(envFilePath, content, 'utf8');

      return {
        projectScan,
        vercelProjectName,
        envVarCount: Object.keys(variables).length,
        envFilePath,
        missingCredentials: missingCredentials.filter((p) => p !== 'vercel'),
      };
    },
    envPull: async (runId?: string): Promise<EnvPullResult> => {
      const { client, projectName } = resolveVercelProject(stateStore, runId);
      const { envs } = await client.listProjectEnvVars(projectName);

      const variables: Record<string, string> = {};
      for (const env of envs) {
        if (env.value && env.key) {
          variables[env.key] = env.value;
        }
      }

      const filePath = resolve(cwd, '.env.local');
      const content = formatEnvFile(variables);
      writeFileSync(filePath, content, 'utf8');

      return { filePath, variables, projectName };
    },
    envPush: async (runId?: string): Promise<EnvPushResult> => {
      const { client, projectName } = resolveVercelProject(stateStore, runId);
      const variables = readLocalEnvFile(cwd);

      if (Object.keys(variables).length === 0) {
        throw new Error(
          'No environment variables found. Create a .env.local or .env file first.',
        );
      }

      const allTargets: Array<'preview' | 'production'> = ['preview', 'production'];
      const pushed: string[] = [];

      for (const [key, value] of Object.entries(variables)) {
        await client.createProjectEnv(projectName, {
          key,
          value,
          target: allTargets,
          type: 'encrypted',
        });
        pushed.push(key);
      }

      return { pushed, projectName };
    },
    preview: async (branchName?: string): Promise<PreviewResult> => {
      const execFile = promisify(execFileCb);

      // Auto-detect branch if not provided
      if (!branchName) {
        const { stdout } = await execFile('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd });
        branchName = stdout.trim();
      }

      if (branchName === 'main' || branchName === 'master') {
        throw new Error(
          `Branch "${branchName}" is the production branch. Use "devassemble launch" instead, or switch to a feature branch.`,
        );
      }

      // Find the latest production run
      const latestRunId = findLatestRunId(stateStore);
      if (!latestRunId) {
        throw new Error('No launch run found. Run "devassemble launch" first.');
      }
      const run = stateStore.loadRun(latestRunId);
      if (!run) {
        throw new Error('Could not load the latest run.');
      }

      // Extract production info from run
      const vercelTask = run.tasks.find(
        (t) => t.provider === 'vercel' && t.action === 'create-project' && t.status === 'success',
      );
      if (!vercelTask) {
        throw new Error('No Vercel project found in the latest run.');
      }
      const vercelProjectId = String(vercelTask.outputs.projectId);
      const vercelProjectName = String(vercelTask.outputs.projectName ?? vercelTask.params.name);

      const githubTask = run.tasks.find(
        (t) => t.provider === 'github' && (t.action === 'create-repo' || t.action === 'use-existing-repo') && t.status === 'success',
      );
      if (!githubTask) {
        throw new Error('No GitHub repository found in the latest run.');
      }
      const repoId = githubTask.outputs.repoId;

      // Push branch to GitHub
      try {
        await execFile('git', ['push', '-u', 'origin', branchName], { cwd });
      } catch {
        // Branch may already be pushed — continue
      }

      // Get current SHA
      const { stdout: sha } = await execFile('git', ['rev-parse', 'HEAD'], { cwd });
      const commitSha = sha.trim();

      // Check if Neon exists in production run
      const neonTask = run.tasks.find(
        (t) => t.provider === 'neon' && t.action === 'create-project' && t.status === 'success',
      );

      // Build preview plan
      const previewTasks: import('@devassemble/types').Task[] = [];

      if (neonTask) {
        const neonProjectId = String(neonTask.outputs.projectId);
        previewTasks.push(makePreviewTask(
          'neon-create-preview-branch',
          'Create Neon database branch',
          'neon',
          'create-preview-branch',
          [],
          { projectId: neonProjectId, branchName },
          'medium',
        ));
        previewTasks.push(makePreviewTask(
          'vercel-set-preview-env-var',
          'Set preview DATABASE_URL',
          'vercel',
          'set-preview-env-var',
          ['neon-create-preview-branch'],
          { projectId: vercelProjectId, key: 'DATABASE_URL', value: '__PLACEHOLDER__' },
        ));
      }

      const deployDependencies = neonTask
        ? ['vercel-set-preview-env-var']
        : [];

      previewTasks.push(makePreviewTask(
        'vercel-deploy-branch-preview',
        `Deploy preview for ${branchName}`,
        'vercel',
        'deploy-branch-preview',
        deployDependencies,
        {
          projectName: vercelProjectName,
          projectId: vercelProjectId,
          repoId,
          ref: branchName,
          sha: commitSha,
        },
      ));
      previewTasks.push(makePreviewTask(
        'vercel-wait-for-ready',
        'Wait for preview deployment',
        'vercel',
        'wait-for-ready',
        ['vercel-deploy-branch-preview'],
        {},
      ));

      const previewPlan: RunPlan = {
        id: crypto.randomUUID(),
        tasks: previewTasks,
        estimatedCostUsd: 0,
        createdAt: new Date(),
        status: 'approved',
      };

      stateStore.saveRun(previewPlan);

      // If Neon branch, we need to update the DATABASE_URL after the branch is created
      // We do this by hooking into the executor's task output system
      const result = await executor.execute({ runPlan: previewPlan });

      // Extract results
      const neonBranchTask = result.runPlan.tasks.find((t: import('@devassemble/types').Task) => t.id === 'neon-create-preview-branch');
      const deployTask = result.runPlan.tasks.find((t: import('@devassemble/types').Task) => t.id === 'vercel-deploy-branch-preview');
      const waitTask = result.runPlan.tasks.find((t: import('@devassemble/types').Task) => t.id === 'vercel-wait-for-ready');

      const previewUrl =
        (waitTask?.outputs.previewUrl as string | undefined) ??
        (deployTask?.outputs.previewUrl as string | undefined);
      const databaseUrl = neonBranchTask?.outputs.databaseUrl as string | undefined;

      // Save preview record
      const previewRecord: PreviewRecord = {
        id: crypto.randomUUID(),
        parentRunId: latestRunId,
        branchName,
        previewRunId: previewPlan.id,
        neonBranchId: neonBranchTask?.outputs.branchId as string | undefined,
        neonProjectId: neonBranchTask?.outputs.projectId as string | undefined,
        vercelDeploymentId: deployTask?.outputs.deploymentId as string | undefined,
        previewUrl,
        createdAt: new Date().toISOString(),
        status: 'active',
      };
      stateStore.savePreview(previewRecord);

      return {
        branchName,
        ...(previewUrl ? { previewUrl } : {}),
        ...(databaseUrl ? { databaseUrl } : {}),
        ...(neonBranchTask?.outputs.branchId ? { neonBranchId: String(neonBranchTask.outputs.branchId) } : {}),
      };
    },
    previewTeardown: async (branchName?: string): Promise<PreviewTeardownResult> => {
      const execFile = promisify(execFileCb);

      // Auto-detect branch if not provided
      if (!branchName) {
        const { stdout } = await execFile('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd });
        branchName = stdout.trim();
      }

      const previewRecord = stateStore.loadPreview(branchName);
      if (!previewRecord) {
        throw new Error(
          `No active preview found for branch "${branchName}". Run "devassemble preview" first.`,
        );
      }

      let deletedBranch = false;

      // Delete Neon branch if it exists
      if (previewRecord.neonProjectId && previewRecord.neonBranchId) {
        try {
          const neonCreds = resolveCredentials('neon', stateStore.getCredentialRecord('neon'));
          const neonClient = new NeonClient(neonCreds);
          await neonClient.deleteBranch(previewRecord.neonProjectId, previewRecord.neonBranchId);
          deletedBranch = true;
        } catch {
          // Branch may already be deleted
        }
      }

      stateStore.updatePreviewStatus(previewRecord.id, 'torn_down');

      return {
        branchName,
        deletedBranch,
      };
    },
    domainAdd: async (domain: string): Promise<DomainAddResult> => {
      // Load latest run to get Vercel project ID
      const latestRunId = findLatestRunId(stateStore);
      if (!latestRunId) {
        throw new Error('No launch run found. Run "devassemble launch" first to create a project.');
      }
      const run = stateStore.loadRun(latestRunId);
      if (!run) {
        throw new Error('Could not load the latest run.');
      }

      const vercelTask = run.tasks.find(
        (t) => t.provider === 'vercel' && t.action === 'create-project' && t.status === 'success',
      );
      if (!vercelTask) {
        throw new Error('No Vercel project found in the latest run. Run "devassemble launch" first.');
      }
      const projectId = String(vercelTask.outputs.projectId);

      // Run preflight for cloudflare
      const cfPack = providerRegistry.cloudflare;
      if (!cfPack) throw new Error('Cloudflare provider not registered.');

      const cfCreds = resolveCredentials('cloudflare', stateStore.getCredentialRecord('cloudflare'));
      if (cfPack.preflight) {
        const cfPreflight = await cfPack.preflight(cfCreds);
        if (!cfPreflight.valid) {
          const messages = cfPreflight.errors.map((e) => `${e.message}\n  → ${e.remediation}`).join('\n');
          throw new Error(`Cloudflare preflight failed:\n${messages}`);
        }
      }

      // Build and execute a mini domain plan
      const domainPlan = createDomainPlan(domain, projectId, run.id);
      stateStore.saveRun(domainPlan);

      const result = await executor.execute({ runPlan: domainPlan });

      const dnsTask = result.runPlan.tasks.find((t: import('@devassemble/types').Task) => t.id === 'cloudflare-create-dns-record');
      const vercelDomainTask = result.runPlan.tasks.find((t: import('@devassemble/types').Task) => t.id === 'vercel-add-domain');
      const verifyTask = result.runPlan.tasks.find((t: import('@devassemble/types').Task) => t.id === 'cloudflare-verify-dns');

      return {
        domain,
        dnsRecordCreated: dnsTask?.status === 'success',
        vercelDomainAdded: vercelDomainTask?.status === 'success',
        verified: verifyTask?.outputs.verified === true,
      };
    },
    addCredential: (provider: string, entries: string[]): Promise<void> => {
      const parsed = parseCredentialInput(entries);
      stateStore.putCredentialRecord({
        provider,
        reference: parsed.reference,
        ...(Object.keys(parsed.metadata).length > 0 ? { metadata: parsed.metadata } : {}),
      });
      return Promise.resolve();
    },
    listCredentials: (): Promise<string[]> =>
      Promise.resolve(stateStore.listCredentialRecords().map((record) => record.provider)),
    discover: async (provider: string): Promise<DiscoveryResult> => {
      const pack = providerRegistry[provider];
      if (!pack) {
        throw new Error(`Provider "${provider}" is not registered.`);
      }

      return pack.discover(resolveCredentials(provider, stateStore.getCredentialRecord(provider)));
    },
  };
}

function resolveStateFile(cwd: string): string {
  const preferredDirectory = resolve(cwd, STATE_DIRECTORY_NAME);
  mkdirSync(preferredDirectory, { recursive: true });
  return join(preferredDirectory, STATE_FILENAME);
}

function createHeuristicParser(): {
  parse(prompt: string): Promise<{
    appSpec: AppSpec;
    assumptions: Array<{ code: string; message: string }>;
  }>;
} {
  return {
    parse: (prompt: string) => Promise.resolve((() => {
      const normalizedPrompt = prompt.trim();
      const slug = normalizedPrompt
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 40) || 'devassemble-app';
      const mentionsPayments =
        /\b(subscription|subscriptions|billing|payments|payment|stripe)\b/i.test(prompt);

      return {
        appSpec: {
          name: slug,
          description: normalizedPrompt,
          auth: {
            provider: 'clerk',
            strategy: /google/i.test(prompt) ? 'google' : 'email',
          },
          billing: {
            provider: 'stripe',
            mode: mentionsPayments ? 'subscription' : 'none',
          },
          database: {
            provider: 'neon',
          },
          email: {
            provider: 'resend',
          },
          monitoring: {
            errorTracking: 'sentry',
            analytics: 'posthog',
          },
          hosting: {
            provider: 'vercel',
          },
          dns: {
            provider: 'cloudflare',
          },
        },
        assumptions: mentionsPayments
          ? [
              {
                code: 'billing.defaulted_to_subscription',
                message:
                  'Anthropic API key was not configured, so the CLI defaulted billing.mode to subscription from the prompt text.',
              },
            ]
          : [],
      };
    })()),
  };
}

function findLatestRunId(stateStore: SqliteRunStateStore): string | undefined {
  return stateStore.listRuns()[0]?.id;
}

function loadRun(stateStore: SqliteRunStateStore, runId?: string): RunPlan {
  const targetRunId = runId ?? findLatestRunId(stateStore);
  if (!targetRunId) {
    throw new Error('No runs found in the local state store.');
  }

  const runPlan = stateStore.loadRun(targetRunId);
  if (!runPlan) {
    throw new Error(`Run "${targetRunId}" was not found.`);
  }

  return runPlan;
}

function parseCredentialInput(entries: string[]): {
  reference: string;
  metadata: Record<string, string>;
} {
  if (entries.length === 0) {
    throw new Error('At least one credential value is required.');
  }

  const [firstEntry] = entries;
  if (!firstEntry) {
    throw new Error('At least one credential value is required.');
  }

  if (entries.length === 1 && !firstEntry.includes('=')) {
    return {
      reference: firstEntry,
      metadata: {},
    };
  }

  const metadata: Record<string, string> = {};
  let reference: string | undefined;

  for (const entry of entries) {
    const separatorIndex = entry.indexOf('=');
    if (separatorIndex <= 0) {
      throw new Error(
        'Structured credentials must use key=value entries, for example "token=abc" "teamId=team_123".',
      );
    }

    const key = entry.slice(0, separatorIndex).trim();
    const value = entry.slice(separatorIndex + 1).trim();
    if (key === '' || value === '') {
      throw new Error(`Invalid credential entry "${entry}". Expected non-empty key=value.`);
    }

    if (key === 'token') {
      reference = value;
      continue;
    }

    metadata[key] = value;
  }

  return {
    reference: reference ?? '',
    metadata,
  };
}

function makePreviewTask(
  id: string,
  name: string,
  provider: string,
  action: string,
  dependsOn: string[],
  params: Record<string, unknown>,
  risk: 'low' | 'medium' | 'high' = 'low',
): import('@devassemble/types').Task {
  return {
    id,
    name,
    provider,
    action,
    params,
    dependsOn,
    outputs: {},
    status: 'pending',
    risk,
    requiresApproval: false,
    retryPolicy: { maxRetries: 2, backoffMs: 1_000 },
    timeoutMs: 120_000,
  };
}

function createDomainPlan(domain: string, vercelProjectId: string, parentRunId: string): RunPlan {
  const makeDomainTask = (
    id: string,
    name: string,
    provider: string,
    action: string,
    dependsOn: string[],
    params: Record<string, unknown>,
    risk: 'low' | 'medium' | 'high' = 'medium',
  ): import('@devassemble/types').Task => ({
    id,
    name,
    provider,
    action,
    params,
    dependsOn,
    outputs: {},
    status: 'pending',
    risk,
    requiresApproval: true,
    retryPolicy: { maxRetries: 1, backoffMs: 1_000 },
    timeoutMs: 30_000,
  });

  return {
    id: crypto.randomUUID(),
    tasks: [
      makeDomainTask(
        'cloudflare-lookup-zone',
        'Look up Cloudflare DNS zone',
        'cloudflare',
        'lookup-zone',
        [],
        { domain },
      ),
      makeDomainTask(
        'cloudflare-create-dns-record',
        'Create DNS record pointing to Vercel',
        'cloudflare',
        'create-dns-record',
        ['cloudflare-lookup-zone'],
        { domain, content: 'cname.vercel-dns.com' },
        'high',
      ),
      makeDomainTask(
        'vercel-add-domain',
        'Add domain to Vercel project',
        'vercel',
        'add-domain',
        ['cloudflare-create-dns-record'],
        { domain, projectId: vercelProjectId },
        'high',
      ),
      makeDomainTask(
        'cloudflare-verify-dns',
        'Verify DNS configuration',
        'cloudflare',
        'verify-dns',
        ['vercel-add-domain'],
        { domain },
      ),
    ],
    estimatedCostUsd: 0,
    createdAt: new Date(),
    status: 'approved',
  };
}

function resolveCredentials(
  provider: string,
  record?: {
    provider: string;
    reference: string;
    metadata?: Record<string, unknown>;
  },
): Credentials {
  const values: Record<string, string> = {};
  if (record?.reference) {
    values.token = record.reference;
  }

  for (const [key, value] of Object.entries(record?.metadata ?? {})) {
    if (typeof value === 'string' && value.trim() !== '') {
      values[key] = value;
    }
  }

  return {
    provider,
    values,
  };
}

function ensureLiveCredentials(runPlan: RunPlan, stateStore: SqliteRunStateStore): void {
  const missing = [...new Set(runPlan.tasks.map((task) => task.provider))]
    .filter((provider) => REQUIRED_LIVE_PROVIDERS.has(provider))
    .filter((provider) => !stateStore.getCredentialRecord(provider));

  if (missing.length > 0) {
    throw new Error(
      `Missing required live credentials for: ${missing.join(', ')}. Add them with "devassemble creds add <provider> ...".`,
    );
  }
}

export interface PreflightCheckResults {
  results: Map<string, import('@devassemble/types').PreflightResult>;
  allValid: boolean;
}

export async function runPreflightChecks(
  runPlan: RunPlan,
  stateStore: SqliteRunStateStore,
  providerRegistry: ReturnType<typeof createProviderRegistry>,
): Promise<PreflightCheckResults> {
  const providers = [...new Set(runPlan.tasks.map((task) => task.provider))]
    .filter((provider) => REQUIRED_LIVE_PROVIDERS.has(provider));

  const results = new Map<string, import('@devassemble/types').PreflightResult>();

  for (const provider of providers) {
    const pack = providerRegistry[provider];
    if (!pack) {
      throw new Error(`Provider "${provider}" is not registered.`);
    }

    const credentials = resolveCredentials(provider, stateStore.getCredentialRecord(provider));
    if (pack.preflight) {
      const result = await pack.preflight(credentials);
      results.set(provider, result);
      continue;
    }

    const discovery = await pack.discover(credentials);
    results.set(provider, {
      valid: discovery.connected,
      errors: discovery.connected
        ? []
        : [
            {
              code: `${provider.toUpperCase()}_DISCOVERY_FAILED`,
              message: discovery.error ?? `Credential check failed for provider "${provider}".`,
              remediation: `Check your ${provider} credentials with "devassemble discover ${provider}".`,
            },
          ],
    });
  }

  const allValid = [...results.values()].every((r) => r.valid);

  if (!allValid) {
    const allErrors = [...results.entries()]
      .filter(([, r]) => !r.valid)
      .flatMap(([provider, r]) =>
        r.errors.map(
          (e) =>
            `[${provider}] ${e.message}\n  → ${e.remediation}${e.url ? `\n    ${e.url}` : ''}`,
        ),
      );
    throw new Error(`Preflight checks failed:\n\n${allErrors.join('\n\n')}`);
  }

  return { results, allValid };
}

function resolveVercelProject(
  stateStore: SqliteRunStateStore,
  runId?: string,
): { client: VercelClient; projectName: string } {
  const targetRunId = runId ?? stateStore.listRuns()[0]?.id;
  if (!targetRunId) {
    throw new Error('No runs found. Run "devassemble launch" first.');
  }

  const runPlan = stateStore.loadRun(targetRunId);
  if (!runPlan) {
    throw new Error(`Run "${targetRunId}" was not found.`);
  }

  const vercelTask =
    runPlan.tasks.find((t) => t.id === 'vercel-create-project' && t.status === 'success') ??
    runPlan.tasks.find((t) => t.id === 'vercel-link-repository' && t.status === 'success');

  const projectName =
    (vercelTask?.outputs.projectId as string | undefined) ??
    (vercelTask?.outputs.projectName as string | undefined);

  if (!projectName) {
    throw new Error(
      'No Vercel project found in this run. Run "devassemble launch" first to create one.',
    );
  }

  const vercelRecord = stateStore.getCredentialRecord('vercel');
  if (!vercelRecord) {
    throw new Error(
      'No Vercel credentials found. Add them with "devassemble creds add vercel token=<tok>".',
    );
  }

  const client = new VercelClient(resolveCredentials('vercel', vercelRecord));
  return { client, projectName };
}

function normalizeGitUrl(gitUrl: string): string {
  // Convert SSH format to HTTPS for Vercel API matching
  const sshMatch = gitUrl.match(/git@github\.com:(.+?)\/(.+?)(?:\.git)?$/);
  if (sshMatch) {
    return `https://github.com/${sshMatch[1]}/${sshMatch[2]}`;
  }
  return gitUrl.replace(/\.git$/, '');
}

function toSlug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 63) || 'devassemble-app';
}

function readLocalEnvFile(cwd: string): Record<string, string> {
  const candidates = ['.env.local', '.env'];
  for (const filename of candidates) {
    const filePath = resolve(cwd, filename);
    if (existsSync(filePath)) {
      return parseEnvFile(readFileSync(filePath, 'utf8'));
    }
  }
  return {};
}

function parseEnvFile(content: string): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIndex = trimmed.indexOf('=');
    if (eqIndex <= 0) continue;
    const key = trimmed.slice(0, eqIndex).trim();
    const value = trimmed.slice(eqIndex + 1).trim();
    if (key) vars[key] = value;
  }
  return vars;
}

function formatEnvFile(variables: Record<string, string>): string {
  const lines = ['# Generated by devassemble env pull', `# ${new Date().toISOString()}`, ''];
  const sorted = Object.entries(variables).sort(([a], [b]) => a.localeCompare(b));
  for (const [key, value] of sorted) {
    lines.push(`${key}=${value}`);
  }
  lines.push('');
  return lines.join('\n');
}
