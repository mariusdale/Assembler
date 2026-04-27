import type { Credentials, ExecutionContext, Task } from '@assembler/types';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { neonProviderPack } from '../src/neon/index.js';

describe('neon provider: preview branches', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('apply: create-preview-branch', () => {
    it('creates a new branch and returns connection URI', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn((input: string | URL, init?: RequestInit) => {
          const url = input.toString();

          // listOperations — project ready
          if (url.includes('/operations')) {
            return Promise.resolve(
              new Response(
                JSON.stringify({ operations: [] }),
                { status: 200 },
              ),
            );
          }

          // createBranch (POST)
          if (url.includes('/branches') && init?.method === 'POST') {
            return Promise.resolve(
              new Response(
                JSON.stringify({
                  branch: { id: 'br-preview-123', name: 'feature/test' },
                  endpoints: [{ id: 'ep_1', host: 'ep-1.neon.tech', type: 'read_write' }],
                  connection_uris: [
                    {
                      connection_uri: 'postgresql://user:pass@ep-1.neon.tech/neondb',
                      database_name: 'neondb',
                    },
                  ],
                }),
                { status: 200 },
              ),
            );
          }

          // listBranches (GET) — no matching branch
          if (url.includes('/branches')) {
            return Promise.resolve(
              new Response(
                JSON.stringify({
                  branches: [{ id: 'br-main', name: 'main', primary: true }],
                }),
                { status: 200 },
              ),
            );
          }

          throw new Error(`Unexpected request: ${url}`);
        }),
      );

      const task = createTask('create-preview-branch');
      task.params.projectId = 'proj_abc';
      task.params.branchName = 'feature/test';

      const result = await neonProviderPack.apply(task, createExecutionContext());

      expect(result.success).toBe(true);
      expect(result.outputs.branchId).toBe('br-preview-123');
      expect(result.outputs.branchName).toBe('feature/test');
      expect(result.outputs.databaseUrl).toBe('postgresql://user:pass@ep-1.neon.tech/neondb');
    });

    it('reuses existing branch idempotently', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn((input: string | URL) => {
          const url = input.toString();

          // listOperations — project ready
          if (url.includes('/operations')) {
            return Promise.resolve(
              new Response(JSON.stringify({ operations: [] }), { status: 200 }),
            );
          }

          // listBranches — matching branch exists
          return Promise.resolve(
            new Response(
              JSON.stringify({
                branches: [
                  { id: 'br-main', name: 'main', primary: true },
                  { id: 'br-existing', name: 'feature/test' },
                ],
              }),
              { status: 200 },
            ),
          );
        }),
      );

      const task = createTask('create-preview-branch');
      task.params.projectId = 'proj_abc';
      task.params.branchName = 'feature/test';

      const result = await neonProviderPack.apply(task, createExecutionContext());

      expect(result.success).toBe(true);
      expect(result.outputs.branchId).toBe('br-existing');
      expect(result.message).toMatch(/already exists/);
    });
  });

  describe('apply: delete-branch', () => {
    it('deletes the specified branch', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(() =>
          Promise.resolve(new Response(JSON.stringify({}), { status: 200 })),
        ),
      );

      const task = createTask('delete-branch');
      task.params.projectId = 'proj_abc';
      task.params.branchId = 'br-preview-123';

      const result = await neonProviderPack.apply(task, createExecutionContext());

      expect(result.success).toBe(true);
    });
  });
});

function createTask(action: Task['action']): Task {
  return {
    id: `neon-${action}`,
    name: `Neon ${action}`,
    provider: 'neon',
    action,
    params: {},
    dependsOn: [],
    outputs: {},
    status: 'pending',
    risk: 'medium',
    requiresApproval: false,
    retryPolicy: { maxRetries: 2, backoffMs: 1_000 },
    timeoutMs: 60_000,
  };
}

function createExecutionContext(): ExecutionContext {
  return {
    runId: 'run_test',
    projectScan: undefined,
    getOutput(): unknown {
      return undefined;
    },
    getCredential(provider: string): Promise<Credentials> {
      return Promise.resolve({
        provider,
        values: { token: 'neon-test-api-key' },
      });
    },
    log(): void {},
    emitEvent(): void {},
  };
}
