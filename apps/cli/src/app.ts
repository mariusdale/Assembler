import { execFile as execFileCb } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { promisify } from 'node:util';

import {
  createRunPlanFromProjectScan,
  createExecutor,
  scanProject,
} from '@assembler/core';
import { createProviderRegistry, NeonClient, VercelClient } from '@assembler/providers';
import type { Credentials, DiscoveryResult, PreviewRecord, ProjectScan, RunEvent, RunPlan } from '@assembler/types';

import { createStateStore, type LocalStateStore } from './state-store.js';

const REQUIRED_LIVE_PROVIDERS = new Set(['clerk', 'cloudflare', 'github', 'neon', 'resend', 'sentry', 'stripe', 'vercel']);

export interface LaunchResult {
  projectScan: ProjectScan;
  preflightResults: PreflightCheckResults;
  runPlan: RunPlan;
}

export interface DoctorCheckResult {
  provider: string;
  hasCredentials: boolean;
  preflightResult?: import('@assembler/types').PreflightResult;
}

export interface DoctorResult {
  nodeVersion: string;
  checks: DoctorCheckResult[];
  allHealthy: boolean;
}

export interface CliApp {
  scan(): Promise<ProjectScan>;
  createPlan(projectScan: ProjectScan, options?: { useExistingRepo?: boolean }): RunPlan;
  preflight(runPlan: RunPlan): Promise<PreflightCheckResults>;
  executePlan(runPlan: RunPlan): Promise<RunPlan>;
  launch(): Promise<LaunchResult>;
  execute(runId?: string): Promise<RunPlan>;
  status(runId?: string): Promise<RunPlan>;
  listRuns(): Promise<RunPlan[]>;
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
  doctor(): Promise<DoctorResult>;
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
  const stateStore = createStateStore(cwd);
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
    createPlan: (projectScan: ProjectScan, planOptions?: { useExistingRepo?: boolean }): RunPlan => {
      const runPlan: RunPlan = {
        ...createRunPlanFromProjectScan(projectScan, planOptions),
        status: 'approved',
      };
      stateStore.saveRun(runPlan);
      return runPlan;
    },
    preflight: async (runPlan: RunPlan): Promise<PreflightCheckResults> => {
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
      const preflightResults = await runPreflightChecks(runPlan, stateStore, providerRegistry);
      if (!preflightResults.allValid) {
        throw new Error(formatPreflightFailures(preflightResults));
      }

      const result = await executor.execute({
        runPlan,
      });

      return { projectScan, preflightResults, runPlan: result.runPlan };
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

      const preflightResults = await runPreflightChecks(runPlan, stateStore, providerRegistry);
      if (!preflightResults.allValid) {
        throw new Error(formatPreflightFailures(preflightResults));
      }

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
    listRuns: (): Promise<RunPlan[]> => Promise.resolve(stateStore.listRuns()),
    events: (runId?: string): Promise<RunEvent[]> =>
      Promise.resolve(stateStore.listEvents(loadRun(stateStore, runId).id)),
    resume: async (runId: string): Promise<RunPlan> => {
      const result = await executor.resume(runId);
      return result.runPlan;
    },
    rollback: async (runId: string): Promise<RunPlan> => executor.rollback(runId),
    setup: async (): Promise<SetupResult> => {
      const projectScan = await scanProject(cwd);

      const detectedProviderNames = [
        ...new Set(projectScan.detectedProviders.map((p) => p.provider)),
      ].filter((p) => REQUIRED_LIVE_PROVIDERS.has(p));
      if (!detectedProviderNames.includes('vercel')) {
        detectedProviderNames.push('vercel');
      }

      const missingCredentials = detectedProviderNames.filter(
        (p) => !stateStore.getCredentialRecord(p),
      );

      const vercelRecord = stateStore.getCredentialRecord('vercel');
      if (!vercelRecord) {
        throw new Error(
          'Vercel credentials are required for setup. Add them with "assembler creds add vercel token=<tok>".',
        );
      }

      const vercelCreds = resolveCredentials('vercel', vercelRecord);
      const client = new VercelClient(vercelCreds);

      let vercelProjectName: string | undefined;

      if (projectScan.gitRemoteUrl) {
        const repoUrl = normalizeGitUrl(projectScan.gitRemoteUrl);
        const { projects } = await client.listProjects({ repoUrl, limit: 1 });
        vercelProjectName = projects[0]?.name;
      }

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
          'Could not find a Vercel project linked to this repository. Run "assembler launch" first to create one.',
        );
      }

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

