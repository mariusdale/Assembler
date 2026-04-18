import type {
  Credentials,
  DiscoveryResult,
  ExecutionContext,
  PreflightResult,
  ProviderPack,
  RollbackResult,
  Task,
  TaskResult,
  TaskTemplate,
  VerifyResult,
} from '@assembler/types';

import { HttpError } from '../shared/http.js';
import { ClerkClient } from './client.js';

export const clerkProviderPack: ProviderPack = {
  name: 'clerk',
  actions: ['capture-keys'],
  preflight: async (creds: Credentials): Promise<PreflightResult> => {
    const errors: PreflightResult['errors'] = [];

    if (!creds.values.token) {
      return {
        valid: false,
        errors: [
          {
            code: 'CLERK_SECRET_KEY_MISSING',
            message: 'No Clerk secret key configured.',
            remediation:
              'Add your Clerk keys with "assembler creds add clerk token=<secret-key> publishableKey=<pk_...>". Find them at https://dashboard.clerk.com → API Keys.',
            url: 'https://dashboard.clerk.com',
          },
        ],
      };
    }

    const client = new ClerkClient(creds);

    if (!client.isTestKey() && !client.isLiveKey()) {
      errors.push({
        code: 'CLERK_SECRET_KEY_FORMAT_INVALID',
        message:
          'The Clerk secret key does not look valid. Expected a key starting with sk_test_ or sk_live_.',
        remediation:
          'Make sure you are using a Clerk secret key (not the publishable key). Find it at https://dashboard.clerk.com → API Keys.',
        url: 'https://dashboard.clerk.com',
      });

      return { valid: false, errors };
    }

    if (!creds.values.publishableKey) {
      errors.push({
        code: 'CLERK_PUBLISHABLE_KEY_MISSING',
        message: 'No Clerk publishable key configured.',
        remediation:
          'Add the publishable key: "assembler creds add clerk token=<secret-key> publishableKey=<pk_...>".',
        url: 'https://dashboard.clerk.com',
      });

      return { valid: false, errors };
    }

    const publishableKey = String(creds.values.publishableKey);
    if (!publishableKey.startsWith('pk_test_') && !publishableKey.startsWith('pk_live_')) {
      errors.push({
        code: 'CLERK_PUBLISHABLE_KEY_FORMAT_INVALID',
        message:
          'The Clerk publishable key does not look valid. Expected a key starting with pk_test_ or pk_live_.',
        remediation:
          'Make sure you are using a Clerk publishable key (not the secret key). Find it at https://dashboard.clerk.com → API Keys.',
        url: 'https://dashboard.clerk.com',
      });

      return { valid: false, errors };
    }

    try {
      await client.getInstance();
    } catch (error) {
      if (error instanceof HttpError && error.status === 401) {
        errors.push({
          code: 'CLERK_SECRET_KEY_INVALID',
          message: 'Your Clerk secret key is invalid or has been revoked.',
          remediation:
            'Generate a new secret key at https://dashboard.clerk.com → API Keys and update with "assembler creds add clerk token=<secret-key> publishableKey=<pk_...>".',
          url: 'https://dashboard.clerk.com',
        });
      } else {
        errors.push({
          code: 'CLERK_PREFLIGHT_ERROR',
          message: `Clerk API check failed: ${error instanceof Error ? error.message : String(error)}`,
          remediation: 'Check your network connection and try again.',
        });
      }
    }

    return { valid: errors.length === 0, errors };
  },
  discover: (creds: Credentials): Promise<DiscoveryResult> => {
    const tokenPresent = typeof creds.values.token === 'string' && creds.values.token.length > 0;

    return Promise.resolve({
      connected: tokenPresent,
      metadata: {},
      ...(tokenPresent ? {} : { error: 'Missing Clerk secret key.' }),
    });
  },
  plan: async (action: string, params: unknown): Promise<TaskTemplate[]> => [
    await Promise.resolve({
      name: `Clerk ${action}`,
      provider: 'clerk',
      action,
      params: asParams(params),
      risk: 'low',
      requiresApproval: false,
      retryPolicy: {
        maxRetries: 1,
        backoffMs: 500,
      },
      timeoutMs: 15_000,
    }),
  ],
  apply: async (task: Task, ctx: ExecutionContext): Promise<TaskResult> => {
    const creds = await ctx.getCredential('clerk');
    const client = new ClerkClient(creds);

    switch (task.action) {
      case 'capture-keys': {
        const instance = await client.getInstance();
        const secretKey = creds.values.token;
        const publishableKey = asOptionalString(creds.values.publishableKey);
        const mode = client.isTestKey() ? 'test' : 'live';

        ctx.log('info', `Clerk instance "${instance.id}" validated in ${mode} mode.`, {
          provider: 'clerk',
          instanceId: instance.id,
          mode,
        });

        return {
          success: true,
          outputs: {
            instanceId: instance.id,
            secretKey,
            publishableKey,
            mode,
          },
          message: `Captured Clerk ${mode} keys for instance ${instance.id}.`,
        };
      }
      default:
        throw new Error(`Unsupported clerk action "${task.action}".`);
    }
  },
  verify: async (): Promise<VerifyResult> =>
    Promise.resolve({
      success: true,
    }),
  rollback: async (): Promise<RollbackResult> =>
    Promise.resolve({
      success: true,
    }),
};

function asParams(value: unknown): Record<string, unknown> {
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  return {};
}

function asOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value : undefined;
}
