import type {
  Credentials,
  ProviderPack,
  RollbackResult,
  RunEvent,
  RunPlan,
  Task,
  TaskStatus,
} from '@devassemble/types';

import type {
  ApprovalRequest,
  CredentialRecord,
  ExecuteRunOptions,
  ExecuteRunResult,
  ExecutorControl,
  ExecutorOptions,
  MutableExecutionContext,
  ProviderRegistry,
  ResumeNormalizationResult,
  RunStateStore,
} from './types.js';

export class ExecutionRuntimeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ExecutionRuntimeError';
  }
}

interface RuntimeOptions {
  now: () => Date;
  idGenerator: () => string;
  sleep: (ms: number) => Promise<void>;
}

interface RunExecutionLoopOptions {
  runPlan: RunPlan;
  stateStore: RunStateStore;
  providerRegistry: ProviderRegistry;
  runtimeOptions: RuntimeOptions;
  credentialResolver?: (provider: string, record?: CredentialRecord) => Promise<Credentials>;
  approveTask?: (request: ApprovalRequest) => Promise<boolean>;
  onTaskFailure?: (request: {
    runPlan: RunPlan;
    task: Task;
    error: Error;
    attemptNumber: number;
  }) => Promise<{ retry: boolean }>;
  resumeResetTaskIds?: string[];
}

interface ExecuteTaskWithRetryOptions {
  runPlan: RunPlan;
  taskId: string;
  provider: ProviderPack;
  context: MutableExecutionContext;
  runtimeOptions: RuntimeOptions;
  stateStore: RunStateStore;
  onTaskFailure?: (request: {
    runPlan: RunPlan;
    task: Task;
    error: Error;
    attemptNumber: number;
  }) => Promise<{ retry: boolean }>;
}

export function createExecutor(options: ExecutorOptions): ExecutorControl {
  options.stateStore.initialize();

  const providerRegistry = normalizeProviderRegistry(options.providers);
  const runtimeOptions: RuntimeOptions = {
    now: options.now ?? (() => new Date()),
    idGenerator: options.idGenerator ?? (() => crypto.randomUUID()),
    sleep: options.sleep ?? ((ms) => new Promise<void>((resolve) => setTimeout(resolve, ms))),
  };

  return {
    execute: async ({ runPlan }: ExecuteRunOptions): Promise<ExecuteRunResult> => {
      options.stateStore.saveRun(runPlan);
      const executedRunPlan = await runExecutionLoop({
        runPlan,
        stateStore: options.stateStore,
        providerRegistry,
        runtimeOptions,
        ...(options.credentialResolver ? { credentialResolver: options.credentialResolver } : {}),
        ...(options.approveTask ? { approveTask: options.approveTask } : {}),
        ...(options.onTaskFailure ? { onTaskFailure: options.onTaskFailure } : {}),
      });

      return { runPlan: executedRunPlan };
    },
    resume: async (runId: string): Promise<ExecuteRunResult> => {
      const storedRunPlan = options.stateStore.loadRun(runId);
      if (!storedRunPlan) {
        throw new ExecutionRuntimeError(`Run "${runId}" was not found in the state store.`);
      }

      const normalized = normalizeRunPlanForResume(storedRunPlan);
      const resumedRunPlan = await runExecutionLoop({
        runPlan: normalized.runPlan,
        stateStore: options.stateStore,
        providerRegistry,
        runtimeOptions,
        ...(options.credentialResolver ? { credentialResolver: options.credentialResolver } : {}),
        ...(options.approveTask ? { approveTask: options.approveTask } : {}),
        ...(options.onTaskFailure ? { onTaskFailure: options.onTaskFailure } : {}),
        ...(normalized.resetTaskIds.length > 0
          ? { resumeResetTaskIds: normalized.resetTaskIds }
          : {}),
      });

      return { runPlan: resumedRunPlan };
    },
    rollback: async (runId: string): Promise<RunPlan> => {
      const storedRunPlan = options.stateStore.loadRun(runId);
      if (!storedRunPlan) {
        throw new ExecutionRuntimeError(`Run "${runId}" was not found in the state store.`);
      }

      const context = createMutableExecutionContext({
        runPlan: storedRunPlan,
        stateStore: options.stateStore,
        runtimeOptions,
        ...(options.credentialResolver ? { credentialResolver: options.credentialResolver } : {}),
      });

      let workingRunPlan: RunPlan = storedRunPlan;
      const successfulTasks = workingRunPlan.tasks
        .filter((task) => task.status === 'success')
        .slice()
        .reverse();

      for (const task of successfulTasks) {
        const provider = providerRegistry.get(task.provider);
        if (!provider) {
          throw new ExecutionRuntimeError(`Provider "${task.provider}" is not registered.`);
        }

        const rollbackResult: RollbackResult = await provider.rollback(task, context);
        void rollbackResult;

        workingRunPlan = updateTask(workingRunPlan, task.id, (currentTask) =>
          withTaskFields(currentTask, {
            status: 'rolled_back',
            completedAt: runtimeOptions.now(),
          }),
        );
        context.setRunPlan(workingRunPlan);

        options.stateStore.saveRunWithEvent(
          workingRunPlan,
          createEvent(runtimeOptions, workingRunPlan.id, {
            taskId: task.id,
            type: 'task.status_changed',
            level: 'warn',
            message: `Task ${task.id} rolled back.`,
            metadata: { status: 'rolled_back' },
          }),
        );
      }

      workingRunPlan = {
        ...workingRunPlan,
        status: 'rolled_back',
      };
      options.stateStore.saveRunWithEvent(
        workingRunPlan,
        createEvent(runtimeOptions, workingRunPlan.id, {
          type: 'run.rolled_back',
          level: 'warn',
          message: 'Run rolled back.',
        }),
      );

      return workingRunPlan;
    },
  };
}

