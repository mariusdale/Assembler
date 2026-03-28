import { describe, expect, expectTypeOf, it } from 'vitest';

import type {
  AppSpec,
  ExecutionContext,
  ProviderPack,
  RunPlan,
  Task,
} from '../src/index.js';

const sampleAppSpec = {
  name: 'menugen',
  description: 'Restaurant menu generator SaaS',
  auth: {
    provider: 'clerk',
    strategy: 'both',
  },
  billing: {
    provider: 'stripe',
    mode: 'subscription',
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
  budgetCeiling: 250,
} satisfies AppSpec;

const sampleTask = {
  id: 'task_1',
  name: 'Create repository',
  provider: 'github',
  action: 'create-repo',
  params: {
    name: 'menugen',
  },
  dependsOn: [],
  outputs: {},
  status: 'pending',
  risk: 'low',
  requiresApproval: false,
  retryPolicy: {
    maxRetries: 2,
    backoffMs: 500,
  },
  timeoutMs: 5_000,
} satisfies Task;

const sampleRunPlan = {
  id: 'run_1',
  appSpec: sampleAppSpec,
  tasks: [sampleTask],
  estimatedCostUsd: 19,
  createdAt: new Date('2026-03-27T00:00:00.000Z'),
  status: 'draft',
} satisfies RunPlan;

const sampleContext: ExecutionContext = {
  runId: sampleRunPlan.id,
  appSpec: sampleAppSpec,
  projectScan: undefined,
  getOutput: () => undefined,
  getCredential: (provider) =>
    Promise.resolve({
      provider,
      values: {
        token: 'test-token',
      },
    }),
  log: () => undefined,
  emitEvent: () => undefined,
};

const sampleProviderPack: ProviderPack = {
  name: 'mock',
  actions: ['create'],
  discover: () =>
    Promise.resolve({
      connected: true,
      accountId: 'acct_123',
      accountName: 'Mock Account',
      metadata: {},
    }),
  plan: () =>
    Promise.resolve([
      {
        name: 'Create mock resource',
        provider: 'mock',
        action: 'create',
        params: {},
        risk: 'low',
        requiresApproval: false,
        retryPolicy: {
          maxRetries: 1,
          backoffMs: 100,
        },
        timeoutMs: 500,
      },
    ]),
  apply: (task) =>
    Promise.resolve({
      success: true,
      outputs: {
        taskId: task.id,
      },
    }),
  verify: () =>
    Promise.resolve({
      success: true,
    }),
  rollback: () =>
    Promise.resolve({
      success: true,
    }),
};

describe('shared contracts', () => {
  it('type-checks representative milestone 1 structures', async () => {
    expectTypeOf(sampleAppSpec).toMatchTypeOf<AppSpec>();
    expectTypeOf(sampleTask).toMatchTypeOf<Task>();
    expectTypeOf(sampleRunPlan).toMatchTypeOf<RunPlan>();
    expectTypeOf(sampleProviderPack).toMatchTypeOf<ProviderPack>();

    const discovery = await sampleProviderPack.discover({
      provider: 'mock',
      values: {
        token: 'test-token',
      },
    });
    const applyResult = await sampleProviderPack.apply(sampleTask, sampleContext);
    const verifyResult = await sampleProviderPack.verify(sampleTask, sampleContext);

    expect(discovery.connected).toBe(true);
    expect(applyResult.success).toBe(true);
    expect(applyResult.outputs.taskId).toBe(sampleTask.id);
    expect(verifyResult.success).toBe(true);
  });
});
