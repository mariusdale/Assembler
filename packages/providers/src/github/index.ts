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
import { GitHubClient } from './client.js';
import { loadProjectFiles } from './project.js';
import { loadGoldenPathTemplate } from './template.js';

export const githubProviderPack: ProviderPack = {
  name: 'github',
  actions: ['create-repo', 'use-existing-repo', 'push-code', 'commit-template', 'create-initial-commit'],
  preflight: async (creds: Credentials): Promise<PreflightResult> => {
    const errors: PreflightResult['errors'] = [];

    if (!creds.values.token) {
      return {
        valid: false,
        errors: [
          {
            code: 'GITHUB_TOKEN_MISSING',
            message: 'No GitHub token configured.',
            remediation:
              'Add a GitHub personal access token with "devassemble creds add github <token>".',
            url: 'https://github.com/settings/tokens',
          },
        ],
      };
    }

    try {
      const client = new GitHubClient(creds);
      const { scopes } = await client.getViewerWithScopes();
      if (!scopes.includes('repo')) {
        errors.push({
          code: 'GITHUB_MISSING_REPO_SCOPE',
          message: 'Your GitHub token is missing the "repo" scope.',
          remediation:
            'Generate a new token at https://github.com/settings/tokens with the "repo" scope checked.',
          url: 'https://github.com/settings/tokens',
        });
      }
    } catch (error) {
      if (error instanceof HttpError && error.status === 401) {
        errors.push({
          code: 'GITHUB_TOKEN_INVALID',
          message: 'Your GitHub token is invalid or expired.',
          remediation:
            'Generate a new token at https://github.com/settings/tokens and update it with "devassemble creds add github <token>".',
          url: 'https://github.com/settings/tokens',
        });
      } else {
        errors.push({
          code: 'GITHUB_PREFLIGHT_ERROR',
          message: `GitHub API check failed: ${error instanceof Error ? error.message : String(error)}`,
          remediation: 'Check your network connection and try again.',
        });
      }
    }

    return { valid: errors.length === 0, errors };
  },
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
        const name = asOptionalString(task.params.name) ?? toSlug(getProjectName(ctx));
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
      case 'use-existing-repo': {
        const remoteUrl = asString(task.params.remoteUrl, 'task.params.remoteUrl');
        const parsed = parseGitHubRemoteUrl(remoteUrl);
        const repository = await client.getRepository(parsed.owner, parsed.repo);

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
      case 'push-code': {
        const owner = asString(resolveRepositoryOutput(ctx, 'owner'), 'github repository owner');
        const repoName = asString(resolveRepositoryOutput(ctx, 'repoName'), 'github repository name');
        const branch = asString(
          resolveRepositoryOutput(ctx, 'defaultBranch'),
          'github repository default branch',
        );
        const directory =
          asOptionalString(task.params.directory) ?? ctx.projectScan?.directory;

        if (!directory) {
          throw new Error('GitHub push-code requires a local project directory.');
        }

        const files = await loadProjectFiles(directory);
        let lastCommitSha: string | undefined;

        for (const file of files) {
          ctx.log('info', `Uploading project file ${file.path}`, {
            provider: 'github',
            repoName,
          });
          try {
            const response = await client.createOrUpdateFile({
              owner,
              repo: repoName,
              path: file.path,
              content: file.content,
              message: `Sync ${file.path}`,
              branch,
            });
            lastCommitSha = response.commit.sha;
          } catch (error) {
            if (error instanceof HttpError && error.status === 404) {
              throw new Error(
                `Failed to push file "${file.path}" to ${owner}/${repoName}: repository not found or not yet initialized. ` +
                `The repo may still be initializing — try running "devassemble resume" in a few seconds.`,
              );
            }
            if (error instanceof HttpError && error.status === 403) {
              throw new Error(
                `Failed to push file "${file.path}" to ${owner}/${repoName}: permission denied. ` +
                `Ensure your GitHub token has the "repo" scope. Generate a new token at https://github.com/settings/tokens`,
              );
            }
            throw error;
          }
        }

        return {
          success: true,
          outputs: {
            branch,
            fileCount: files.length,
            ...(lastCommitSha ? { latestCommitSha: lastCommitSha } : {}),
          },
          message: `Uploaded ${files.length} project files to ${owner}/${repoName}.`,
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
        if (!ctx.appSpec) {
          throw new Error('GitHub commit-template requires an AppSpec.');
        }
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
    try {
      await client.deleteRepository(owner, repoName);
    } catch (error) {
      if (!(error instanceof HttpError) || error.status !== 404) {
        throw error;
      }
    }

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

function getProjectName(ctx: ExecutionContext): string {
  return (
    ctx.projectScan?.name ??
    ctx.appSpec?.name ??
    'devassemble-app'
  );
}

function resolveRepositoryOutput(
  ctx: ExecutionContext,
  key: 'owner' | 'repoName' | 'defaultBranch',
): unknown {
  return ctx.getOutput('github-use-existing-repo', key) ?? ctx.getOutput('github-create-repo', key);
}

function parseGitHubRemoteUrl(remoteUrl: string): { owner: string; repo: string } {
  const normalized = remoteUrl.trim();
  const httpsMatch = /^https:\/\/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?$/i.exec(normalized);
  if (httpsMatch?.[1] && httpsMatch[2]) {
    return {
      owner: httpsMatch[1],
      repo: httpsMatch[2],
    };
  }

  const sshMatch = /^git@github\.com:([^/]+)\/([^/]+?)(?:\.git)?$/i.exec(normalized);
  if (sshMatch?.[1] && sshMatch[2]) {
    return {
      owner: sshMatch[1],
      repo: sshMatch[2],
    };
  }

  throw new Error(
    `Unsupported GitHub remote URL format: "${remoteUrl}". ` +
    `Expected https://github.com/<owner>/<repo>.git or git@github.com:<owner>/<repo>.git`,
  );
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
