import type { DeployIntent, DeploymentTarget, DeploymentTargetRegistry } from '@assembler/types';

import { cloudflarePagesDeploymentTarget } from './targets/cloudflare-pages.js';
import { vercelDeploymentTarget } from './targets/vercel.js';

export function createDeploymentTargetRegistry(
  initialTargets: DeploymentTarget[] = [],
): DeploymentTargetRegistry {
  const targets: DeploymentTarget[] = [];

  for (const target of initialTargets) {
    targets.push(target);
  }

  return {
    register(target) {
      targets.push(target);
    },
    selectFor(intent: DeployIntent, preference?: string) {
      if (preference) {
        const preferredTarget = targets.find(
          (target) => target.name === preference || target.providerName === preference,
        );
        return preferredTarget?.supports(intent) ? preferredTarget : undefined;
      }

      return targets.find((target) => target.supports(intent));
    },
  };
}

export function createDefaultDeploymentTargetRegistry(): DeploymentTargetRegistry {
  return createDeploymentTargetRegistry([vercelDeploymentTarget, cloudflarePagesDeploymentTarget]);
}
