import type { Task } from '@assembler/types';

export interface CreateRunPlanOptions {
  now?: Date;
  idGenerator?: () => string;
  useExistingRepo?: boolean;
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
