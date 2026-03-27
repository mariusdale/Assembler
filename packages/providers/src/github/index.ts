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

import { HttpError } from '../shared/http.js';
import { GitHubClient } from './client.js';
import { loadGoldenPathTemplate } from './template.js';

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
        const name = asOptionalString(task.params.name) ?? toSlug(ctx.appSpec.name);
        const description = asOptionalString(task.params.description);
        const isPrivate = asOptionalBoolean(task.params.private) ?? true;
        const repository = await createOrReuseRepository(client, {
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
            owner: repository.owner.login,
            ownerId: repository.owner.id,
            defaultBranch: repository.default_branch,
          },
        };
      }
      case 'commit-template': {
        const owner = asString(
          ctx.getOutput('github-create-repo', 'owner'),
          'github-create-repo.owner',
        );
        const repoName = asString(
          ctx.getOutput('github-create-repo', 'repoName'),
          'github-create-repo.repoName',
        );
        const branch = asString(
          ctx.getOutput('github-create-repo', 'defaultBranch'),
          'github-create-repo.defaultBranch',
        );
        const files = await loadGoldenPathTemplate(ctx.appSpec);
        let lastCommitSha: string | undefined;

        for (const file of files) {
          ctx.log('info', `Uploading template file ${file.path}`, {
            provider: 'github',
            repoName,
          });
          const response = await client.createOrUpdateFile({
            owner,
            repo: repoName,
            path: file.path,
            content: file.content,
            message: `Scaffold ${file.path}`,
            branch,
          });
          lastCommitSha = response.commit.sha;
        }

        return {
          success: true,
          outputs: {
            templateName: 'next-saas',
            fileCount: files.length,
            branch,
            ...(lastCommitSha ? { latestCommitSha: lastCommitSha } : {}),
          },
          message: `Uploaded ${files.length} template files to ${owner}/${repoName}.`,
        };
      }
      case 'create-initial-commit':
        return {
          success: true,
          outputs: {
            branch: ctx.getOutput('github-create-repo', 'defaultBranch'),
            committed: true,
            latestCommitSha: ctx.getOutput('github-scaffold-template', 'latestCommitSha'),
          },
          message: 'Repository was auto-initialized and template files were committed.',
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

function toSlug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 63) || 'devassemble-app';
}

async function createOrReuseRepository(
  client: GitHubClient,
  input: {
    name: string;
    description?: string;
    private?: boolean;
  },
) {
  try {
    return await client.createRepository(input);
  } catch (error) {
    if (!(error instanceof HttpError) || error.status !== 422) {
      throw error;
    }

    const viewer = await client.getViewer();
    return client.getRepository(viewer.login, input.name);
  }
}
