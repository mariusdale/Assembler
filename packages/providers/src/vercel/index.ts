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

import { VercelClient } from './client.js';

export const vercelProviderPack: ProviderPack = {
  name: 'vercel',
  actions: [
    'create-project',
    'link-repository',
    'sync-predeploy-env-vars',
    'deploy-preview',
    'sync-postdeploy-env-vars',
  ],
  discover: (creds: Credentials): Promise<DiscoveryResult> => {
    const tokenPresent = typeof creds.values.token === 'string' && creds.values.token.length > 0;

    return Promise.resolve({
      connected: tokenPresent,
      metadata: {},
      ...(tokenPresent ? {} : { error: 'Missing Vercel API token.' }),
    });
  },
  plan: (action: string, params: unknown): Promise<TaskTemplate[]> =>
    Promise.resolve([
      {
        name: `Vercel ${action}`,
        provider: 'vercel',
        action,
        params: asParams(params),
        risk: action === 'deploy-preview' ? 'medium' : 'low',
        requiresApproval: action === 'create-project' || action === 'link-repository',
        retryPolicy: {
          maxRetries: 1,
          backoffMs: 500,
        },
        timeoutMs: 30_000,
      },
    ]),
  apply: async (task: Task, ctx: ExecutionContext): Promise<TaskResult> => {
    const client = new VercelClient(await ctx.getCredential('vercel'));

    switch (task.action) {
      case 'create-project': {
        const projectName = asOptionalString(task.params.name) ?? toSlug(ctx.appSpec.name);
        const framework = asOptionalString(task.params.framework) ?? 'nextjs';
        const project = await client.createProject({
          name: projectName,
          framework,
        });

        return {
          success: true,
          outputs: {
            projectId: project.id,
            projectName: project.name,
          },
        };
      }
      case 'link-repository': {
        const projectId = asString(
          ctx.getOutput('vercel-create-project', 'projectId'),
          'vercel-create-project.projectId',
        );
        const repoFullName = asString(
          ctx.getOutput('github-create-repo', 'repoFullName'),
          'github-create-repo.repoFullName',
        );
        const repoId = asNumberLike(
          ctx.getOutput('github-create-repo', 'repoId'),
          'github-create-repo.repoId',
        );
        const ownerId = asNumberLike(
          ctx.getOutput('github-create-repo', 'ownerId'),
          'github-create-repo.ownerId',
        );
        const productionBranch =
          asOptionalString(task.params.productionBranch) ??
          asOptionalString(ctx.getOutput('github-create-repo', 'defaultBranch')) ??
          'main';

        const project = await client.updateProject(projectId, {
          gitRepository: {
            type: 'github',
            repo: repoFullName,
            repoId,
            repoOwnerId: ownerId,
            productionBranch,
          },
        });

        return {
          success: true,
          outputs: {
            projectId: project.id,
            linkedRepo: repoFullName,
            productionBranch,
          },
        };
      }
      case 'sync-predeploy-env-vars':
      case 'sync-postdeploy-env-vars': {
        const projectId = asString(
          ctx.getOutput('vercel-create-project', 'projectId'),
          'vercel-create-project.projectId',
        );
        const vars = collectEnvVars(ctx, task.action);

        for (const envVar of vars) {
          await client.createProjectEnv(projectId, envVar);
        }

        return {
          success: true,
          outputs: {
            syncedKeys: vars.map((envVar) => envVar.key),
            syncPhase: task.action,
          },
          message: `Synced ${vars.length} environment variables to Vercel.`,
        };
      }
      case 'deploy-preview': {
        const projectId = asString(
          ctx.getOutput('vercel-create-project', 'projectId'),
          'vercel-create-project.projectId',
        );
        const repoId = asNumberLike(
          ctx.getOutput('github-create-repo', 'repoId'),
          'github-create-repo.repoId',
        );
        const ref =
          asOptionalString(ctx.getOutput('github-create-repo', 'defaultBranch')) ?? 'main';
        const sha =
          asOptionalString(ctx.getOutput('github-scaffold-template', 'latestCommitSha')) ??
          asOptionalString(ctx.getOutput('github-initial-commit', 'latestCommitSha'));

        if (!sha) {
          throw new Error('GitHub template commit SHA is required before deploying to Vercel.');
        }

        const deployment = await client.createDeployment({
          project: projectId,
          repoId,
          ref,
          sha,
          target: 'preview',
        });

        return {
          success: true,
          outputs: {
            deploymentId: deployment.id,
            previewUrl: `https://${deployment.url}`,
            readyState: deployment.readyState ?? 'QUEUED',
            ...(deployment.inspectorUrl ? { inspectorUrl: deployment.inspectorUrl } : {}),
          },
        };
      }
      default:
        throw new Error(`Unsupported vercel action "${task.action}".`);
    }
  },
  verify: async (task: Task, ctx: ExecutionContext): Promise<VerifyResult> => {
    const client = new VercelClient(await ctx.getCredential('vercel'));

    if (task.action === 'deploy-preview') {
      const deploymentId = asString(task.outputs.deploymentId, 'task.outputs.deploymentId');
      const deployment = await client.getDeployment(deploymentId);

      return {
        success: typeof deployment.url === 'string' && deployment.url.length > 0,
        metadata: {
          readyState: deployment.readyState,
          url: deployment.url,
        },
      };
    }

    if (
      task.action === 'create-project' ||
      task.action === 'link-repository' ||
      task.action === 'sync-predeploy-env-vars' ||
      task.action === 'sync-postdeploy-env-vars'
    ) {
      const projectId =
        asOptionalString(task.outputs.projectId) ??
        asOptionalString(ctx.getOutput('vercel-create-project', 'projectId'));

      if (!projectId) {
        return {
          success: true,
        };
      }

      await client.getProject(projectId);

      return {
        success: true,
      };
    }

    return {
      success: true,
    };
  },
  rollback: async (task: Task, ctx: ExecutionContext): Promise<RollbackResult> => {
    if (task.action !== 'create-project') {
      return {
        success: true,
      };
    }

    const client = new VercelClient(await ctx.getCredential('vercel'));
    const projectId = asString(task.outputs.projectId, 'task.outputs.projectId');
    await client.deleteProject(projectId);

    return {
      success: true,
    };
  },
};

