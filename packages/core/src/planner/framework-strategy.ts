import type {
  DeploymentTargetPlanContext,
  DeploymentTargetRegistry,
  ProjectFramework,
  ProjectScan,
} from '@assembler/types';

import type { PlannerTaskSeed } from './types.js';
import { astroStrategy } from './strategies/astro.js';
import { nextjsStrategy } from './strategies/nextjs.js';
import { staticStrategy } from './strategies/static.js';

export interface FrameworkStrategyContext extends DeploymentTargetPlanContext {
  deploymentTargets: DeploymentTargetRegistry;
  deploymentTargetPreference?: string;
}

export interface FrameworkStrategy {
  readonly framework: ProjectFramework;
  matches(scan: ProjectScan): boolean;
  plan(ctx: FrameworkStrategyContext): PlannerTaskSeed[];
}

export interface FrameworkRegistry {
  register(strategy: FrameworkStrategy): void;
  resolve(scan: ProjectScan): FrameworkStrategy | undefined;
}

export function createFrameworkRegistry(): FrameworkRegistry {
  const strategies: FrameworkStrategy[] = [];

  return {
    register(strategy) {
      strategies.push(strategy);
    },
    resolve(scan) {
      return strategies.find((strategy) => strategy.matches(scan));
    },
  };
}

export function createDefaultFrameworkRegistry(): FrameworkRegistry {
  const registry = createFrameworkRegistry();
  registry.register(nextjsStrategy);
  registry.register(astroStrategy);
  registry.register(staticStrategy);
  return registry;
}