async function runExecutionLoop(options: RunExecutionLoopOptions): Promise<RunPlan> {
  let runPlan: RunPlan = {
    ...options.runPlan,
    status: 'executing',
  };

  const context = createMutableExecutionContext({
    runPlan,
    stateStore: options.stateStore,
    runtimeOptions: options.runtimeOptions,
    ...(options.credentialResolver ? { credentialResolver: options.credentialResolver } : {}),
  });

  options.stateStore.saveRunWithEvent(
    runPlan,
    createEvent(options.runtimeOptions, runPlan.id, {
      type: 'run.updated',
      level: 'info',
      message:
        options.resumeResetTaskIds && options.resumeResetTaskIds.length > 0
          ? 'Run resumed from checkpoint.'
          : 'Run execution started.',
      ...(options.resumeResetTaskIds && options.resumeResetTaskIds.length > 0
        ? { metadata: { resetTaskIds: options.resumeResetTaskIds } }
        : {}),
    }),
  );

  while (true) {
    const readyTasks = getReadyTasks(runPlan);

    if (readyTasks.length === 0) {
      const skippedRunPlan = skipBlockedPendingTasks(runPlan, options.runtimeOptions.now());
      if (skippedRunPlan !== runPlan) {
        runPlan = skippedRunPlan;
        context.setRunPlan(runPlan);
        options.stateStore.saveRun(runPlan);
        continue;
      }

      if (runPlan.tasks.every((task) => isTerminalTaskStatus(task.status))) {
        const finalStatus: RunPlan['status'] = runPlan.tasks.some((task) => task.status === 'failed')
          ? 'failed'
          : 'completed';
        runPlan = {
          ...runPlan,
          status: finalStatus,
        };

        options.stateStore.saveRunWithEvent(
          runPlan,
          createEvent(options.runtimeOptions, runPlan.id, {
            type: finalStatus === 'completed' ? 'run.completed' : 'run.failed',
            level: finalStatus === 'completed' ? 'info' : 'error',
            message:
              finalStatus === 'completed'
                ? 'Run completed successfully.'
                : 'Run failed during execution.',
          }),
        );

        return runPlan;
      }

      throw new ExecutionRuntimeError(
        `Run "${runPlan.id}" has pending tasks but no executable tasks. The DAG is blocked.`,
      );
    }

    const task = readyTasks[0];
    if (!task) {
      throw new ExecutionRuntimeError('Expected at least one ready task.');
    }

    if (task.requiresApproval) {
      const approved = await (options.approveTask?.({ runPlan, task }) ?? Promise.resolve(true));
      options.stateStore.appendEvent(
        createEvent(options.runtimeOptions, runPlan.id, {
          taskId: task.id,
          type: 'task.approval_resolved',
          level: approved ? 'info' : 'warn',
          message: approved ? `Task ${task.id} approved.` : `Task ${task.id} rejected.`,
          metadata: { approved },
        }),
      );

      if (!approved) {
        runPlan = updateTask(runPlan, task.id, (currentTask) =>
          withTaskFields(currentTask, {
            status: 'skipped',
            completedAt: options.runtimeOptions.now(),
            error: 'Task execution rejected by approval policy.',
          }),
        );
        context.setRunPlan(runPlan);
        options.stateStore.saveRunWithEvent(
          runPlan,
          createEvent(options.runtimeOptions, runPlan.id, {
            taskId: task.id,
            type: 'task.status_changed',
            level: 'warn',
            message: `Task ${task.id} skipped due to rejected approval.`,
            metadata: { status: 'skipped' },
          }),
        );
        continue;
      }
    }

    runPlan = updateTask(runPlan, task.id, (currentTask) =>
      withTaskFields(currentTask, {
        status: 'running',
        startedAt: currentTask.startedAt ?? options.runtimeOptions.now(),
      }),
    );
    context.setRunPlan(runPlan);
    options.stateStore.saveRunWithEvent(
      runPlan,
      createEvent(options.runtimeOptions, runPlan.id, {
        taskId: task.id,
        type: 'task.status_changed',
        level: 'info',
        message: `Task ${task.id} started.`,
        metadata: { status: 'running' },
      }),
    );

    const provider = options.providerRegistry.get(task.provider);
    if (!provider) {
      throw new ExecutionRuntimeError(`Provider "${task.provider}" is not registered.`);
    }

    runPlan = await executeTaskWithRetry({
      runPlan,
      taskId: task.id,
      provider,
      context,
      runtimeOptions: options.runtimeOptions,
      stateStore: options.stateStore,
      ...(options.onTaskFailure ? { onTaskFailure: options.onTaskFailure } : {}),
    });
    context.setRunPlan(runPlan);
  }
}

