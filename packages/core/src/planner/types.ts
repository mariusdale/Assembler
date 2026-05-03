import type { Task } from '@assembler/types';

import type { FrameworkRegistry } from './framework-strategy.js';

export interface CreateRunPlanOptions {
  now?: Date;
  idGenerator?: () => string;
  useExistingRepo?: boolean;
  frameworkRegistry?: FrameworkRegistry;
}

export interface PlannerTaskSeed {
  id: string;
  name: string;
  provider: string;
  action: string;
  params?: Record<string, unknown>;
  dependsOn?: string[];
  outputs?: Record<string, unknown>;
  risk?: Task['risk'];
  requiresApproval?: boolean;
  retryPolicy?: Task['retryPolicy'];
  timeoutMs?: number;
}
