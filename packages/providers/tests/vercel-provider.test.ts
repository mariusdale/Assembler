import type { AppSpec, Credentials, ExecutionContext, Task } from '@devassemble/types';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { vercelProviderPack } from '../src/vercel/index.js';

const sampleAppSpec: AppSpec = {
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
};

describe('vercel provider pack', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('creates, links, syncs env vars, and deploys a preview from github outputs', async () => {
    const requests: Array<{ url: string; method: string; body?: string }> = [];

    vi.stubGlobal(
      'fetch',
      vi.fn((input: string | URL, init?: RequestInit) => {
        const url = input.toString();
        requests.push({
          url,
          method: init?.method ?? 'GET',
          ...(typeof init?.body === 'string' ? { body: init.body } : {}),
        });

        if (url.includes('/v11/projects') && init?.method === 'POST') {
          const body = typeof init.body === 'string' ? init.body : '';
          const parsed = body === '' ? {} : JSON.parse(body);

          return Promise.resolve(
            new Response(
              JSON.stringify({
                id: parsed.gitRepository ? 'prj_456' : 'prj_123',
                name: 'menugen',
                ...(parsed.gitRepository
                  ? {
                      link: {
                        repo: 'octocat/menugen',
                        repoId: 987,
                        productionBranch: 'main',
                      },
                    }
                  : {}),
              }),
              { status: 200 },
            ),
          );
        }

        if (url.includes('/v9/projects/menugen') && init?.method === 'GET') {
          return Promise.resolve(new Response('{"error":"not_found"}', { status: 404 }));
        }

        if (url.includes('/v9/projects/prj_123') && init?.method === 'GET') {
          return Promise.resolve(
            new Response(
              JSON.stringify({
                id: 'prj_123',
                name: 'menugen',
              }),
              { status: 200 },
            ),
          );
        }

        if (url.includes('/v9/projects/prj_123') && init?.method === 'DELETE') {
          return Promise.resolve(new Response('{}', { status: 200 }));
        }

        if (url.includes('/v10/projects/prj_456/env') && init?.method === 'POST') {
          return Promise.resolve(new Response('{}', { status: 200 }));
        }

        if (url.includes('/v13/deployments') && init?.method === 'POST') {
          return Promise.resolve(
            new Response(
              JSON.stringify({
                id: 'dpl_123',
                url: 'menugen-preview.vercel.app',
                readyState: 'READY',
              }),
              { status: 200 },
            ),
          );
        }

        if (url.includes('/v13/deployments/dpl_123') && init?.method === 'GET') {
          return Promise.resolve(
            new Response(
              JSON.stringify({
                id: 'dpl_123',
                url: 'menugen-preview.vercel.app',
                readyState: 'READY',
              }),
              { status: 200 },
            ),
          );
        }

        if (url.includes('/v9/projects/prj_456') && init?.method === 'GET') {
          return Promise.resolve(
            new Response(
              JSON.stringify({
                id: 'prj_456',
                name: 'menugen',
                link: {
                  repo: 'octocat/menugen',
                },
              }),
              { status: 200 },
            ),
          );
        }

        throw new Error(`Unexpected request: ${init?.method ?? 'GET'} ${url}`);
      }),
    );

    const context = createExecutionContext();

    const created = await vercelProviderPack.apply(createTask('create-project'), context);
    expect(created.outputs.projectId).toBe('prj_123');

    const linked = await vercelProviderPack.apply(createTask('link-repository'), context);
    expect(linked.outputs.linkedRepo).toBe('octocat/menugen');
    expect(linked.outputs.projectId).toBe('prj_456');

    const synced = await vercelProviderPack.apply(createTask('sync-predeploy-env-vars'), context);
    expect(Array.isArray(synced.outputs.syncedKeys)).toBe(true);

    const deployed = await vercelProviderPack.apply(createTask('deploy-preview'), context);
    expect(deployed.outputs.previewUrl).toBe('https://menugen-preview.vercel.app');

    const waited = await vercelProviderPack.apply(createTask('wait-for-ready'), context);
    expect(waited.outputs.readyState).toBe('READY');

    const verified = await vercelProviderPack.verify(
      {
        ...createTask('wait-for-ready'),
        outputs: waited.outputs,
      },
      context,
    );

    expect(verified.success).toBe(true);
    expect(requests.some((request) => request.url.includes('/v11/projects'))).toBe(true);
    expect(
      requests.some(
        (request) =>
          request.url.includes('/v9/projects/prj_123') &&
          request.method === 'DELETE',
      ),
    ).toBe(true);
    expect(
      requests.some(
        (request) =>
          request.url.includes('/v11/projects') &&
          request.method === 'POST' &&
          (request.body?.includes('"gitRepository"') ?? false),
      ),
    ).toBe(true);
    expect(
      requests.some(
        (request) =>
          request.url.includes('/v13/deployments') &&
          request.method === 'POST' &&
          (request.body?.includes('"repoId":"987"') ?? false),
      ),
    ).toBe(true);
  });

  it('resolves preview DATABASE_URL from the Neon preview branch output', async () => {
    const requests: Array<{ url: string; method: string; body?: string }> = [];

    vi.stubGlobal(
      'fetch',
      vi.fn((input: string | URL, init?: RequestInit) => {
        const url = input.toString();
        requests.push({
          url,
          method: init?.method ?? 'GET',
          ...(typeof init?.body === 'string' ? { body: init.body } : {}),
        });

        if (url.includes('/v10/projects/prj_456/env') && init?.method === 'POST') {
          return Promise.resolve(new Response('{}', { status: 200 }));
        }

        throw new Error(`Unexpected request: ${init?.method ?? 'GET'} ${url}`);
      }),
    );

    const result = await vercelProviderPack.apply(
      {
        ...createTask('set-preview-env-var'),
        params: {
          projectId: 'prj_456',
          key: 'DATABASE_URL',
        },
      },
      createExecutionContext(),
    );

    expect(result.success).toBe(true);
    expect(
      requests.some(
        (request) =>
          request.url.includes('/v10/projects/prj_456/env') &&
          request.method === 'POST' &&
          (request.body?.includes('"value":"postgres://preview-branch"') ?? false),
      ),
    ).toBe(true);
  });

  it('waits for branch preview deployments using the branch preview task output', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((input: string | URL, init?: RequestInit) => {
        const url = input.toString();

        if (url.includes('/v13/deployments/dpl_branch_123') && init?.method === 'GET') {
          return Promise.resolve(
            new Response(
              JSON.stringify({
                id: 'dpl_branch_123',
                url: 'menugen-branch-preview.vercel.app',
                readyState: 'READY',
              }),
              { status: 200 },
            ),
          );
        }

        throw new Error(`Unexpected request: ${init?.method ?? 'GET'} ${url}`);
      }),
    );

    const baseContext = createExecutionContext();
    const result = await vercelProviderPack.apply(
      {
        ...createTask('wait-for-ready'),
        params: {},
      },
      {
        ...baseContext,
        getOutput(taskId: string, key: string): unknown {
          if (taskId === 'vercel-deploy-preview' && key === 'deploymentId') {
            return undefined;
          }

          return baseContext.getOutput(taskId, key);
        },
      },
    );

    expect(result.outputs.deploymentId).toBe('dpl_branch_123');
    expect(result.outputs.previewUrl).toBe('https://menugen-branch-preview.vercel.app');
  });
});

