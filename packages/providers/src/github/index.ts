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

import { GitHubClient } from './client.js';

export const githubProviderPack: ProviderPack = {
  name: 'github',
  actions: ['create-repo', 'commit-template', 'create-initial-commit'],
  discover: async (creds: Credentials): Promise<DiscoveryResult> => {
    const client = new GitHubClient(creds);
    const user = await client.getViewer();

    return {
      connected: true,
      accountId: String(user.id),
      accountName: user.login,
      metadata: {
        login: user.login,
      },
    };
  },
  plan: async (action: string, params: unknown): Promise<TaskTemplate[]> => [
    await Promise.resolve({
      name: `GitHub ${action}`,
      provider: 'github',
      action,
      params: asParams(params),
      risk: action === 'create-repo' ? 'low' : 'medium',
      requiresApproval: false,
      retryPolicy: {
        maxRetries: 1,
        backoffMs: 500,
      },
      timeoutMs: 30_000,
    }),
  ],
  apply: async (task: Task, ctx: ExecutionContext): Promise<TaskResult> => {
    const client = new GitHubClient(await ctx.getCredential('github'));

    switch (task.action) {
      case 'create-repo': {
        const name = asString(task.params.name, 'task.params.name');
        const description = asOptionalString(task.params.description);
        const isPrivate = asOptionalBoolean(task.params.private) ?? true;
        const repository = await client.createRepository({
          name,
          ...(description ? { description } : {}),
          private: isPrivate,
        });

        return {
          success: true,
          outputs: {
            repoId: repository.id,
            repoName: repository.name,
            repoFullName: repository.full_name,
            repoUrl: repository.html_url,
            owner: repository.full_name.split('/')[0],
          },
        };
      }
      case 'commit-template':
      case 'create-initial-commit':
        return {
          success: true,
          outputs: {
            deferred: true,
            action: task.action,
          },
          message: `${task.action} is scaffolded but not implemented yet.`,
        };
      default:
        throw new Error(`Unsupported github action "${task.action}".`);
    }
  },
  verify: async (task: Task, ctx: ExecutionContext): Promise<VerifyResult> => {
    if (task.action !== 'create-repo') {
      return {
        success: true,
      };
    }

    const owner = asString(task.outputs.owner, 'task.outputs.owner');
    const repoName = asString(task.outputs.repoName, 'task.outputs.repoName');
    const client = new GitHubClient(await ctx.getCredential('github'));
    await client.getRepository(owner, repoName);

    return {
      success: true,
    };
  },
  rollback: async (task: Task, ctx: ExecutionContext): Promise<RollbackResult> => {
    if (task.action !== 'create-repo') {
      return {
        success: true,
      };
    }

    const owner = asString(task.outputs.owner, 'task.outputs.owner');
    const repoName = asString(task.outputs.repoName, 'task.outputs.repoName');
    const client = new GitHubClient(await ctx.getCredential('github'));
    await client.deleteRepository(owner, repoName);

    return {
      success: true,
    };
  },
};

function asParams(value: unknown): Record<string, unknown> {
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  return {};
}

function asString(value: unknown, fieldName: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${fieldName} must be a non-empty string.`);
  }

  return value;
}

function asOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value : undefined;
}

function asOptionalBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}
