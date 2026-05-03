import type { DeployIntent } from '@assembler/types';

import type { FrameworkStrategy } from '../framework-strategy.js';

export const nextjsStrategy: FrameworkStrategy = {
  framework: 'nextjs',
  matches(scan) {
    return scan.framework === 'nextjs';
  },
  plan(ctx) {
    const intent: DeployIntent = {
      artifact: 'ssr-node',
      framework: ctx.projectScan.framework,
      envVarKeys: ctx.projectScan.requiredEnvVars.map((envVar) => envVar.name),
    };
    const target = ctx.deploymentTargets.selectFor(intent, ctx.deploymentTargetPreference);

    if (!target) {
      throw new Error(`No deployment target supports ${intent.framework} ${intent.artifact} apps.`);
    }

    return target.plan(intent, ctx);
  },
};
