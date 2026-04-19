import type { AppSpec, Credentials, ExecutionContext, Task } from '@assembler/types';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { resendProviderPack } from '../src/resend/index.js';

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

describe('resend provider pack', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('preflight', () => {
    it('returns an error when the token is missing', async () => {
      const result = await resendProviderPack.preflight!(
        { provider: 'resend', values: {} } as Credentials,
      );

      expect(result.valid).toBe(false);
      expect(result.errors[0]!.code).toBe('RESEND_KEY_MISSING');
    });

    it('returns an error when the key format is invalid', async () => {
      const result = await resendProviderPack.preflight!(
        { provider: 'resend', values: { token: 'not-a-resend-key' } },
      );

      expect(result.valid).toBe(false);
      expect(result.errors[0]!.code).toBe('RESEND_KEY_FORMAT_INVALID');
    });

    it('returns an error when the key is rejected by Resend', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(() =>
          Promise.resolve(
            new Response(
              JSON.stringify({ message: 'Invalid API key' }),
              { status: 401 },
            ),
          ),
        ),
      );

      const result = await resendProviderPack.preflight!(
        { provider: 'resend', values: { token: 're_invalid123' } },
      );

      expect(result.valid).toBe(false);
      expect(result.errors[0]!.code).toBe('RESEND_KEY_INVALID');
    });

    it('handles 403 as an invalid key', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(() =>
          Promise.resolve(
            new Response(
              JSON.stringify({ message: 'Forbidden' }),
              { status: 403 },
            ),
          ),
        ),
      );

      const result = await resendProviderPack.preflight!(
        { provider: 'resend', values: { token: 're_forbidden123' } },
      );

      expect(result.valid).toBe(false);
      expect(result.errors[0]!.code).toBe('RESEND_KEY_INVALID');
    });

    it('passes preflight with a valid key', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(() =>
          Promise.resolve(
            new Response(
              JSON.stringify({ data: [{ id: '1', name: 'Default', created_at: '2024-01-01' }] }),
              { status: 200 },
            ),
          ),
        ),
      );

      const result = await resendProviderPack.preflight!(
        { provider: 'resend', values: { token: 're_validkey123' } },
      );

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('apply: capture-api-key', () => {
    it('captures the API key after validation', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(() =>
          Promise.resolve(
            new Response(
              JSON.stringify({ data: [{ id: '1', name: 'Default', created_at: '2024-01-01' }] }),
              { status: 200 },
            ),
          ),
        ),
      );

      const result = await resendProviderPack.apply(
        createTask('capture-api-key'),
        createExecutionContext(),
      );

      expect(result.success).toBe(true);
      expect(result.outputs.apiKey).toBe('re_test_resend_api_key');
    });
  });
});

function createTask(action: Task['action']): Task {
  return {
    id: `resend-${action}`,
    name: `Resend ${action}`,
    provider: 'resend',
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
          token: 're_test_resend_api_key',
        },
      });
    },
    log: vi.fn(),
    emitEvent: vi.fn(),
  };
}