function collectEnvVars(
  ctx: ExecutionContext,
  action: Task['action'],
): Array<{
  key: string;
  value: string;
  target: Array<'preview' | 'production'>;
  type: 'encrypted';
}> {
  const previewTarget: Array<'preview' | 'production'> = ['preview'];
  const allTargets: Array<'preview' | 'production'> = ['preview', 'production'];
  const vars: Array<{
    key: string;
    value: string;
    target: Array<'preview' | 'production'>;
    type: 'encrypted';
  }> = [];

  const push = (
    key: string,
    value: unknown,
    target: Array<'preview' | 'production'>,
  ): void => {
    const normalized = asOptionalString(value);
    if (!normalized) {
      return;
    }

    vars.push({
      key,
      value: normalized,
      target,
      type: 'encrypted',
    });
  };

  if (action === 'sync-predeploy-env-vars') {
    push('DATABASE_URL', ctx.getOutput('neon-capture-database-url', 'databaseUrl'), allTargets);
    push('CLERK_SECRET_KEY', ctx.getOutput('clerk-capture-secret-key', 'secretKey'), allTargets);
    push(
      'NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY',
      ctx.getOutput('clerk-capture-publishable-key', 'publishableKey'),
      allTargets,
    );
    push('SENTRY_DSN', ctx.getOutput('sentry-capture-dsn', 'dsn'), allTargets);
    push('POSTHOG_API_KEY', ctx.getOutput('posthog-capture-api-key', 'apiKey'), allTargets);
    push('STRIPE_SECRET_KEY', ctx.getOutput('stripe-capture-secret-key', 'secretKey'), allTargets);
    push('RESEND_API_KEY', ctx.getOutput('resend-capture-api-key', 'apiKey'), allTargets);
  }

  if (action === 'sync-postdeploy-env-vars') {
    push(
      'STRIPE_WEBHOOK_SECRET',
      ctx.getOutput('stripe-capture-webhook-secret', 'webhookSecret'),
      allTargets,
    );
    push('RESEND_API_KEY', ctx.getOutput('resend-capture-api-key', 'apiKey'), allTargets);
    push(
      'NEXT_PUBLIC_APP_URL',
      ctx.getOutput('vercel-deploy-preview', 'previewUrl'),
      previewTarget,
    );
  }

  return vars;
}

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

function asNumberLike(value: unknown, fieldName: string): string | number {
  if (
    typeof value === 'number' ||
    (typeof value === 'string' && value.trim() !== '')
  ) {
    return value;
  }

  throw new Error(`${fieldName} must be a non-empty string or number.`);
}

function toSlug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 63) || 'devassemble-app';
}
