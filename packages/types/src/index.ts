export type ProjectFramework = 'nextjs' | 'remix' | 'astro' | 'node' | 'unknown';

export interface DetectedProvider {
  provider: string;
  confidence: 'high' | 'medium' | 'low';
  evidence: string[];
}

export interface EnvVarRequirement {
  name: string;
  provider?: string;
  source: string;
  isAutoProvisionable: boolean;
}

export type PackageManager = 'npm' | 'pnpm' | 'yarn';

export interface LockfileCheck {
  packageManager: PackageManager | undefined;
  lockfileExists: boolean;
  inSync: boolean;
  missingFromLockfile: string[];
  extraInLockfile: string[];
}

export interface ProjectScan {
  name: string;
  framework: ProjectFramework;
  directory: string;
  hasGitRemote: boolean;
  gitRemoteUrl?: string;
  detectedProviders: DetectedProvider[];
  requiredEnvVars: EnvVarRequirement[];
  packageJson: Record<string, unknown>;
  lockfileCheck: LockfileCheck;
}

export type TaskStatus =
  | 'pending'
  | 'running'
  | 'success'
  | 'failed'
  | 'skipped'
  | 'rolled_back'
  | 'awaiting_approval'
  | 'awaiting_operator';

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
  remediationHint?: string;
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
  projectScan?: ProjectScan;
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

export interface PreflightError {
  code: string;
  message: string;
  remediation: string;
  url?: string;
}

export interface PreflightResult {
  valid: boolean;
  errors: PreflightError[];
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
  projectScan: ProjectScan | undefined;
  getOutput(taskId: string, key: string): unknown;
  getCredential(provider: string): Promise<Credentials>;
  log(level: RunEventLevel, msg: string, meta?: Record<string, unknown>): void;
  emitEvent(event: RunEvent): void;
}

export interface PreviewRecord {
  id: string;
  parentRunId: string;
  branchName: string;
  previewRunId: string;
  neonBranchId?: string | undefined;
  neonProjectId?: string | undefined;
  vercelDeploymentId?: string | undefined;
  previewUrl?: string | undefined;
  createdAt: string;
  status: 'active' | 'torn_down';
}

export interface ProviderPack {
  name: string;
  actions: string[];
  preflight?(creds: Credentials): Promise<PreflightResult>;
  discover(creds: Credentials): Promise<DiscoveryResult>;
  plan(action: string, params: unknown): Promise<TaskTemplate[]>;
  apply(task: Task, ctx: ExecutionContext): Promise<TaskResult>;
  verify(task: Task, ctx: ExecutionContext): Promise<VerifyResult>;
  rollback(task: Task, ctx: ExecutionContext): Promise<RollbackResult>;
}