async function executeTaskWithRetry(options: ExecuteTaskWithRetryOptions): Promise<RunPlan> {
  let runPlan = options.runPlan;
  let workingTask = getTaskOrThrow(runPlan, options.taskId);
  let attemptNumber = 0;

  while (true) {
    try {
      const taskResult = await options.provider.apply(workingTask, options.context);
      if (!taskResult.success) {
        throw new ExecutionRuntimeError(taskResult.message ?? `Task ${workingTask.id} failed.`);
      }

      const verifiedTask = withTaskFields(workingTask, {
        outputs: taskResult.outputs,
      });
      const verifyResult = await options.provider.verify(verifiedTask, options.context);

      if (!verifyResult.success) {
        throw new ExecutionRuntimeError(
          verifyResult.message ?? `Task ${workingTask.id} verification failed.`,
        );
      }

      runPlan = updateTask(runPlan, workingTask.id, (currentTask) =>
        withTaskFields(currentTask, {
          status: 'success',
          outputs: taskResult.outputs,
          completedAt: options.runtimeOptions.now(),
        }),
      );
      options.context.setRunPlan(runPlan);
      options.stateStore.saveRunWithEvent(
        runPlan,
        createEvent(options.runtimeOptions, runPlan.id, {
          taskId: workingTask.id,
          type: 'task.status_changed',
          level: 'info',
          message: `Task ${workingTask.id} completed successfully.`,
          metadata: { status: 'success' },
        }),
      );

      return runPlan;
    } catch (error) {
      const normalizedError = toError(error);
      const canRetry = attemptNumber < workingTask.retryPolicy.maxRetries;

      if (canRetry) {
        const retryDecision =
          (await options.onTaskFailure?.({
            runPlan,
            task: workingTask,
            error: normalizedError,
            attemptNumber,
          })) ?? { retry: true };

        if (retryDecision.retry) {
          options.stateStore.appendEvent(
            createEvent(options.runtimeOptions, runPlan.id, {
              taskId: workingTask.id,
              type: 'task.log',
              level: 'warn',
              message: `Task ${workingTask.id} failed attempt ${attemptNumber + 1}, retrying.`,
              metadata: {
                attemptNumber: attemptNumber + 1,
                error: normalizedError.message,
              },
            }),
          );
          attemptNumber += 1;
          await options.runtimeOptions.sleep(workingTask.retryPolicy.backoffMs);
          workingTask = getTaskOrThrow(runPlan, workingTask.id);
          continue;
        }
      }

      runPlan = updateTask(runPlan, workingTask.id, (currentTask) =>
        withTaskFields(currentTask, {
          status: 'failed',
          error: normalizedError.message,
          completedAt: options.runtimeOptions.now(),
        }),
      );
      options.context.setRunPlan(runPlan);
      options.stateStore.saveRunWithEvent(
        runPlan,
        createEvent(options.runtimeOptions, runPlan.id, {
          taskId: workingTask.id,
          type: 'task.status_changed',
          level: 'error',
          message: `Task ${workingTask.id} failed.`,
          metadata: {
            status: 'failed',
            attemptCount: attemptNumber + 1,
            error: normalizedError.message,
          },
        }),
      );

      return runPlan;
    }
  }
}

