import { describe, expect, expectTypeOf, it } from 'vitest';

import type {
  ExecutionContext,
  ProjectScan,
  ProviderPack,
  RunPlan,
  Task,
} from '../src/index.js';

const sampleProjectScan = {
  name: 'menugen',
  framework: 'nextjs',
  directory: '/tmp/menugen',
  hasGitRemote: true,
  gitRemoteUrl: 'git@github.com:mariusdale/menugen.git',
  detectedProviders: [
    {
      provider: 'vercel',
      confidence: 'high',
      evidence: ['package.json: dependency next'],
    },
  ],
  requiredEnvVars: [],
  packageJson: {
    name: 'menugen',
  },
  lockfileCheck: {
    packageManager: 'pnpm',
    lockfileExists: true,
    inSync: true,
    missingFromLockfile: [],
    extraInLockfile: [],
  },
} satisfies ProjectScan;

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
  projectScan: sampleProjectScan,
  tasks: [sampleTask],
  estimatedCostUsd: 0,
  createdAt: new Date('2026-03-27T00:00:00.000Z'),
  status: 'draft',
} satisfies RunPlan;

const sampleContext: ExecutionContext = {
  runId: sampleRunPlan.id,
  projectScan: sampleProjectScan,
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
  it('type-checks representative scan-driven structures', async () => {
    expectTypeOf(sampleProjectScan).toMatchTypeOf<ProjectScan>();
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
