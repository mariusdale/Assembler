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
import { StripeClient } from './client.js';

export const stripeProviderPack: ProviderPack = {
  name: 'stripe',
  actions: ['preflight', 'capture-keys'],
  preflight: async (creds: Credentials): Promise<PreflightResult> => {
    const errors: PreflightResult['errors'] = [];

    if (!creds.values.token) {
      return {
        valid: false,
        errors: [
          {
            code: 'STRIPE_KEY_MISSING',
            message: 'No Stripe secret key configured.',
            remediation:
              'Add your Stripe secret key with "assembler creds add stripe <secret-key>". You can find it at https://dashboard.stripe.com/apikeys',
            url: 'https://dashboard.stripe.com/apikeys',
          },
        ],
      };
    }

    const client = new StripeClient(creds);

    if (!client.isTestKey() && !client.isLiveKey()) {
      errors.push({
        code: 'STRIPE_KEY_FORMAT_INVALID',
        message:
          'The Stripe key does not look like a valid secret key. Expected a key starting with sk_test_, sk_live_, rk_test_, or rk_live_.',
        remediation:
          'Make sure you are using a Stripe secret key (not a publishable key). Find it at https://dashboard.stripe.com/apikeys',
        url: 'https://dashboard.stripe.com/apikeys',
      });

      return { valid: false, errors };
    }

    try {
      await client.getAccount();
    } catch (error) {
      if (error instanceof HttpError && error.status === 401) {
        errors.push({
          code: 'STRIPE_KEY_INVALID',
          message: 'Your Stripe secret key is invalid or has been revoked.',
          remediation:
            'Generate a new secret key at https://dashboard.stripe.com/apikeys and update with "assembler creds add stripe <secret-key>".',
          url: 'https://dashboard.stripe.com/apikeys',
        });
      } else {
        errors.push({
          code: 'STRIPE_PREFLIGHT_ERROR',
          message: `Stripe API check failed: ${error instanceof Error ? error.message : String(error)}`,
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
      ...(tokenPresent ? {} : { error: 'Missing Stripe secret key.' }),
    });
  },
  plan: async (action: string, params: unknown): Promise<TaskTemplate[]> => [
    await Promise.resolve({
      name: `Stripe ${action}`,
      provider: 'stripe',
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
    const client = new StripeClient(await ctx.getCredential('stripe'));

    switch (task.action) {
      case 'capture-keys': {
        const account = await client.getAccount();
        const secretKey = (await ctx.getCredential('stripe')).values.token;
        const mode = client.isTestKey() ? 'test' : 'live';
        const publishableKey = asOptionalString(task.params.publishableKey);

        ctx.log('info', `Stripe account "${account.id}" validated in ${mode} mode.`, {
          provider: 'stripe',
          accountId: account.id,
          mode,
        });

        return {
          success: true,
          outputs: {
            accountId: account.id,
            secretKey,
            mode,
            ...(publishableKey ? { publishableKey } : {}),
          },
          message: `Captured Stripe ${mode} keys for account ${account.id}.`,
        };
      }
      default:
        throw new Error(`Unsupported stripe action "${task.action}".`);
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