function createMutableExecutionContext(options: {
  runPlan: RunPlan;
  stateStore: RunStateStore;
  runtimeOptions: RuntimeOptions;
  credentialResolver?: (provider: string, record?: CredentialRecord) => Promise<Credentials>;
}): MutableExecutionContext {
  let currentRunPlan = options.runPlan;

  const context: MutableExecutionContext = {
    runId: currentRunPlan.id,
    appSpec: currentRunPlan.appSpec,
    projectScan: currentRunPlan.projectScan,
    getOutput: (taskId, key) => currentRunPlan.tasks.find((task) => task.id === taskId)?.outputs[key],
    getCredential: async (provider) => {
      const record = options.stateStore.getCredentialRecord(provider);
      if (!options.credentialResolver) {
        throw new ExecutionRuntimeError(
          `No credential resolver configured for provider "${provider}".`,
        );
      }

      return options.credentialResolver(provider, record);
    },
    log: (level, msg, meta) => {
      options.stateStore.appendEvent(
        createEvent(options.runtimeOptions, currentRunPlan.id, {
          type: 'task.log',
          level,
          message: msg,
          ...(meta ? { metadata: meta } : {}),
        }),
      );
    },
    emitEvent: (event) => {
      options.stateStore.appendEvent(event);
    },
    setRunPlan: (runPlan) => {
      currentRunPlan = runPlan;
      context.runId = runPlan.id;
      context.appSpec = runPlan.appSpec;
      context.projectScan = runPlan.projectScan;
    },
  };

  return context;
}

function normalizeRunPlanForResume(runPlan: RunPlan): ResumeNormalizationResult {
  const resetTaskIds: string[] = [];

  return {
    runPlan: {
      ...runPlan,
      tasks: runPlan.tasks.map((task) => {
        if (
          task.status === 'running' ||
          task.status === 'failed' ||
          (task.status === 'skipped' &&
            task.error === 'Task blocked by failed or skipped dependency.')
        ) {
          resetTaskIds.push(task.id);
          const resetTask: Task = {
            id: task.id,
            name: task.name,
            provider: task.provider,
            action: task.action,
            params: task.params,
            dependsOn: task.dependsOn,
            outputs: task.outputs,
            status: 'pending',
            risk: task.risk,
            requiresApproval: task.requiresApproval,
            retryPolicy: task.retryPolicy,
            timeoutMs: task.timeoutMs,
            ...(task.startedAt ? { startedAt: task.startedAt } : {}),
          };

          return resetTask;
        }

        return task;
      }),
    },
    resetTaskIds,
  };
}

