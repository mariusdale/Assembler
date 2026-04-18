import Anthropic from '@anthropic-ai/sdk';
import type { AppSpec } from '@assembler/types';

import type {
  AnthropicAppSpecParserOptions,
  AnthropicMessagesClient,
  AppSpecParseResult,
  AppSpecParser,
  PlannerAssumption,
  PlannerContentBlock,
} from './types.js';

const DEFAULT_MAX_TOKENS = 1_024;
export const APP_SPEC_TOOL_NAME = 'build_app_spec';

const APP_SPEC_TOOL = {
  name: APP_SPEC_TOOL_NAME,
  description:
    'Normalize a natural-language request for a B2B web SaaS into the fixed Assembler AppSpec and record any assumptions.',
  input_schema: {
    type: 'object',
    additionalProperties: false,
    required: ['appSpec', 'assumptions'],
    properties: {
      appSpec: {
        type: 'object',
        additionalProperties: false,
        required: [
          'name',
          'description',
          'auth',
          'billing',
          'database',
          'email',
          'monitoring',
          'hosting',
          'dns',
        ],
        properties: {
          name: { type: 'string', minLength: 1 },
          description: { type: 'string', minLength: 1 },
          domain: { type: 'string' },
          budgetCeiling: { type: 'number' },
          auth: {
            type: 'object',
            additionalProperties: false,
            required: ['provider', 'strategy'],
            properties: {
              provider: { const: 'clerk' },
              strategy: {
                enum: ['email', 'google', 'both'],
              },
            },
          },
          billing: {
            type: 'object',
            additionalProperties: false,
            required: ['provider', 'mode'],
            properties: {
              provider: { const: 'stripe' },
              mode: {
                enum: ['subscription', 'one-time', 'none'],
              },
            },
          },
          database: {
            type: 'object',
            additionalProperties: false,
            required: ['provider'],
            properties: {
              provider: { const: 'neon' },
            },
          },
          email: {
            type: 'object',
            additionalProperties: false,
            required: ['provider'],
            properties: {
              provider: { const: 'resend' },
            },
          },
          monitoring: {
            type: 'object',
            additionalProperties: false,
            required: ['errorTracking', 'analytics'],
            properties: {
              errorTracking: { const: 'sentry' },
              analytics: { const: 'posthog' },
            },
          },
          hosting: {
            type: 'object',
            additionalProperties: false,
            required: ['provider'],
            properties: {
              provider: { const: 'vercel' },
            },
          },
          dns: {
            type: 'object',
            additionalProperties: false,
            required: ['provider'],
            properties: {
              provider: { const: 'cloudflare' },
            },
          },
        },
      },
      assumptions: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['code', 'message'],
          properties: {
            code: { type: 'string', minLength: 1 },
            message: { type: 'string', minLength: 1 },
          },
        },
      },
    },
  },
} as const;

const SYSTEM_PROMPT = `
You convert natural-language requests into a strict Assembler AppSpec for a fixed-stack B2B web SaaS.

Rules:
- Use the fixed provider set only: Clerk, Stripe, Neon, Resend, Sentry, PostHog, Vercel, Cloudflare.
- Return data by calling the build_app_spec tool exactly once.
- If the user mentions payments or billing but does not specify subscription versus one-time, default billing.mode to "subscription" and record an assumption.
- If the user does not mention a custom domain, omit appSpec.domain.
- Keep descriptions concise and concrete.
- Do not add extra fields outside the schema.
`.trim();

export class PlannerParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PlannerParseError';
  }
}

export function createAnthropicClient(apiKey?: string): AnthropicMessagesClient {
  const client = new Anthropic(apiKey ? { apiKey } : {});

  return {
    messages: {
      create: async (request) => {
        const response = await client.messages.create({
          ...request,
          tools: request.tools,
        });

        return {
          stop_reason: response.stop_reason,
          content: response.content as PlannerContentBlock[],
        };
      },
    },
  };
}

export function createAnthropicAppSpecParser(
  options: AnthropicAppSpecParserOptions,
): AppSpecParser {
  const maxTokens = options.maxTokens ?? DEFAULT_MAX_TOKENS;

  return {
    async parse(prompt: string): Promise<AppSpecParseResult> {
      const response = await options.client.messages.create({
        model: options.model,
        max_tokens: maxTokens,
        system: SYSTEM_PROMPT,
        tools: [APP_SPEC_TOOL],
        tool_choice: {
          type: 'tool',
          name: APP_SPEC_TOOL_NAME,
        },
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
      });

      const toolUseBlock = response.content.find(isTargetToolUseBlock);
      if (!toolUseBlock) {
        throw new PlannerParseError(
          `Expected ${APP_SPEC_TOOL_NAME} tool use from Anthropic but received stop reason ${response.stop_reason ?? 'unknown'}.`,
        );
      }

      return normalizeParseResult(toolUseBlock.input);
    },
  };
}

function isTargetToolUseBlock(block: PlannerContentBlock): block is {
  type: 'tool_use';
  id: string;
  name: typeof APP_SPEC_TOOL_NAME;
  input: unknown;
} {
  return block.type === 'tool_use' && block.name === APP_SPEC_TOOL_NAME;
}

