import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

import {
  createAnthropicAppSpecParser,
  createAnthropicClient,
  createExecutor,
  planPrompt,
  SqliteRunStateStore,
} from '@devassemble/core';
import { createProviderRegistry } from '@devassemble/providers';
import type { AppSpec, Credentials, RunPlan } from '@devassemble/types';

const STATE_DIRECTORY_NAME = '.devassemble';
const STATE_FILENAME = 'state.db';

export interface CliApp {
  init(prompt: string): Promise<RunPlan>;
  execute(runId?: string): Promise<RunPlan>;
  status(runId?: string): Promise<RunPlan>;
  resume(runId: string): Promise<RunPlan>;
  rollback(runId: string): Promise<RunPlan>;
  addCredential(provider: string, secret: string): Promise<void>;
  listCredentials(): Promise<string[]>;
}

export function createCliApp(cwd = process.cwd()): CliApp {
  const stateStore = new SqliteRunStateStore({
    filename: resolveStateFile(cwd),
  });
  stateStore.initialize();

  const executor = createExecutor({
    stateStore,
    providers: createProviderRegistry(),
    credentialResolver: (provider, record): Promise<Credentials> =>
      Promise.resolve({
        provider,
        values: {
          token: record?.reference ?? '',
        },
      }),
    sleep: () => Promise.resolve(),
  });

  return {
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
      const targetRunId = runId ?? findLatestRunId(stateStore);
      if (!targetRunId) {
        throw new Error('No runs found in the local state store.');
      }

      const runPlan = stateStore.loadRun(targetRunId);
      if (!runPlan) {
        throw new Error(`Run "${targetRunId}" was not found.`);
      }

      return Promise.resolve(runPlan);
    },
    resume: async (runId: string): Promise<RunPlan> => {
      const result = await executor.resume(runId);
      return result.runPlan;
    },
    rollback: async (runId: string): Promise<RunPlan> => executor.rollback(runId),
    addCredential: (provider: string, secret: string): Promise<void> => {
      stateStore.putCredentialRecord({
        provider,
        reference: secret,
      });
      return Promise.resolve();
    },
    listCredentials: (): Promise<string[]> =>
      Promise.resolve(stateStore.listCredentialRecords().map((record) => record.provider)),
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
