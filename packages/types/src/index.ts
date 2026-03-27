export interface AppSpec {
  name: string;
  description: string;
  domain?: string;
  auth: {
    provider: 'clerk';
    strategy: 'email' | 'google' | 'both';
  };
  billing: {
    provider: 'stripe';
    mode: 'subscription' | 'one-time' | 'none';
  };
  database: {
    provider: 'neon';
  };
  email: {
    provider: 'resend';
  };
  monitoring: {
    errorTracking: 'sentry';
    analytics: 'posthog';
  };
  hosting: {
    provider: 'vercel';
  };
  dns: {
    provider: 'cloudflare';
  };
  budgetCeiling?: number;
}

export type TaskStatus =
  | 'pending'
  | 'running'
  | 'success'
  | 'failed'
  | 'skipped'
  | 'rolled_back';

export type RiskLevel = 'low' | 'medium' | 'high';

export interface RetryPolicy {
  maxRetries: number;
  backoffMs: number;
}

export interface Task {
  id: string;
  name: string;
  provider: string;
  action: string;
  params: Record<string, unknown>;
  dependsOn: string[];
  outputs: Record<string, unknown>;
  status: TaskStatus;
  risk: RiskLevel;
  requiresApproval: boolean;
  retryPolicy: RetryPolicy;
  timeoutMs: number;
  error?: string;
  startedAt?: Date;
  completedAt?: Date;
}

export type RunPlanStatus =
  | 'draft'
  | 'approved'
  | 'executing'
  | 'completed'
  | 'failed'
  | 'rolled_back';

export interface RunPlan {
  id: string;
  appSpec: AppSpec;
  tasks: Task[];
  estimatedCostUsd: number;
  createdAt: Date;
  status: RunPlanStatus;
}

export interface Credentials {
  provider: string;
  values: Record<string, string>;
}

export interface DiscoveryResult {
  connected: boolean;
  accountId?: string;
  accountName?: string;
  metadata: Record<string, unknown>;
  error?: string;
}

export interface TaskTemplate {
  name: string;
  provider: string;
  action: string;
  params: Record<string, unknown>;
  dependsOn?: string[];
  risk: RiskLevel;
  requiresApproval: boolean;
  retryPolicy: RetryPolicy;
  timeoutMs: number;
}

export interface TaskResult {
  success: boolean;
  outputs: Record<string, unknown>;
  message?: string;
  metadata?: Record<string, unknown>;
}

export interface VerifyResult {
  success: boolean;
  message?: string;
  metadata?: Record<string, unknown>;
}

export interface RollbackResult {
  success: boolean;
  message?: string;
  metadata?: Record<string, unknown>;
}

export type RunEventLevel = 'info' | 'warn' | 'error';

export type RunEventType =
  | 'run.created'
  | 'run.updated'
  | 'task.status_changed'
  | 'task.log'
  | 'task.approval_requested'
  | 'task.approval_resolved'
  | 'run.completed'
  | 'run.failed'
  | 'run.rolled_back';

export interface RunEvent {
  id: string;
  runId: string;
  taskId?: string;
  type: RunEventType;
  level: RunEventLevel;
  message: string;
  timestamp: Date;
  metadata?: Record<string, unknown>;
}

export interface ExecutionContext {
  runId: string;
  appSpec: AppSpec;
  getOutput(taskId: string, key: string): unknown;
  getCredential(provider: string): Promise<Credentials>;
  log(level: RunEventLevel, msg: string, meta?: Record<string, unknown>): void;
  emitEvent(event: RunEvent): void;
}

export interface ProviderPack {
  name: string;
  actions: string[];
  discover(creds: Credentials): Promise<DiscoveryResult>;
  plan(action: string, params: unknown): Promise<TaskTemplate[]>;
  apply(task: Task, ctx: ExecutionContext): Promise<TaskResult>;
  verify(task: Task, ctx: ExecutionContext): Promise<VerifyResult>;
  rollback(task: Task, ctx: ExecutionContext): Promise<RollbackResult>;
}

