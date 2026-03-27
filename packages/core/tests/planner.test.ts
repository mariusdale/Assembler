import type { AppSpec } from '@devassemble/types';
import { describe, expect, it } from 'vitest';

import {
  APP_SPEC_TOOL_NAME,
  createAnthropicAppSpecParser,
  createRunPlan,
  DependencyGraphError,
  planPrompt,
  topologicallySortTasks,
} from '../src/index.js';
import type { AnthropicMessagesClient } from '../src/index.js';

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
} satisfies AppSpec;

describe('planner parser', () => {
  it('parses a prompt into a valid AppSpec through Anthropic tool use', async () => {
    const client: AnthropicMessagesClient = {
      messages: {
        create: () =>
          Promise.resolve({
            stop_reason: 'tool_use',
            content: [
              {
                type: 'tool_use',
                id: 'toolu_123',
                name: APP_SPEC_TOOL_NAME,
                input: {
                  appSpec: {
                    ...sampleAppSpec,
                    billing: {
                      provider: 'stripe',
                      mode: 'subscription',
                    },
                  },
                  assumptions: [
                    {
                      code: 'billing.defaulted_to_subscription',
                      message: 'Defaulted billing.mode to subscription because the prompt only mentioned payments.',
                    },
                  ],
                },
              },
            ],
          }),
      },
    };

    const parser = createAnthropicAppSpecParser({
      client,
      model: 'claude-sonnet-4-20250514',
    });

    const result = await parser.parse(
      'build menugen — a restaurant menu generator SaaS with subscriptions',
    );

    expect(result.appSpec.billing.mode).toBe('subscription');
    expect(result.assumptions).toHaveLength(1);
  });
});

describe('planner rule engine', () => {
  it('generates a draft RunPlan with at least 15 tasks in dependency order', () => {
    const runPlan = createRunPlan(sampleAppSpec, {
      now: new Date('2026-03-27T00:00:00.000Z'),
      idGenerator: () => 'run_test',
    });

    expect(runPlan.id).toBe('run_test');
    expect(runPlan.status).toBe('draft');
    expect(runPlan.tasks.length).toBeGreaterThanOrEqual(15);

    const indexByTaskId = new Map(runPlan.tasks.map((task, index) => [task.id, index]));
    for (const task of runPlan.tasks) {
      for (const dependencyId of task.dependsOn) {
        expect(indexByTaskId.get(dependencyId)).toBeLessThan(indexByTaskId.get(task.id) ?? 0);
      }
    }

    expect(runPlan.tasks.find((task) => task.id === 'neon-create-project')?.requiresApproval).toBe(
      true,
    );
    expect(
      runPlan.tasks.find((task) => task.id === 'vercel-create-project')?.requiresApproval,
    ).toBe(true);
  });

  it('adds domain and postdeploy email tasks when a custom domain is present', () => {
    const runPlan = createRunPlan({
      ...sampleAppSpec,
      domain: 'menugen.app',
    });

    expect(runPlan.tasks.some((task) => task.id === 'cloudflare-add-domain')).toBe(true);
    expect(runPlan.tasks.some((task) => task.id === 'resend-verify-sending-domain')).toBe(true);
    expect(runPlan.tasks.some((task) => task.id === 'vercel-sync-postdeploy-env-vars')).toBe(
      true,
    );
  });

  it('omits Stripe tasks when billing is disabled', () => {
    const runPlan = createRunPlan({
      ...sampleAppSpec,
      billing: {
        provider: 'stripe',
        mode: 'none',
      },
    });

    expect(runPlan.tasks.some((task) => task.provider === 'stripe')).toBe(false);
  });

  it('detects cycles in a manually corrupted DAG', () => {
    const runPlan = createRunPlan(sampleAppSpec);
    const mutatedTasks = runPlan.tasks.map((task) =>
      task.id === 'github-create-repo'
        ? {
            ...task,
            dependsOn: ['vercel-deploy-preview'],
          }
        : task,
    );

    expect(() => topologicallySortTasks(mutatedTasks)).toThrow(DependencyGraphError);
  });

  it('builds a combined planner result from a parser', async () => {
    const parser = {
      parse: () =>
        Promise.resolve({
          appSpec: sampleAppSpec,
          assumptions: [],
        }),
    };

    const result = await planPrompt('build menugen', {
      parser,
      idGenerator: () => 'planned_run',
      now: new Date('2026-03-27T00:00:00.000Z'),
    });

    expect(result.runPlan.id).toBe('planned_run');
    expect(result.runPlan.appSpec.name).toBe('menugen');
  });
});
