import type { Credentials, ExecutionContext, Task } from '@devassemble/types';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { clerkProviderPack } from '../src/clerk/index.js';

describe('clerk provider pack', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('preflight', () => {
    it('returns an error when the token is missing', async () => {
      const result = await clerkProviderPack.preflight!(
        { provider: 'clerk', values: {} } as Credentials,
      );

      expect(result.valid).toBe(false);
      expect(result.errors[0]!.code).toBe('CLERK_SECRET_KEY_MISSING');
    });

    it('returns an error when the key format is invalid', async () => {
      const result = await clerkProviderPack.preflight!(
        { provider: 'clerk', values: { token: 'not-a-clerk-key' } },
      );

      expect(result.valid).toBe(false);
      expect(result.errors[0]!.code).toBe('CLERK_SECRET_KEY_FORMAT_INVALID');
    });

    it('returns an error when the publishable key is missing', async () => {
      const result = await clerkProviderPack.preflight!(
        { provider: 'clerk', values: { token: 'sk_test_validkey123' } },
      );

      expect(result.valid).toBe(false);
      expect(result.errors[0]!.code).toBe('CLERK_PUBLISHABLE_KEY_MISSING');
    });

    it('returns an error when the publishable key format is invalid', async () => {
      const result = await clerkProviderPack.preflight!(
        {
          provider: 'clerk',
          values: { token: 'sk_test_validkey123', publishableKey: 'not-valid' },
        },
      );

      expect(result.valid).toBe(false);
      expect(result.errors[0]!.code).toBe('CLERK_PUBLISHABLE_KEY_FORMAT_INVALID');
    });

    it('returns an error when the key is rejected by Clerk', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(() =>
          Promise.resolve(
            new Response(JSON.stringify({ errors: [{ message: 'Unauthorized' }] }), {
              status: 401,
            }),
          ),
        ),
      );

      const result = await clerkProviderPack.preflight!({
        provider: 'clerk',
        values: {
          token: 'sk_test_invalid123',
          publishableKey: 'pk_test_valid456',
        },
      });

      expect(result.valid).toBe(false);
      expect(result.errors[0]!.code).toBe('CLERK_SECRET_KEY_INVALID');
    });

    it('passes preflight with valid keys', async () => {
      const fetchMock = vi.fn(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              id: 'ins_test_123',
              environment_type: 'development',
            }),
            { status: 200 },
          ),
        ),
      );

      vi.stubGlobal(
        'fetch',
        fetchMock,
      );

      const result = await clerkProviderPack.preflight!({
        provider: 'clerk',
        values: {
          token: 'sk_test_validkey123',
          publishableKey: 'pk_test_valid456',
        },
      });

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(fetchMock).toHaveBeenCalledWith(
        'https://api.clerk.com/v1/instance',
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            Authorization: 'Bearer sk_test_validkey123',
          }),
        }),
      );
    });
  });

  describe('apply: capture-keys', () => {
    it('captures keys and detects test mode', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(() =>
          Promise.resolve(
            new Response(
              JSON.stringify({
                id: 'ins_test_abc',
                environment_type: 'development',
              }),
              { status: 200 },
            ),
          ),
        ),
      );

      const result = await clerkProviderPack.apply(
        createTask('capture-keys'),
        createExecutionContext(),
      );

      expect(result.success).toBe(true);
      expect(result.outputs.instanceId).toBe('ins_test_abc');
      expect(result.outputs.secretKey).toBe('sk_test_clerk_secret');
      expect(result.outputs.publishableKey).toBe('pk_test_clerk_pub');
      expect(result.outputs.mode).toBe('test');
    });

    it('detects live mode from a live key', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(() =>
          Promise.resolve(
            new Response(
              JSON.stringify({
                id: 'ins_live_xyz',
                environment_type: 'production',
              }),
              { status: 200 },
            ),
          ),
        ),
      );

      const result = await clerkProviderPack.apply(
        createTask('capture-keys'),
        createExecutionContext({
          token: 'sk_live_clerk_secret',
          publishableKey: 'pk_live_clerk_pub',
        }),
      );

      expect(result.success).toBe(true);
      expect(result.outputs.mode).toBe('live');
    });
  });
});

function createTask(action: Task['action']): Task {
  return {
    id: `clerk-${action}`,
    name: `Clerk ${action}`,
    provider: 'clerk',
    action,
    params: {},
    dependsOn: [],
    outputs: {},
    status: 'pending',
    risk: 'low',
    requiresApproval: false,
    retryPolicy: { maxRetries: 1, backoffMs: 500 },
    timeoutMs: 15_000,
  };
}

function createExecutionContext(
  credOverrides: Record<string, string> = {},
): ExecutionContext {
  return {
    runId: 'run_test',
    appSpec: undefined,
    projectScan: undefined,
    getOutput(): unknown {
      return undefined;
    },
    getCredential(provider: string): Promise<Credentials> {
      return Promise.resolve({
        provider,
        values: {
          token: credOverrides.token ?? 'sk_test_clerk_secret',
          publishableKey: credOverrides.publishableKey ?? 'pk_test_clerk_pub',
        },
      });
    },
    log(): void {},
    emitEvent(): void {},
  };
}
