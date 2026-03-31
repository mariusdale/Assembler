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
import { VercelClient } from './client.js';

export const vercelProviderPack: ProviderPack = {
  name: 'vercel',
  actions: [
    'create-project',
    'link-repository',
    'sync-predeploy-env-vars',
    'deploy-preview',
    'wait-for-ready',
    'sync-postdeploy-env-vars',
    'add-domain',
    'set-preview-env-var',
    'deploy-branch-preview',
    'health-check',
  ],
  preflight: async (creds: Credentials): Promise<PreflightResult> => {
    const errors: PreflightResult['errors'] = [];

    if (!creds.values.token) {
      return {
        valid: false,
        errors: [
          {
            code: 'VERCEL_TOKEN_MISSING',
            message: 'No Vercel token configured.',
            remediation:
              'Add a Vercel token with "devassemble creds add vercel token=<token>".',
            url: 'https://vercel.com/account/tokens',
          },
        ],
      };
    }

    const client = new VercelClient(creds);

    try {
      await client.getUser();
    } catch (error) {
      if (error instanceof HttpError && (error.status === 401 || error.status === 403)) {
        errors.push({
          code: 'VERCEL_TOKEN_INVALID',
          message: 'Your Vercel token is invalid or expired.',
          remediation:
            'Generate a new token and update it with "devassemble creds add vercel token=<token>".',
          url: 'https://vercel.com/account/tokens',
        });
      } else {
        errors.push({
          code: 'VERCEL_PREFLIGHT_ERROR',
          message: `Vercel API check failed: ${error instanceof Error ? error.message : String(error)}`,
          remediation: 'Check your network connection and try again.',
        });
      }
      return { valid: false, errors };
    }

    try {
      const integrations = await client.listIntegrations();
      const hasGitHub = integrations.configurations?.some(
        (config) => config.slug === 'github' || config.slug === 'git-github',
      );
      if (!hasGitHub) {
        errors.push({
          code: 'VERCEL_GITHUB_NOT_INSTALLED',
          message: 'The Vercel GitHub App is not installed on your account.',
          remediation:
            'Install the Vercel GitHub integration so DevAssemble can link repositories to Vercel projects.',
          url: 'https://vercel.com/integrations/github',
        });
      }
    } catch {
      // Non-fatal: integration check failure shouldn't block preflight
    }

    return { valid: errors.length === 0, errors };
  },
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
        const projectName = asOptionalString(task.params.name) ?? toSlug(getProjectName(ctx));
        const framework = asOptionalString(task.params.framework) ?? 'nextjs';

        // Idempotency: check if project already exists
        try {
          const existing = await client.getProject(projectName);
          if (existing) {
            ctx.log('info', `Vercel project "${projectName}" already exists (${existing.id}), reusing.`, {
              provider: 'vercel',
              projectId: existing.id,
            });
            return {
              success: true,
              outputs: {
                projectId: existing.id,
                projectName: existing.name,
              },
              message: `Reused existing Vercel project "${projectName}".`,
            };
          }
        } catch (error) {
          if (!(error instanceof HttpError) || error.status !== 404) {
            throw error;
          }
        }

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
        const projectId = asString(ctx.getOutput('vercel-create-project', 'projectId'), 'vercel-create-project.projectId');
        const projectName =
          asOptionalString(ctx.getOutput('vercel-create-project', 'projectName')) ??
          asOptionalString(task.params.name) ??
          toSlug(getProjectName(ctx));
        const framework = asOptionalString(task.params.framework) ?? 'nextjs';
        const repoFullName = asString(
          resolveRepoOutput(ctx, 'repoFullName'),
          'github repository repoFullName',
        );
        const repoId = asNumberLike(
          resolveRepoOutput(ctx, 'repoId'),
          'github repository repoId',
        );
        const ownerId = asNumberLike(
          resolveRepoOutput(ctx, 'ownerId'),
          'github repository ownerId',
        );
        const productionBranch =
          asOptionalString(task.params.productionBranch) ??
          asOptionalString(resolveRepoOutput(ctx, 'defaultBranch')) ??
          'main';
        const project = await createOrResolveLinkedProject(client, {
          projectId,
          projectName,
          framework,
          repoFullName,
          repoId,
          ownerId,
          productionBranch,
        });

        return {
          success: true,
          outputs: {
            projectId: project.id,
            projectName: project.name,
            linkedRepo: repoFullName,
            productionBranch,
          },
        };
      }
      case 'sync-predeploy-env-vars':
      case 'sync-postdeploy-env-vars': {
        const projectId = getProjectId(ctx);
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
        const projectId = getProjectId(ctx);
        const projectName =
          asOptionalString(ctx.getOutput('vercel-link-repository', 'projectName')) ??
          asOptionalString(ctx.getOutput('vercel-create-project', 'projectName')) ??
          asOptionalString(task.params.name) ??
          toSlug(getProjectName(ctx));
        const repoId = asNumberLike(
          resolveRepoOutput(ctx, 'repoId'),
          'github repository repoId',
        );
        const ref =
          asOptionalString(resolveRepoOutput(ctx, 'defaultBranch')) ?? 'main';
        const sha =
          asOptionalString(ctx.getOutput('github-push-code', 'latestCommitSha')) ??
          asOptionalString(ctx.getOutput('github-scaffold-template', 'latestCommitSha')) ??
          asOptionalString(ctx.getOutput('github-initial-commit', 'latestCommitSha'));

        if (!sha) {
          throw new Error('A GitHub commit SHA is required before deploying to Vercel. Ensure code was pushed to the repository.');
        }

        const deployment = await client.createDeployment({
          name: projectName,
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
      case 'wait-for-ready': {
        const deploymentId = asString(
          ctx.getOutput('vercel-deploy-preview', 'deploymentId'),
          'vercel-deploy-preview.deploymentId',
        );
        const timeoutMs = asOptionalNumber(task.params.timeoutMs) ?? 120_000;
        const pollIntervalMs = asOptionalNumber(task.params.pollIntervalMs) ?? 4_000;
        const startedAt = Date.now();

        while (true) {
          const deployment = await client.getDeployment(deploymentId);
          const readyState = deployment.readyState ?? 'UNKNOWN';

          if (readyState === 'READY') {
            return {
              success: true,
              outputs: {
                deploymentId,
                readyState,
                previewUrl: `https://${deployment.url}`,
                ...(deployment.inspectorUrl ? { inspectorUrl: deployment.inspectorUrl } : {}),
              },
            };
          }

          if (!['QUEUED', 'BUILDING', 'INITIALIZING'].includes(readyState)) {
            const inspectorUrl = deployment.inspectorUrl ? ` View build logs: ${deployment.inspectorUrl}` : '';
            throw new Error(
              `Vercel deployment ${deploymentId} ended in state "${readyState}" instead of "READY".${inspectorUrl} ` +
              `Check the Vercel dashboard for build errors: https://vercel.com`,
            );
          }

          if (Date.now() - startedAt >= timeoutMs) {
            const inspectorUrl = deployment.inspectorUrl ? ` View build logs: ${deployment.inspectorUrl}` : '';
            throw new Error(
              `Timed out waiting for Vercel deployment ${deploymentId} to become ready (last state: "${readyState}").${inspectorUrl} ` +
              `The deployment may still be building — try running "devassemble resume" in a minute.`,
            );
          }

          await sleep(pollIntervalMs);
        }
      }
      case 'health-check': {
        const previewUrl =
          asOptionalString(ctx.getOutput('vercel-wait-for-ready', 'previewUrl')) ??
          asOptionalString(ctx.getOutput('vercel-deploy-preview', 'previewUrl'));

        if (!previewUrl) {
          throw new Error(
            'No preview URL available for health check. Ensure the deployment completed successfully.',
          );
        }

        const healthTimeoutMs = asOptionalNumber(task.params.timeoutMs) ?? 30_000;
        const healthStartedAt = Date.now();
        let lastError: string | undefined;
        let statusCode: number | undefined;
        let responseTimeMs: number | undefined;

        while (true) {
          try {
            const fetchStart = Date.now();
            const response = await fetch(previewUrl, {
              method: 'GET',
              redirect: 'follow',
              signal: AbortSignal.timeout(10_000),
            });
            responseTimeMs = Date.now() - fetchStart;
            statusCode = response.status;

            if (response.ok) {
              return {
                success: true,
                outputs: {
                  url: previewUrl,
                  statusCode,
                  responseTimeMs,
                  healthy: true,
                },
                message: `Health check passed: ${previewUrl} returned ${statusCode} in ${responseTimeMs}ms.`,
              };
            }

            lastError = `HTTP ${response.status}`;
          } catch (err) {
            lastError = err instanceof Error ? err.message : String(err);
          }

          if (Date.now() - healthStartedAt >= healthTimeoutMs) {
            return {
              success: true,
              outputs: {
                url: previewUrl,
                statusCode,
                responseTimeMs,
                healthy: false,
                error: lastError,
              },
              message: `Health check warning: ${previewUrl} did not return 200 within ${healthTimeoutMs / 1000}s (last: ${lastError}). The deployment may still be starting up.`,
            };
          }

          await sleep(3_000);
        }
      }
      case 'set-preview-env-var': {
        const projectId = asString(
          task.params.projectId ?? getOptionalProjectId(ctx),
          'task.params.projectId',
        );
        const key = asString(task.params.key, 'task.params.key');
        const value = asString(task.params.value, 'task.params.value');

        await client.createProjectEnv(projectId, {
          key,
          value,
          target: ['preview'],
          type: 'encrypted',
        });

        ctx.log('info', `Set preview env var "${key}" on Vercel project.`, {
          provider: 'vercel',
          key,
        });

        return {
          success: true,
          outputs: { key, synced: true, projectId },
          message: `Set preview env var "${key}".`,
        };
      }
      case 'deploy-branch-preview': {
        const projectName = asString(task.params.projectName, 'task.params.projectName');
        const projectId = asString(task.params.projectId, 'task.params.projectId');
        const repoId = task.params.repoId;
        const ref = asString(task.params.ref, 'task.params.ref');
        const sha = asString(task.params.sha, 'task.params.sha');

        const deployment = await client.createDeployment({
          name: projectName,
          project: projectId,
          repoId: String(repoId),
          ref,
          sha,
          target: 'preview',
        });

        ctx.log('info', `Triggered preview deployment for branch "${ref}".`, {
          provider: 'vercel',
          deploymentId: deployment.id,
        });

        return {
          success: true,
          outputs: {
            deploymentId: deployment.id,
            previewUrl: `https://${deployment.url}`,
            readyState: deployment.readyState ?? 'QUEUED',
            projectId,
          },
          message: `Triggered preview deployment for branch "${ref}".`,
        };
      }
      case 'add-domain': {
        const projectId = asString(
          task.params.projectId ?? getOptionalProjectId(ctx),
          'vercel-create-project.projectId',
        );
        const domain = asString(task.params.domain, 'task.params.domain');

        // Idempotency: check if domain already added
        const existing = await client.listDomains(projectId);
        const found = existing.domains.find((d) => d.name === domain);
        if (found) {
          ctx.log('info', `Domain "${domain}" already added to Vercel project.`, {
            provider: 'vercel',
            domain: found.name,
          });

          return {
            success: true,
            outputs: {
              domain: found.name,
              verified: found.verified,
              configured: found.configured,
              projectId,
            },
            message: `Domain "${domain}" already exists on the Vercel project.`,
          };
        }

        const result = await client.addDomain(projectId, domain);

        ctx.log('info', `Added domain "${result.name}" to Vercel project.`, {
          provider: 'vercel',
          domain: result.name,
          verified: result.verified,
        });

        return {
          success: true,
          outputs: {
            domain: result.name,
            verified: result.verified,
            configured: result.configured,
            projectId,
          },
          message: `Added domain "${result.name}" to Vercel project.`,
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

    if (task.action === 'wait-for-ready') {
      return {
        success: asOptionalString(task.outputs.readyState) === 'READY',
      };
    }

    if (task.action === 'health-check') {
      return { success: true };
    }

    if (
      task.action === 'create-project' ||
      task.action === 'link-repository' ||
      task.action === 'sync-predeploy-env-vars' ||
      task.action === 'sync-postdeploy-env-vars'
    ) {
      const projectId =
        asOptionalString(task.outputs.projectId) ?? asOptionalString(getOptionalProjectId(ctx));

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
    if (task.action === 'add-domain') {
      const domain = asOptionalString(task.outputs.domain);
      const projectId =
        asOptionalString(task.outputs.projectId) ?? asOptionalString(getOptionalProjectId(ctx));

      if (domain && projectId) {
        const client = new VercelClient(await ctx.getCredential('vercel'));
        try {
          await client.removeDomain(projectId, domain);
        } catch (error) {
          if (!(error instanceof HttpError) || error.status !== 404) {
            throw error;
          }
        }
      }

      return { success: true };
    }

    if (task.action !== 'create-project' && task.action !== 'link-repository') {
      return {
        success: true,
      };
    }

    const client = new VercelClient(await ctx.getCredential('vercel'));
    const projectId = asString(task.outputs.projectId, 'task.outputs.projectId');
    try {
      await client.deleteProject(projectId);
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
    // Outputs produced by the scan-based path (neon)
    push('DATABASE_URL', ctx.getOutput('neon-capture-database-url', 'databaseUrl'), allTargets);

    // Clerk keys (scan-based path uses clerk-capture-keys, old AppSpec path used separate tasks)
    push('CLERK_SECRET_KEY',
      ctx.getOutput('clerk-capture-keys', 'secretKey') ??
      ctx.getOutput('clerk-capture-secret-key', 'secretKey'),
      allTargets);
    push('NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY',
      ctx.getOutput('clerk-capture-keys', 'publishableKey') ??
      ctx.getOutput('clerk-capture-publishable-key', 'publishableKey'),
      allTargets);
    push('SENTRY_DSN', ctx.getOutput('sentry-capture-dsn', 'dsn'), allTargets);
    push('POSTHOG_API_KEY', ctx.getOutput('posthog-capture-api-key', 'apiKey'), allTargets);
    push('STRIPE_SECRET_KEY',
      ctx.getOutput('stripe-capture-keys', 'secretKey') ??
      ctx.getOutput('stripe-capture-secret-key', 'secretKey'),
      allTargets);
    push('NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY',
      ctx.getOutput('stripe-capture-keys', 'publishableKey'),
      allTargets);
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

function resolveRepoOutput(ctx: ExecutionContext, key: string): unknown {
  return (
    ctx.getOutput('github-use-existing-repo', key) ??
    ctx.getOutput('github-create-repo', key)
  );
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

function asOptionalNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

async function sleep(ms: number): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, ms));
}

function toSlug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 63) || 'devassemble-app';
}

function getProjectName(ctx: ExecutionContext): string {
  return ctx.projectScan?.name ?? ctx.appSpec?.name ?? 'devassemble-app';
}

function getProjectId(ctx: ExecutionContext): string {
  return asString(getOptionalProjectId(ctx), 'vercel project id');
}

function getOptionalProjectId(ctx: ExecutionContext): unknown {
  return (
    ctx.getOutput('vercel-link-repository', 'projectId') ??
    ctx.getOutput('vercel-create-project', 'projectId')
  );
}

async function createOrResolveLinkedProject(
  client: VercelClient,
  input: {
    projectId: string;
    projectName: string;
    framework: string;
    repoFullName: string;
    repoId: string | number;
    ownerId: string | number;
    productionBranch: string;
  },
): Promise<{ id: string; name: string }> {
  let existingProject: { id: string; name: string; link?: { repo?: string } } | undefined;

  try {
    existingProject = await client.getProject(input.projectId);
  } catch (error) {
    if (!(error instanceof HttpError) || error.status !== 404) {
      throw error;
    }
  }

  if (existingProject?.link?.repo === input.repoFullName) {
    return existingProject;
  }

  if (existingProject?.link?.repo) {
    throw new Error(
      `Vercel project "${input.projectName}" is already linked to repository "${existingProject.link.repo}", ` +
      `but DevAssemble expected it to link to "${input.repoFullName}". ` +
      `Either delete the existing Vercel project at https://vercel.com or use a different project name.`,
    );
  }

  if (existingProject) {
    // Project exists but has no repo link — safe to delete and recreate with link
    await client.deleteProject(input.projectId);
  }

  return client.createProject({
    name: input.projectName,
    framework: input.framework,
    gitRepository: {
      type: 'github',
      repo: input.repoFullName,
      repoId: input.repoId,
      repoOwnerId: input.ownerId,
      productionBranch: input.productionBranch,
    },
  });
}
