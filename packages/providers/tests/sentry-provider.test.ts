import type { AppSpec, Credentials, ExecutionContext, Task } from '@devassemble/types';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { sentryProviderPack } from '../src/sentry/index.js';

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

describe('sentry provider pack', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('preflight', () => {
    it('returns an error when the token is missing', async () => {
      const result = await sentryProviderPack.preflight!(
        { provider: 'sentry', values: {} } as Credentials,
      );

      expect(result.valid).toBe(false);
      expect(result.errors[0]!.code).toBe('SENTRY_TOKEN_MISSING');
    });

    it('returns an error when the token format is invalid', async () => {
      const result = await sentryProviderPack.preflight!(
        { provider: 'sentry', values: { token: 'not-a-sentry-token' } },
      );

      expect(result.valid).toBe(false);
      expect(result.errors[0]!.code).toBe('SENTRY_TOKEN_FORMAT_INVALID');
    });

    it('returns an error when the token is rejected by Sentry', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(() =>
          Promise.resolve(
            new Response(
              JSON.stringify({ detail: 'Invalid token' }),
              { status: 401 },
            ),
          ),
        ),
      );

      const result = await sentryProviderPack.preflight!(
        { provider: 'sentry', values: { token: 'sntrys_invalid123' } },
      );

      expect(result.valid).toBe(false);
      expect(result.errors[0]!.code).toBe('SENTRY_TOKEN_INVALID');
    });

    it('passes preflight with a valid sntrys_ token', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(() =>
          Promise.resolve(
            new Response(
              JSON.stringify([{ id: '1', slug: 'my-org', name: 'My Org' }]),
              { status: 200 },
            ),
          ),
        ),
      );

      const result = await sentryProviderPack.preflight!(
        { provider: 'sentry', values: { token: 'sntrys_validtoken123' } },
      );

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('passes preflight with a valid 64-char hex token', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(() =>
          Promise.resolve(
            new Response(
              JSON.stringify([{ id: '1', slug: 'my-org', name: 'My Org' }]),
              { status: 200 },
            ),
          ),
        ),
      );

      const hexToken = 'a'.repeat(64);
      const result = await sentryProviderPack.preflight!(
        { provider: 'sentry', values: { token: hexToken } },
      );

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('apply: capture-dsn', () => {
    it('captures the DSN from the first org and first project', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn((input: string | URL) => {
          const url = input.toString();

          if (url.includes('/api/0/organizations/') && !url.includes('/projects/')) {
            return Promise.resolve(
              new Response(
                JSON.stringify([{ id: '1', slug: 'my-org', name: 'My Org' }]),
                { status: 200 },
              ),
            );
          }

          if (url.includes('/organizations/my-org/projects/')) {
            return Promise.resolve(
              new Response(
                JSON.stringify([
                  {
                    id: '100',
                    slug: 'my-app',
                    name: 'My App',
                    organization: { id: '1', slug: 'my-org', name: 'My Org' },
                  },
                ]),
                { status: 200 },
              ),
            );
          }

          if (url.includes('/projects/my-org/my-app/keys/')) {
            return Promise.resolve(
              new Response(
                JSON.stringify([
                  {
                    id: 'key-1',
                    name: 'Default',
                    dsn: {
                      public: 'https://abc123@o123456.ingest.sentry.io/789',
                      secret: 'https://abc123:secret@o123456.ingest.sentry.io/789',
                    },
                    isActive: true,
                  },
                ]),
                { status: 200 },
              ),
            );
          }

          throw new Error(`Unexpected request: ${url}`);
        }),
      );

      const result = await sentryProviderPack.apply(
        createTask('capture-dsn'),
        createExecutionContext(),
      );

      expect(result.success).toBe(true);
      expect(result.outputs.dsn).toBe('https://abc123@o123456.ingest.sentry.io/789');
      expect(result.outputs.orgSlug).toBe('my-org');
      expect(result.outputs.projectSlug).toBe('my-app');
    });

    it('prefers a nextjs project when one exists', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn((input: string | URL) => {
          const url = input.toString();

          if (url.includes('/api/0/organizations/') && !url.includes('/projects/')) {
            return Promise.resolve(
              new Response(
                JSON.stringify([{ id: '1', slug: 'my-org', name: 'My Org' }]),
                { status: 200 },
              ),
            );
          }

          if (url.includes('/organizations/my-org/projects/')) {
            return Promise.resolve(
              new Response(
                JSON.stringify([
                  {
                    id: '100',
                    slug: 'backend-api',
                    name: 'Backend API',
                    organization: { id: '1', slug: 'my-org', name: 'My Org' },
                  },
                  {
                    id: '101',
                    slug: 'my-nextjs-app',
                    name: 'My NextJS App',
                    organization: { id: '1', slug: 'my-org', name: 'My Org' },
                  },
                ]),
                { status: 200 },
              ),
            );
          }

          if (url.includes('/projects/my-org/my-nextjs-app/keys/')) {
            return Promise.resolve(
              new Response(
                JSON.stringify([
                  {
                    id: 'key-2',
                    name: 'Default',
                    dsn: {
                      public: 'https://def456@o123456.ingest.sentry.io/101',
                      secret: 'https://def456:secret@o123456.ingest.sentry.io/101',
                    },
                    isActive: true,
                  },
                ]),
                { status: 200 },
              ),
            );
          }

          throw new Error(`Unexpected request: ${url}`);
        }),
      );

      const result = await sentryProviderPack.apply(
        createTask('capture-dsn'),
        createExecutionContext(),
      );

      expect(result.success).toBe(true);
      expect(result.outputs.projectSlug).toBe('my-nextjs-app');
    });

    it('throws when no organizations exist', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(() =>
          Promise.resolve(
            new Response(JSON.stringify([]), { status: 200 }),
          ),
        ),
      );

      await expect(
        sentryProviderPack.apply(createTask('capture-dsn'), createExecutionContext()),
      ).rejects.toThrow('No Sentry organizations found');
    });
  });
});

function createTask(action: Task['action']): Task {
  return {
    id: `sentry-${action}`,
    name: `Sentry ${action}`,
    provider: 'sentry',
    action,
    params: {},
    dependsOn: [],
    outputs: {},
    status: 'pending',
    risk: 'low',
    requiresApproval: false,
    retryPolicy: {
      maxRetries: 1,
      backoffMs: 500,
    },
    timeoutMs: 15_000,
  };
}

function createExecutionContext(): ExecutionContext {
  return {
    runId: 'run_test',
    appSpec: sampleAppSpec,
    projectScan: undefined,
    getOutput(): unknown {
      return undefined;
    },
    getCredential(provider: string): Promise<Credentials> {
      return Promise.resolve({
        provider,
        values: {
          token: 'sntrys_test_token_123',
        },
      });
    },
    log: vi.fn(),
    emitEvent: vi.fn(),
  };
}
