import type { DeploymentTargetRegistry, DeploymentTaskSeed } from '@assembler/types';

import type { FrameworkRegistry } from './framework-strategy.js';

export interface CreateRunPlanOptions {
  now?: Date;
  idGenerator?: () => string;
  useExistingRepo?: boolean;
  frameworkRegistry?: FrameworkRegistry;
  deploymentTargetRegistry?: DeploymentTargetRegistry;
  deploymentTargetPreference?: string;
}

export type PlannerTaskSeed = DeploymentTaskSeed;