function normalizeProviderRegistry(
  providers: Record<string, ProviderPack> | Map<string, ProviderPack> | ProviderRegistry,
): ProviderRegistry {
  if (providers instanceof Map) {
    return {
      get: (providerName) => providers.get(providerName),
    };
  }

  if (typeof (providers as ProviderRegistry).get === 'function') {
    return providers as ProviderRegistry;
  }

  const providerRecord = providers as Record<string, ProviderPack>;
  return {
    get: (providerName) => providerRecord[providerName],
  };
}

function updateTask(runPlan: RunPlan, taskId: string, updater: (task: Task) => Task): RunPlan {
  return {
    ...runPlan,
    tasks: runPlan.tasks.map((task) => (task.id === taskId ? updater(task) : task)),
  };
}

function getReadyTasks(runPlan: RunPlan): Task[] {
  const tasksById = new Map(runPlan.tasks.map((task) => [task.id, task]));

  return runPlan.tasks.filter(
    (task) =>
      task.status === 'pending' &&
      task.dependsOn.every((dependencyId) => tasksById.get(dependencyId)?.status === 'success'),
  );
}

function skipBlockedPendingTasks(runPlan: RunPlan, now: Date): RunPlan {
  let changed = false;
  const tasksById = new Map(runPlan.tasks.map((task) => [task.id, task]));

  const tasks = runPlan.tasks.map((task) => {
    if (task.status !== 'pending') {
      return task;
    }

    const dependencyStatuses = task.dependsOn
      .map((dependencyId) => tasksById.get(dependencyId)?.status)
      .filter((status): status is TaskStatus => status !== undefined);

    if (dependencyStatuses.some((status) => status === 'failed' || status === 'skipped')) {
      changed = true;
      return withTaskFields(task, {
        status: 'skipped',
        completedAt: now,
        error: 'Task blocked by failed or skipped dependency.',
      });
    }

    return task;
  });

  return changed ? { ...runPlan, tasks } : runPlan;
}

function getTaskOrThrow(runPlan: RunPlan, taskId: string): Task {
  const task = runPlan.tasks.find((candidate) => candidate.id === taskId);
  if (!task) {
    throw new ExecutionRuntimeError(`Task "${taskId}" was not found in the run plan.`);
  }

  return task;
}

function createEvent(
  runtimeOptions: Pick<RuntimeOptions, 'now' | 'idGenerator'>,
  runId: string,
  input: {
    type: RunEvent['type'];
    level: RunEvent['level'];
    message: string;
    taskId?: string;
    metadata?: Record<string, unknown>;
  },
): RunEvent {
  return {
    id: runtimeOptions.idGenerator(),
    runId,
    type: input.type,
    level: input.level,
    message: input.message,
    timestamp: runtimeOptions.now(),
    ...(input.taskId ? { taskId: input.taskId } : {}),
    ...(input.metadata ? { metadata: input.metadata } : {}),
  };
}

function isTerminalTaskStatus(status: TaskStatus): boolean {
  return (
    status === 'success' ||
    status === 'failed' ||
    status === 'skipped' ||
    status === 'rolled_back'
  );
}

function toError(error: unknown): Error {
  if (error instanceof Error) {
    return error;
  }

  return new Error(typeof error === 'string' ? error : 'Unknown execution error.');
}

function withTaskFields(task: Task, fields: Partial<Task>): Task {
  const merged: Record<string, unknown> = {
    ...task,
    ...fields,
  };

  delete merged.error;
  delete merged.startedAt;
  delete merged.completedAt;

  if (task.error !== undefined) {
    merged.error = task.error;
  }
  if (task.startedAt !== undefined) {
    merged.startedAt = task.startedAt;
  }
  if (task.completedAt !== undefined) {
    merged.completedAt = task.completedAt;
  }
  if (fields.error !== undefined) {
    merged.error = fields.error;
  }
  if (fields.startedAt !== undefined) {
    merged.startedAt = fields.startedAt;
  }
  if (fields.completedAt !== undefined) {
    merged.completedAt = fields.completedAt;
  }

  return merged as unknown as Task;
}
