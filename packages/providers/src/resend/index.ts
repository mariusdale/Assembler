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
} from '@devassemble/types';

import { HttpError } from '../shared/http.js';
import { ResendClient } from './client.js';

export const resendProviderPack: ProviderPack = {
  name: 'resend',
  actions: ['capture-api-key'],
  preflight: async (creds: Credentials): Promise<PreflightResult> => {
    const errors: PreflightResult['errors'] = [];

    if (!creds.values.token) {
      return {
        valid: false,
        errors: [
          {
            code: 'RESEND_KEY_MISSING',
            message: 'No Resend API key configured.',
            remediation:
              'Add your Resend API key with "devassemble creds add resend <api-key>". Create one at https://resend.com/api-keys',
            url: 'https://resend.com/api-keys',
          },
        ],
      };
    }

    const key = String(creds.values.token);

    if (!ResendClient.isValidKeyFormat(key)) {
      errors.push({
        code: 'RESEND_KEY_FORMAT_INVALID',
        message:
          'The Resend API key does not look valid. Expected a key starting with re_.',
        remediation:
          'Make sure you are using a Resend API key. Create one at https://resend.com/api-keys',
        url: 'https://resend.com/api-keys',
      });

      return { valid: false, errors };
    }

    const client = new ResendClient(creds);

    try {
      await client.getApiKeys();
    } catch (error) {
      if (error instanceof HttpError && (error.status === 401 || error.status === 403)) {
        errors.push({
          code: 'RESEND_KEY_INVALID',
          message: 'Your Resend API key is invalid or has been revoked.',
          remediation:
            'Generate a new API key at https://resend.com/api-keys and update with "devassemble creds add resend <api-key>".',
          url: 'https://resend.com/api-keys',
        });
      } else {
        errors.push({
          code: 'RESEND_PREFLIGHT_ERROR',
          message: `Resend API check failed: ${error instanceof Error ? error.message : String(error)}`,
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
      ...(tokenPresent ? {} : { error: 'Missing Resend API key.' }),
    });
  },
  plan: async (action: string, params: unknown): Promise<TaskTemplate[]> => [
    await Promise.resolve({
      name: `Resend ${action}`,
      provider: 'resend',
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
    const creds = await ctx.getCredential('resend');
    const client = new ResendClient(creds);

    switch (task.action) {
      case 'capture-api-key': {
        await client.getApiKeys();
        const apiKey = creds.values.token;

        ctx.log('info', 'Resend API key validated.', {
          provider: 'resend',
        });

        return {
          success: true,
          outputs: {
            apiKey,
          },
          message: 'Captured Resend API key.',
        };
      }
      default:
        throw new Error(`Unsupported resend action "${task.action}".`);
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
