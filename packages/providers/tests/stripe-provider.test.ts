import type { Credentials, ExecutionContext, Task } from '@assembler/types';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { stripeProviderPack } from '../src/stripe/index.js';

describe('stripe provider pack', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('preflight', () => {
    it('returns an error when the token is missing', async () => {
      const result = await stripeProviderPack.preflight!(
        { provider: 'stripe', values: {} } as Credentials,
      );

      expect(result.valid).toBe(false);
      expect(result.errors[0]!.code).toBe('STRIPE_KEY_MISSING');
    });

    it('returns an error when the key format is invalid', async () => {
      const result = await stripeProviderPack.preflight!(
        { provider: 'stripe', values: { token: 'not-a-stripe-key' } },
      );

      expect(result.valid).toBe(false);
      expect(result.errors[0]!.code).toBe('STRIPE_KEY_FORMAT_INVALID');
    });

    it('returns an error when the key is rejected by Stripe', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(() =>
          Promise.resolve(
            new Response(
              JSON.stringify({ error: { message: 'Invalid API Key' } }),
              { status: 401 },
            ),
          ),
        ),
      );

      const result = await stripeProviderPack.preflight!(
        { provider: 'stripe', values: { token: 'sk_test_invalid123' } },
      );

      expect(result.valid).toBe(false);
      expect(result.errors[0]!.code).toBe('STRIPE_KEY_INVALID');
    });

    it('passes preflight with a valid test key', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(() =>
          Promise.resolve(
            new Response(
              JSON.stringify({
                id: 'acct_123',
                object: 'account',
                charges_enabled: true,
                details_submitted: true,
              }),
              { status: 200 },
            ),
          ),
        ),
      );

      const result = await stripeProviderPack.preflight!(
        { provider: 'stripe', values: { token: 'sk_test_validkey123' } },
      );

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('passes preflight with a valid live key', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(() =>
          Promise.resolve(
            new Response(
              JSON.stringify({
                id: 'acct_456',
                object: 'account',
                charges_enabled: true,
                details_submitted: true,
              }),
              { status: 200 },
            ),
          ),
        ),
      );

      const result = await stripeProviderPack.preflight!(
        { provider: 'stripe', values: { token: 'sk_live_validkey456' } },
      );

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('apply: capture-keys', () => {
    it('captures the secret key and detects test mode', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn((input: string | URL) => {
          const url = input.toString();

          if (url.includes('/v1/account')) {
            return Promise.resolve(
              new Response(
                JSON.stringify({
                  id: 'acct_test_123',
                  object: 'account',
                  charges_enabled: true,
                  details_submitted: true,
                }),
                { status: 200 },
              ),
            );
          }

          throw new Error(`Unexpected request: ${url}`);
        }),
      );

      const result = await stripeProviderPack.apply(
        createTask('capture-keys'),
        createExecutionContext(),
      );

      expect(result.success).toBe(true);
      expect(result.outputs.accountId).toBe('acct_test_123');
      expect(result.outputs.secretKey).toBe('sk_test_stripe_secret_key');
      expect(result.outputs.mode).toBe('test');
    });

    it('detects live mode from a live key', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(() =>
          Promise.resolve(
            new Response(
              JSON.stringify({
                id: 'acct_live_456',
                object: 'account',
                charges_enabled: true,
                details_submitted: true,
              }),
              { status: 200 },
            ),
          ),
        ),
      );

      const result = await stripeProviderPack.apply(
        createTask('capture-keys'),
        createExecutionContext({ token: 'sk_live_stripe_secret_key' }),
      );

      expect(result.success).toBe(true);
      expect(result.outputs.mode).toBe('live');
    });

    it('includes the publishable key when provided as a param', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(() =>
          Promise.resolve(
            new Response(
              JSON.stringify({
                id: 'acct_test_789',
                object: 'account',
                charges_enabled: true,
                details_submitted: true,
              }),
              { status: 200 },
            ),
          ),
        ),
      );

      const task = createTask('capture-keys');
      task.params.publishableKey = 'pk_test_abc123';

      const result = await stripeProviderPack.apply(task, createExecutionContext());

      expect(result.success).toBe(true);
      expect(result.outputs.publishableKey).toBe('pk_test_abc123');
    });
  });
});

function createTask(action: Task['action']): Task {
  return {
    id: `stripe-${action}`,
    name: `Stripe ${action}`,
    provider: 'stripe',
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

function createExecutionContext(
  credOverrides: Record<string, string> = {},
): ExecutionContext {
  return {
    runId: 'run_test',
    projectScan: undefined,
    getOutput(): unknown {
      return undefined;
    },
    getCredential(provider: string): Promise<Credentials> {
      return Promise.resolve({
        provider,
        values: {
          token: credOverrides.token ?? 'sk_test_stripe_secret_key',
        },
      });
    },
    log: vi.fn(),
    emitEvent: vi.fn(),
  };
}