function normalizeParseResult(input: unknown): AppSpecParseResult {
  const record = asRecord(input, 'Anthropic tool input must be an object.');
  const appSpec = normalizeAppSpec(record.appSpec);
  const assumptions = normalizeAssumptions(record.assumptions);

  return {
    appSpec,
    assumptions,
  };
}

function normalizeAppSpec(input: unknown): AppSpec {
  const record = asRecord(input, 'Anthropic appSpec must be an object.');
  const domain = toOptionalString(record.domain);
  const budgetCeiling = toOptionalFiniteNumber(record.budgetCeiling);

  return {
    name: toNonEmptyString(record.name, 'appSpec.name'),
    description: toNonEmptyString(record.description, 'appSpec.description'),
    ...(domain ? { domain } : {}),
    auth: normalizeAuth(record.auth),
    billing: normalizeBilling(record.billing),
    database: normalizeSingleProvider(record.database, 'neon', 'appSpec.database'),
    email: normalizeSingleProvider(record.email, 'resend', 'appSpec.email'),
    monitoring: normalizeMonitoring(record.monitoring),
    hosting: normalizeSingleProvider(record.hosting, 'vercel', 'appSpec.hosting'),
    dns: normalizeSingleProvider(record.dns, 'cloudflare', 'appSpec.dns'),
    ...(budgetCeiling === undefined ? {} : { budgetCeiling }),
  };
}

function normalizeAuth(input: unknown): AppSpec['auth'] {
  const record = asRecord(input, 'appSpec.auth must be an object.');
  const provider = toNonEmptyString(record.provider, 'appSpec.auth.provider');
  const strategy = toNonEmptyString(record.strategy, 'appSpec.auth.strategy');

  if (provider !== 'clerk') {
    throw new PlannerParseError('appSpec.auth.provider must be "clerk".');
  }
  if (strategy !== 'email' && strategy !== 'google' && strategy !== 'both') {
    throw new PlannerParseError('appSpec.auth.strategy must be email, google, or both.');
  }

  return {
    provider,
    strategy,
  };
}

function normalizeBilling(input: unknown): AppSpec['billing'] {
  const record = asRecord(input, 'appSpec.billing must be an object.');
  const provider = toNonEmptyString(record.provider, 'appSpec.billing.provider');
  const mode = toNonEmptyString(record.mode, 'appSpec.billing.mode');

  if (provider !== 'stripe') {
    throw new PlannerParseError('appSpec.billing.provider must be "stripe".');
  }
  if (mode !== 'subscription' && mode !== 'one-time' && mode !== 'none') {
    throw new PlannerParseError('appSpec.billing.mode must be subscription, one-time, or none.');
  }

  return {
    provider,
    mode,
  };
}

function normalizeMonitoring(input: unknown): AppSpec['monitoring'] {
  const record = asRecord(input, 'appSpec.monitoring must be an object.');
  const errorTracking = toNonEmptyString(
    record.errorTracking,
    'appSpec.monitoring.errorTracking',
  );
  const analytics = toNonEmptyString(record.analytics, 'appSpec.monitoring.analytics');

  if (errorTracking !== 'sentry') {
    throw new PlannerParseError('appSpec.monitoring.errorTracking must be "sentry".');
  }
  if (analytics !== 'posthog') {
    throw new PlannerParseError('appSpec.monitoring.analytics must be "posthog".');
  }

  return {
    errorTracking,
    analytics,
  };
}

function normalizeSingleProvider<
  TExpected extends string,
  TReturn extends { provider: TExpected },
>(input: unknown, expectedProvider: TExpected, fieldName: string): TReturn {
  const record = asRecord(input, `${fieldName} must be an object.`);
  const provider = toNonEmptyString(record.provider, `${fieldName}.provider`);

  if (provider !== expectedProvider) {
    throw new PlannerParseError(`${fieldName}.provider must be "${expectedProvider}".`);
  }

  return {
    provider,
  } as TReturn;
}

function normalizeAssumptions(input: unknown): PlannerAssumption[] {
  if (!Array.isArray(input)) {
    throw new PlannerParseError('assumptions must be an array.');
  }

  return input.map((value, index) => {
    const record = asRecord(value, `assumptions[${index}] must be an object.`);
    return {
      code: toNonEmptyString(record.code, `assumptions[${index}].code`),
      message: toNonEmptyString(record.message, `assumptions[${index}].message`),
    };
  });
}

function asRecord(input: unknown, errorMessage: string): Record<string, unknown> {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    throw new PlannerParseError(errorMessage);
  }

  return input as Record<string, unknown>;
}

function toNonEmptyString(value: unknown, fieldName: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new PlannerParseError(`${fieldName} must be a non-empty string.`);
  }

  return value.trim();
}

function toOptionalString(value: unknown): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value !== 'string') {
    throw new PlannerParseError('Optional string fields must be strings when provided.');
  }

  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
}

function toOptionalFiniteNumber(value: unknown): number | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new PlannerParseError('budgetCeiling must be a non-negative finite number.');
  }

  return value;
}
