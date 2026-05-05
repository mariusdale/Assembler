import type {
  DeployIntent,
  DeploymentTarget,
  DeploymentTaskSeed,
  RiskLevel,
} from '@assembler/types';

export const cloudflarePagesDeploymentTarget: DeploymentTarget = {
  name: 'cloudflare-pages',
  providerName: 'cloudflare',
  supports(intent: DeployIntent): boolean {
    return (
      intent.framework !== 'unknown' &&
      (intent.artifact === 'static' || intent.artifact === 'ssr-edge')
    );
  },
  plan(intent, ctx) {
    const projectParams = cloudflarePagesProjectParams(intent, ctx.appSlug);

    return [
      taskSeed(
        'cloudflare-pages-create-project',
        'Create Cloudflare Pages project',
        'cloudflare',
        'create-pages-project',
        [ctx.repoTaskId],
        projectParams,
        'medium',
        true,
      ),
      taskSeed(
        'cloudflare-pages-trigger-deployment',
        'Trigger Cloudflare Pages deployment',
        'cloudflare',
        'trigger-pages-deployment',
        ['cloudflare-pages-create-project', 'github-push-code'],
        projectParams,
        'medium',
      ),
      taskSeed(
        'cloudflare-pages-wait-for-ready',
        'Wait for Cloudflare Pages deployment readiness',
        'cloudflare',
        'wait-for-pages-ready',
        ['cloudflare-pages-trigger-deployment'],
      ),
      taskSeed(
        'cloudflare-pages-health-check',
        'Verify Cloudflare Pages deployment health',
        'cloudflare',
        'pages-health-check',
        ['cloudflare-pages-wait-for-ready'],
      ),
    ];
  },
};

function cloudflarePagesProjectParams(
  intent: DeployIntent,
  name: string,
): Record<string, unknown> {
  return {
    name,
    framework: intent.framework,
    artifact: intent.artifact,
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
