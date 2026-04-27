import type { Credentials, ExecutionContext, Task } from '@assembler/types';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { githubProviderPack } from '../src/github/index.js';

describe('github provider pack rollback', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('ignores repository deletion when the repo is already gone', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response('Not Found', { status: 404 }))),
    );

    const result = await githubProviderPack.rollback(createTask(), createExecutionContext());

    expect(result.success).toBe(true);
  });

  it('surfaces a helpful remediation when GitHub rejects repo deletion', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              message: 'Must have admin rights to Repository.',
              documentation_url: 'https://docs.github.com/rest/repos/repos#delete-a-repository',
            }),
            { status: 403 },
          ),
        ),
      ),
    );

    await expect(githubProviderPack.rollback(createTask(), createExecutionContext())).rejects.toThrow(
      /delete_repo|Administration write access|admin rights to delete a repository/i,
    );
  });
});

function createTask(): Task {
  return {
    id: 'github-create-repo',
    name: 'Create GitHub repository',
    provider: 'github',
    action: 'create-repo',
    params: {},
    dependsOn: [],
    outputs: {
      owner: 'octocat',
      repoName: 'menugen',
    },
    status: 'success',
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
    projectScan: undefined,
    getOutput(): unknown {
      return undefined;
    },
    getCredential(): Promise<Credentials> {
      return Promise.resolve({
        provider: 'github',
        values: {
          token: 'github-test-token',
        },
      });
    },
    log(): void {},
    emitEvent(): void {},
  };
}