      if (!branchName) {
        const { stdout } = await execFile('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd });
        branchName = stdout.trim();
      }

      if (branchName === 'main' || branchName === 'master') {
        throw new Error(
          `Branch "${branchName}" is the production branch. Use "assembler launch" instead, or switch to a feature branch.`,
        );
      }

      const latestRunId = findLatestRunId(stateStore);
      if (!latestRunId) {
        throw new Error('No launch run found. Run "assembler launch" first.');
      }
      const run = stateStore.loadRun(latestRunId);
      if (!run) {
        throw new Error('Could not load the latest run.');
      }

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

      try {
        await execFile('git', ['push', '-u', 'origin', branchName], { cwd });
      } catch {
        // Branch may already be pushed — continue
      }

      const { stdout: sha } = await execFile('git', ['rev-parse', 'HEAD'], { cwd });
      const commitSha = sha.trim();

      const neonTask = run.tasks.find(
        (t) => t.provider === 'neon' && t.action === 'create-project' && t.status === 'success',
      );

      const previewTasks: import('@assembler/types').Task[] = [];

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
          { projectId: vercelProjectId, key: 'DATABASE_URL' },
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

      const result = await executor.execute({ runPlan: previewPlan });

      const neonBranchTask = result.runPlan.tasks.find((t: import('@assembler/types').Task) => t.id === 'neon-create-preview-branch');
      const deployTask = result.runPlan.tasks.find((t: import('@assembler/types').Task) => t.id === 'vercel-deploy-branch-preview');
      const waitTask = result.runPlan.tasks.find((t: import('@assembler/types').Task) => t.id === 'vercel-wait-for-ready');

      const previewUrl =
        (waitTask?.outputs.previewUrl as string | undefined) ??
        (deployTask?.outputs.previewUrl as string | undefined);
      const databaseUrl = neonBranchTask?.outputs.databaseUrl as string | undefined;

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

      if (!branchName) {
        const { stdout } = await execFile('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd });
        branchName = stdout.trim();
      }

      const previewRecord = stateStore.loadPreview(branchName);
      if (!previewRecord) {
        throw new Error(
          `No active preview found for branch "${branchName}". Run "assembler preview" first.`,
        );
      }

      let deletedBranch = false;

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
      const latestRunId = findLatestRunId(stateStore);
      if (!latestRunId) {
        throw new Error('No launch run found. Run "assembler launch" first to create a project.');
      }
      const run = stateStore.loadRun(latestRunId);
      if (!run) {
        throw new Error('Could not load the latest run.');
      }

      const vercelTask = run.tasks.find(
        (t) => t.provider === 'vercel' && t.action === 'create-project' && t.status === 'success',
      );
      if (!vercelTask) {
        throw new Error('No Vercel project found in the latest run. Run "assembler launch" first.');
      }
      const projectId = String(vercelTask.outputs.projectId);

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

      const domainPlan = createDomainPlan(domain, projectId);
      stateStore.saveRun(domainPlan);

      const result = await executor.execute({ runPlan: domainPlan });

      const dnsTask = result.runPlan.tasks.find((t: import('@assembler/types').Task) => t.id === 'cloudflare-create-dns-record');
      const vercelDomainTask = result.runPlan.tasks.find((t: import('@assembler/types').Task) => t.id === 'vercel-add-domain');
      const verifyTask = result.runPlan.tasks.find((t: import('@assembler/types').Task) => t.id === 'cloudflare-verify-dns');

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
    doctor: async (): Promise<DoctorResult> => {
      const allProviders = ['github', 'neon', 'vercel', 'clerk', 'stripe', 'sentry', 'resend', 'cloudflare'];
      const checks: DoctorCheckResult[] = [];

      for (const provider of allProviders) {
        const record = stateStore.getCredentialRecord(provider);
        const hasCredentials = !!record;
        const check: DoctorCheckResult = { provider, hasCredentials };

        if (hasCredentials) {
          const pack = providerRegistry[provider];
          if (pack?.preflight) {
            try {
              check.preflightResult = await pack.preflight(
                resolveCredentials(provider, record),
              );
            } catch {
              check.preflightResult = {
                valid: false,
                errors: [{
                  code: `${provider.toUpperCase()}_PREFLIGHT_ERROR`,
                  message: 'Preflight check failed unexpectedly.',
                  remediation: 'Check your network connection and try again.',
                }],
              };
            }
          }
        }

        checks.push(check);
      }

      return {
        nodeVersion: process.version,
        checks,
        allHealthy: checks
          .filter((c) => c.hasCredentials)
          .every((c) => c.preflightResult?.valid !== false),
      };
    },
  };
}

function findLatestRunId(stateStore: LocalStateStore): string | undefined {
  return stateStore.listRuns()[0]?.id;
}

function loadRun(stateStore: LocalStateStore, runId?: string): RunPlan {
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
): import('@assembler/types').Task {
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

function createDomainPlan(domain: string, vercelProjectId: string): RunPlan {
  const makeDomainTask = (
    id: string,
    name: string,
    provider: string,
    action: string,
    dependsOn: string[],
    params: Record<string, unknown>,
    risk: 'low' | 'medium' | 'high' = 'medium',
  ): import('@assembler/types').Task => ({
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

export interface PreflightCheckResults {
  results: Map<string, import('@assembler/types').PreflightResult>;
  allValid: boolean;
}

export async function runPreflightChecks(
  runPlan: RunPlan,
  stateStore: LocalStateStore,
  providerRegistry: ReturnType<typeof createProviderRegistry>,
): Promise<PreflightCheckResults> {
  const providers = [...new Set(runPlan.tasks.map((task) => task.provider))]
    .filter((provider) => REQUIRED_LIVE_PROVIDERS.has(provider));

  const results = new Map<string, import('@assembler/types').PreflightResult>();

  for (const provider of providers) {
    const pack = providerRegistry[provider];
    if (!pack) {
      throw new Error(`Provider "${provider}" is not registered.`);
    }

    const record = stateStore.getCredentialRecord(provider);
    if (!record) {
      results.set(provider, {
        valid: false,
        errors: [
          {
            code: `${provider.toUpperCase()}_TOKEN_MISSING`,
            message: `No ${provider} credential configured.`,
            remediation: `Add it with "assembler creds add ${provider} <token>".`,
          },
        ],
      });
      continue;
    }

    const credentials = resolveCredentials(provider, record);
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
              remediation: `Update the credential with "assembler creds add ${provider} <token>", then run "assembler doctor".`,
            },
          ],
    });
  }

  const allValid = [...results.values()].every((r) => r.valid);

  return { results, allValid };
}

function formatPreflightFailures(preflightResults: PreflightCheckResults): string {
  const allErrors = [...preflightResults.results.entries()]
    .filter(([, result]) => !result.valid)
    .flatMap(([provider, result]) =>
      result.errors.map(
        (error) =>
          `[${provider}] ${error.message}\n  → ${error.remediation}${error.url ? `\n    ${error.url}` : ''}`,
      ),
    );

  return `Preflight checks failed:\n\n${allErrors.join('\n\n')}`;
}

function resolveVercelProject(
  stateStore: LocalStateStore,
  runId?: string,
): { client: VercelClient; projectName: string } {
  const targetRunId = runId ?? stateStore.listRuns()[0]?.id;
  if (!targetRunId) {
    throw new Error('No runs found. Run "assembler launch" first.');
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
      'No Vercel project found in this run. Run "assembler launch" first to create one.',
    );
  }

  const vercelRecord = stateStore.getCredentialRecord('vercel');
  if (!vercelRecord) {
    throw new Error(
      'No Vercel credentials found. Add them with "assembler creds add vercel token=<tok>".',
    );
  }

  const client = new VercelClient(resolveCredentials('vercel', vercelRecord));
  return { client, projectName };
}

function normalizeGitUrl(gitUrl: string): string {
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
    .slice(0, 63) || 'assembler-app';
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
  const lines = ['# Generated by assembler env pull', `# ${new Date().toISOString()}`, ''];
  const sorted = Object.entries(variables).sort(([a], [b]) => a.localeCompare(b));
  for (const [key, value] of sorted) {
    lines.push(`${key}=${value}`);
  }
  lines.push('');
  return lines.join('\n');
}
