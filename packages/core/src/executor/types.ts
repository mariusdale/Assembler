import type {
  Credentials,
  ExecutionContext,
  ProviderPack,
  RollbackResult,
  RunEvent,
  RunEventLevel,
  RunPlan,
  Task,
  TaskResult,
  VerifyResult,
} from '@assembler/types';

export interface CredentialRecord {
  provider: string;
  reference: string;
  metadata?: Record<string, unknown>;
}

export interface RunStateStore {
  initialize(): void;
  saveRun(runPlan: RunPlan): void;
  loadRun(runId: string): RunPlan | undefined;
  listRuns(): RunPlan[];
  listEvents(runId: string): RunEvent[];
  appendEvent(event: RunEvent): void;
  saveRunWithEvent(runPlan: RunPlan, event: RunEvent): void;
  putCredentialRecord(record: CredentialRecord): void;
  getCredentialRecord(provider: string): CredentialRecord | undefined;
  listCredentialRecords(): CredentialRecord[];
  close(): void;
}

export interface ProviderRegistry {
  get(providerName: string): ProviderPack | undefined;
}

export interface ApprovalRequest {
  runPlan: RunPlan;
  task: Task;
}

export interface FailureRequest {
  runPlan: RunPlan;
  task: Task;
  error: Error;
  attemptNumber: number;
}

export interface RetryDecision {
  retry: boolean;
}

export interface ExecutorOptions {
  stateStore: RunStateStore;
  providers: Record<string, ProviderPack> | Map<string, ProviderPack> | ProviderRegistry;
  credentialResolver?: (provider: string, record?: CredentialRecord) => Promise<Credentials>;
  approveTask?: (request: ApprovalRequest) => Promise<boolean>;
  onTaskFailure?: (request: FailureRequest) => Promise<RetryDecision>;
  idGenerator?: () => string;
  now?: () => Date;
  sleep?: (ms: number) => Promise<void>;
}

export interface ExecuteRunOptions {
  runPlan: RunPlan;
}

export interface ExecuteRunResult {
  runPlan: RunPlan;
}

export interface ExecutorControl {
  execute(options: ExecuteRunOptions): Promise<ExecuteRunResult>;
  resume(runId: string): Promise<ExecuteRunResult>;
  rollback(runId: string): Promise<RunPlan>;
}

export interface MutableExecutionContext extends ExecutionContext {
  setRunPlan(runPlan: RunPlan): void;
}

export interface TaskAttemptResult {
  taskResult: TaskResult;
  verifyResult: VerifyResult;
}

export interface TaskRollbackResponse {
  rollbackResult: RollbackResult;
}

export interface SerializedRunPlan extends Omit<RunPlan, 'createdAt' | 'tasks'> {
  createdAt: string;
  tasks: Array<
    Omit<Task, 'startedAt' | 'completedAt'> & {
      startedAt?: string;
      completedAt?: string;
    }
  >;
}

export interface ExecutorRuntimeDependencies {
  now: () => Date;
  idGenerator: () => string;
  sleep: (ms: number) => Promise<void>;
}

export interface RunSummary {
  runPlan: RunPlan;
  events: RunEvent[];
}

export interface ExecutionLogEntry {
  level: RunEventLevel;
  message: string;
  metadata?: Record<string, unknown>;
}

export interface ExecuteTaskResponse {
  runPlan: RunPlan;
  task: Task;
}

export interface RuntimeInternals {
  providers: ProviderRegistry;
  stateStore: RunStateStore;
  deps: ExecutorRuntimeDependencies;
  createContext(runPlan: RunPlan): MutableExecutionContext;
}

export type TaskTerminalStatus = 'success' | 'failed' | 'skipped' | 'rolled_back';

export interface ResumeNormalizationResult {
  runPlan: RunPlan;
  resetTaskIds: string[];
}

export type ExecutorEventType = 'run' | 'task' | 'approval' | 'rollback';

export interface ProviderExecutionResult {
  taskResult: TaskResult;
  verifyResult: VerifyResult;
}

export interface ProviderRollbackExecutionResult {
  rollbackResult: RollbackResult;
}
