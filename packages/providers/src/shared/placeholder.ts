import type {
  Credentials,
  DiscoveryResult,
  ExecutionContext,
  ProviderPack,
  RollbackResult,
  Task,
  TaskResult,
  TaskTemplate,
  VerifyResult,
} from '@devassemble/types';

export interface PlaceholderActionOutputFactoryContext {
  task: Task;
  ctx: ExecutionContext;
}

export interface PlaceholderProviderOptions {
  name: string;
  actions: string[];
  createOutputs?: (
    action: string,
    options: PlaceholderActionOutputFactoryContext,
  ) => Record<string, unknown>;
}

export function createPlaceholderProviderPack(
  options: PlaceholderProviderOptions,
): ProviderPack {
  return {
    name: options.name,
    actions: options.actions,
    discover: (creds: Credentials): Promise<DiscoveryResult> =>
      Promise.resolve({
        connected: hasToken(creds),
        metadata: {
          placeholder: true,
        },
        ...(hasToken(creds) ? {} : { error: `Missing ${options.name} credential.` }),
      }),
    plan: (action: string, params: unknown): Promise<TaskTemplate[]> =>
      Promise.resolve([
        {
          name: `${options.name} ${action}`,
          provider: options.name,
          action,
          params: asParams(params),
          risk: 'low',
          requiresApproval: false,
          retryPolicy: {
            maxRetries: 0,
            backoffMs: 0,
          },
          timeoutMs: 15_000,
        },
      ]),
    apply: (task: Task, ctx: ExecutionContext): Promise<TaskResult> =>
      Promise.resolve({
        success: true,
        outputs: {
          placeholder: true,
          ...(options.createOutputs?.(task.action, { task, ctx }) ?? {}),
        },
        message: `${options.name}:${task.action} is using the Milestone 4 placeholder provider.`,
      }),
    verify: (): Promise<VerifyResult> =>
      Promise.resolve({
        success: true,
        metadata: {
          placeholder: true,
        },
      }),
    rollback: (): Promise<RollbackResult> =>
      Promise.resolve({
        success: true,
        metadata: {
          placeholder: true,
        },
      }),
  };
}

function hasToken(creds: Credentials): boolean {
  return typeof creds.values.token === 'string' && creds.values.token.trim().length > 0;
}

function asParams(value: unknown): Record<string, unknown> {
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  return {};
}
