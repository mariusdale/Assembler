import type {
  DeployIntent,
  DeploymentTarget,
  DeploymentTaskSeed,
  RiskLevel,
} from '@assembler/types';

export const vercelDeploymentTarget: DeploymentTarget = {
  name: 'vercel',
  providerName: 'vercel',
  supports(intent: DeployIntent): boolean {
    return intent.framework !== 'unknown' && intent.artifact !== 'docker';
  },
  plan(intent, ctx) {
    const predeployDependencies = ['github-push-code'];
    if (ctx.requiresProvider('neon')) {
      predeployDependencies.push('neon-capture-database-url');
    }
    if (ctx.requiresProvider('stripe')) {
      predeployDependencies.push('stripe-capture-keys');
    }
    if (ctx.requiresProvider('clerk')) {
      predeployDependencies.push('clerk-capture-keys');
    }
    if (ctx.requiresProvider('sentry')) {
      predeployDependencies.push('sentry-capture-dsn');
    }
    if (ctx.requiresProvider('resend')) {
      predeployDependencies.push('resend-capture-api-key');
    }

    const projectParams = vercelProjectParams(intent, ctx.appSlug);

    return [
      taskSeed(
        'vercel-create-project',
        'Create Vercel project',
        'vercel',
        'create-project',
        [ctx.repoTaskId],
        projectParams,
        'medium',
        true,
      ),
      taskSeed(
        'vercel-link-repository',
        'Link Vercel to GitHub repository',
        'vercel',
        'link-repository',
        ['vercel-create-project', 'github-push-code'],
        projectParams,
        'medium',
        true,
      ),
      taskSeed(
        'vercel-sync-predeploy-env-vars',
        'Sync environment variables to Vercel',
        'vercel',
        'sync-predeploy-env-vars',
        ['vercel-link-repository', ...predeployDependencies],
      ),
      taskSeed(
        'vercel-deploy-preview',
        'Deploy to Vercel preview',
        'vercel',
        'deploy-preview',
        ['vercel-sync-predeploy-env-vars'],
      ),
      taskSeed(
        'vercel-wait-for-ready',
        'Wait for Vercel deployment readiness',
        'vercel',
        'wait-for-ready',
        ['vercel-deploy-preview'],
      ),
      taskSeed(
        'vercel-health-check',
        'Verify deployment health',
        'vercel',
        'health-check',
        ['vercel-wait-for-ready'],
      ),
    ];
  },
};

function vercelProjectParams(intent: DeployIntent, name: string): Record<string, unknown> {
  return {
    name,
    framework: intent.framework,
    ...(intent.buildCommand ? { buildCommand: intent.buildCommand } : {}),
    ...(intent.outputDirectory ? { outputDirectory: intent.outputDirectory } : {}),
    ...(intent.nodeVersion ? { nodeVersion: intent.nodeVersion } : {}),
  };
}

function taskSeed(
  id: string,
  name: string,
  provider: string,
  action: string,
  dependsOn: string[] = [],
  params: Record<string, unknown> = {},
  risk: RiskLevel = 'low',
  requiresApproval = false,
): DeploymentTaskSeed {
  return {
    id,
    name,
    provider,
    action,
    params,
    dependsOn,
    risk,
    requiresApproval,
  };
}
