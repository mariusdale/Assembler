import type { AppSpec, Credentials, ExecutionContext, Task } from '@devassemble/types';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { neonProviderPack } from '../src/neon/index.js';

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

describe('neon provider pack', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('resolves the branch id from list branches when create project omits it', async () => {
    const requests: Array<{ url: string; method: string }> = [];

    vi.stubGlobal(
      'fetch',
      vi.fn((input: string | URL, init?: RequestInit) => {
        const url = input.toString();
        requests.push({
          url,
          method: init?.method ?? 'GET',
        });

        if (url.includes('/api/v2/projects') && init?.method === 'POST') {
          return Promise.resolve(
            new Response(
              JSON.stringify({
                project: {
                  id: 'prj_neon',
                  name: 'menugen-db',
                  region_id: 'aws-eu-central-1',
                },
                connection_uris: [
                  {
                    connection_uri: 'postgres://example',
                  },
                ],
              }),
              { status: 200 },
            ),
          );
        }

        if (url.includes('/api/v2/projects/prj_neon/branches') && init?.method === 'GET') {
          return Promise.resolve(
            new Response(
              JSON.stringify({
                branches: [
                  {
                    id: 'br_main',
                    name: 'main',
                    primary: true,
                  },
                ],
              }),
              { status: 200 },
            ),
          );
        }

        throw new Error(`Unexpected request: ${init?.method ?? 'GET'} ${url}`);
      }),
    );

    const result = await neonProviderPack.apply(createTask('create-project'), createExecutionContext());

    expect(result.outputs.branchId).toBe('br_main');
    expect(
      requests.some(
        (request) =>
          request.url.includes('/api/v2/projects/prj_neon/branches') &&
          request.method === 'GET',
      ),
    ).toBe(true);
  });

  it('resolves the branch id during database creation when the stored run output is missing it', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((input: string | URL, init?: RequestInit) => {
        const url = input.toString();

        if (url.includes('/api/v2/projects/prj_neon/operations') && init?.method === 'GET') {
          return Promise.resolve(
            new Response(
              JSON.stringify({ operations: [] }),
              { status: 200 },
            ),
          );
        }

        if (url.includes('/api/v2/projects/prj_neon/branches') && init?.method === 'GET') {
          return Promise.resolve(
            new Response(
              JSON.stringify({
                branches: [
                  {
                    id: 'br_main',
                    name: 'main',
                    primary: true,
                  },
                ],
              }),
              { status: 200 },
            ),
          );
        }

        if (
          url.includes('/api/v2/projects/prj_neon/branches/br_main/databases') &&
          init?.method === 'POST'
        ) {
          expect(init.body).toBe(
            JSON.stringify({
              database: {
                name: 'menugen',
                owner_name: 'neondb_owner',
              },
            }),
          );

          return Promise.resolve(
            new Response(
              JSON.stringify({
                database: {
                  name: 'menugen',
                },
              }),
              { status: 200 },
            ),
          );
        }

        throw new Error(`Unexpected request: ${init?.method ?? 'GET'} ${url}`);
      }),
    );

    const result = await neonProviderPack.apply(
      createTask('create-database'),
      createExecutionContext({
        'neon-create-project': {
          projectId: 'prj_neon',
          databaseUrl: 'postgresql://neondb_owner:secret@example.neon.tech/neondb?sslmode=require',
        },
      }),
    );

    expect(result.outputs.branchId).toBe('br_main');
    expect(result.outputs.databaseName).toBe('menugen');
    expect(result.outputs.ownerName).toBe('neondb_owner');
  });
});

function createTask(action: Task['action']): Task {
  return {
    id: `neon-${action}`,
    name: `Neon ${action}`,
    provider: 'neon',
    action,
    params: {
      name: 'menugen-db',
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

function createExecutionContext(
  outputsByTaskId: Record<string, Record<string, unknown>> = {},
): ExecutionContext {
  return {
    runId: 'run_test',
    appSpec: sampleAppSpec,
    projectScan: undefined,
    getOutput(taskId: string, key: string): unknown {
      return outputsByTaskId[taskId]?.[key];
    },
    getCredential(provider: string): Promise<Credentials> {
      return Promise.resolve({
        provider,
        values: {
          token: 'test-token',
        },
      });
    },
    log: vi.fn(),
    emitEvent: vi.fn(),
  };
}
