import type { AppSpec, Credentials, ExecutionContext, Task } from '@assembler/types';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { githubProviderPack } from '../src/github/index.js';
import { loadGoldenPathTemplate } from '../src/github/template.js';

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
  domain: 'menugen.app',
};

describe('golden path template', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders the local Next.js template with app-specific replacements', async () => {
    const files = await loadGoldenPathTemplate(sampleAppSpec);

    expect(files.length).toBeGreaterThan(5);

    const packageJson = files.find((file) => file.path === 'package.json');
    const landingPage = files.find((file) => file.path === 'app/page.tsx');

    expect(packageJson?.content).toContain('"name": "menugen"');
    expect(landingPage?.content).toContain('Restaurant menu generator SaaS');
    expect(landingPage?.content).toContain('menugen.app');
    expect(files.some((file) => file.content.includes('{{APP_NAME}}'))).toBe(false);
  });

  it('uploads rendered template files through the github provider pack', async () => {
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

        if (init?.method === 'GET') {
          return Promise.resolve(new Response('Not Found', { status: 404 }));
        }

        return Promise.resolve(
          new Response(
            JSON.stringify({
              content: {
                path: 'package.json',
                sha: 'blob_sha',
              },
              commit: {
                sha: 'commit_sha',
              },
            }),
            { status: 200 },
          ),
        );
      }),
    );

    const result = await githubProviderPack.apply(createCommitTemplateTask(), createExecutionContext());
    const putRequests = requests.filter((request) => request.method === 'PUT');

    expect(result.success).toBe(true);
    expect(result.outputs.fileCount).toBe(putRequests.length);
    expect(putRequests.length).toBeGreaterThan(5);
    expect(putRequests.some((request) => request.url.includes('/contents/package.json'))).toBe(true);
    expect(putRequests.every((request) => request.body?.includes('"branch":"main"') ?? false)).toBe(
      true,
    );
  });
});

function createCommitTemplateTask(): Task {
  return {
    id: 'github-scaffold-template',
    name: 'Scaffold Next.js template',
    provider: 'github',
    action: 'commit-template',
    params: {},
    dependsOn: ['github-create-repo'],
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
        'github-create-repo': {
          owner: 'octocat',
          repoName: 'menugen',
          defaultBranch: 'main',
        },
      };

      return outputsByTaskId[taskId]?.[key];
    },
    getCredential: (): Promise<Credentials> =>
      Promise.resolve({
        provider: 'github',
        values: {
          token: 'github-test-token',
        },
      }),
    log: () => {},
    emitEvent: (): void => {},
  };
}
