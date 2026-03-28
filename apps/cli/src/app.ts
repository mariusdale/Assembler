import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

import {
  createAnthropicAppSpecParser,
  createAnthropicClient,
  createRunPlanFromProjectScan,
  createExecutor,
  planPrompt,
  scanProject,
  SqliteRunStateStore,
} from '@devassemble/core';
import { createProviderRegistry } from '@devassemble/providers';
import type { AppSpec, Credentials, DiscoveryResult, ProjectScan, RunEvent, RunPlan } from '@devassemble/types';

const STATE_DIRECTORY_NAME = '.devassemble';
const STATE_FILENAME = 'state.db';
const REQUIRED_LIVE_PROVIDERS = new Set(['github', 'neon', 'vercel']);

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
  addCredential(provider: string, entries: string[]): Promise<void>;
  listCredentials(): Promise<string[]>;
  discover(provider: string): Promise<DiscoveryResult>;
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