function createTask(action: Task['action']): Task {
  return {
    id: `vercel-${action}`,
    name: `Vercel ${action}`,
    provider: 'vercel',
    action,
    params: {
      name: 'menugen',
      framework: 'nextjs',
      productionBranch: 'main',
    },
    dependsOn: [],
    outputs: {},
    status: 'pending',
    risk: 'low',
    requiresApproval: false,
    retryPolicy: {
      maxRetries: 1,
      backoffMs: 500,
    },
    timeoutMs: 30_000,
  };
}

function createExecutionContext(): ExecutionContext {
  return {
    runId: 'run_test',
    appSpec: sampleAppSpec,
    projectScan: undefined,
    getOutput(taskId: string, key: string): unknown {
      const outputsByTaskId: Record<string, Record<string, unknown>> = {
        'vercel-create-project': {
          projectId: 'prj_123',
          projectName: 'menugen',
        },
        'vercel-link-repository': {
          projectId: 'prj_456',
          projectName: 'menugen',
        },
        'vercel-deploy-branch-preview': {
          deploymentId: 'dpl_branch_123',
          previewUrl: 'https://menugen-branch-preview.vercel.app',
        },
        'github-create-repo': {
          repoId: 987,
          repoFullName: 'octocat/menugen',
          ownerId: 321,
          defaultBranch: 'main',
        },
        'github-scaffold-template': {
          latestCommitSha: 'abc123',
        },
        'neon-capture-database-url': {
          databaseUrl: 'postgres://example',
        },
        'neon-create-preview-branch': {
          databaseUrl: 'postgres://preview-branch',
        },
        'clerk-capture-secret-key': {
          secretKey: 'clerk_secret',
        },
        'clerk-capture-publishable-key': {
          publishableKey: 'clerk_publishable',
        },
        'sentry-capture-dsn': {
          dsn: 'https://dsn',
        },
        'posthog-capture-api-key': {
          apiKey: 'posthog_key',
        },
        'stripe-capture-secret-key': {
          secretKey: 'stripe_secret',
        },
        'resend-capture-api-key': {
          apiKey: 'resend_key',
        },
        'stripe-capture-webhook-secret': {
          webhookSecret: 'whsec_test',
        },
        'vercel-deploy-preview': {
          deploymentId: 'dpl_123',
          previewUrl: 'https://menugen-preview.vercel.app',
        },
      };

      return outputsByTaskId[taskId]?.[key];
    },
    getCredential: (): Promise<Credentials> =>
      Promise.resolve({
        provider: 'vercel',
        values: {
          token: 'vercel-token',
        },
      }),
    log: () => {},
    emitEvent: (): void => {},
  };
}
