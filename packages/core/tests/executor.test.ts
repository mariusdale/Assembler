import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type {
  Credentials,
  ProviderPack,
  RollbackResult,
  RunPlan,
  Task,
  TaskResult,
  VerifyResult,
} from '@assembler/types';
import { afterEach, describe, expect, it } from 'vitest';

import { createExecutor, SqliteRunStateStore } from '../src/index.js';

const tempDirs: string[] = [];

afterEach(() => {
  while (tempDirs.length > 0) {
    const tempDir = tempDirs.pop();
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  }
});

describe('executor runtime', () => {
  it('executes a mock DAG in dependency order', async () => {
    const timestamps = new Map<string, number>();
    let tick = 0;
    const provider = createMockProvider({
      onApply: (task) => {
        tick += 1;
        timestamps.set(task.id, tick);
        return Promise.resolve(successTaskResult(task.id));
      },
    });

    const store = createStore();
    const executor = createExecutor({
      stateStore: store,
      providers: {
        mock: provider,
      },
      credentialResolver: resolveCredential,
      sleep: () => Promise.resolve(),
    });

    const runPlan = createMockRunPlan();
    const result = await executor.execute({ runPlan });

    expect(result.runPlan.status).toBe('completed');
    expect(timestamps.get('task-a')).toBeLessThan(timestamps.get('task-b') ?? 0);
    expect(timestamps.get('task-a')).toBeLessThan(timestamps.get('task-c') ?? 0);
    expect(timestamps.get('task-b')).toBeLessThan(timestamps.get('task-d') ?? 0);
    expect(timestamps.get('task-c')).toBeLessThan(timestamps.get('task-d') ?? 0);
    expect(timestamps.get('task-d')).toBeLessThan(timestamps.get('task-e') ?? 0);
    store.close();
  });

  it('retries a failing task up to maxRetries before marking the run failed', async () => {
    let attemptCount = 0;
    const provider = createMockProvider({
      onApply: (task) => {
        if (task.id === 'task-b') {
          attemptCount += 1;
          return Promise.reject(new Error(`attempt ${attemptCount} failed`));
        }
        return Promise.resolve(successTaskResult(task.id));
      },
    });

    const store = createStore();
    const executor = createExecutor({
      stateStore: store,
      providers: {
        mock: provider,
      },
      credentialResolver: resolveCredential,
      sleep: () => Promise.resolve(),
    });

    const runPlan = createMockRunPlan({
      taskOverrides: {
        'task-b': {
          retryPolicy: {
            maxRetries: 2,
            backoffMs: 0,
          },
        },
      },
    });
    const result = await executor.execute({ runPlan });

    expect(result.runPlan.status).toBe('failed');
    expect(attemptCount).toBe(3);
    expect(result.runPlan.tasks.find((task) => task.id === 'task-b')?.status).toBe('failed');
    store.close();
  });

  it('resumes from checkpoint without rerunning completed tasks', async () => {
    const attempts = new Map<string, number>();
    let shouldFailTaskC = true;
    const provider = createMockProvider({
      onApply: (task) => {
        attempts.set(task.id, (attempts.get(task.id) ?? 0) + 1);
        if (task.id === 'task-c' && shouldFailTaskC) {
          shouldFailTaskC = false;
          return Promise.reject(new Error('simulated crash on task-c'));
        }
        return Promise.resolve(successTaskResult(task.id));
      },
    });

    const store = createStore();
    const executor = createExecutor({
      stateStore: store,
      providers: {
        mock: provider,
      },
      credentialResolver: resolveCredential,
      sleep: () => Promise.resolve(),
    });

    const runPlan = createMockRunPlan({
      taskOverrides: {
        'task-c': {
          retryPolicy: {
            maxRetries: 0,
            backoffMs: 0,
          },
        },
      },
    });

    const firstResult = await executor.execute({ runPlan });
    expect(firstResult.runPlan.status).toBe('failed');

    const resumed = await executor.resume(runPlan.id);
    expect(resumed.runPlan.status).toBe('completed');
    expect(attempts.get('task-a')).toBe(1);
    expect(attempts.get('task-b')).toBe(1);
    expect(attempts.get('task-c')).toBe(2);
    expect(attempts.get('task-d')).toBe(1);
    expect(attempts.get('task-e')).toBe(1);
    store.close();
  });

  it('rolls back completed tasks in reverse dependency order', async () => {
    const rollbackOrder: string[] = [];
    const provider = createMockProvider({
      onApply: (task) => Promise.resolve(successTaskResult(task.id)),
      onRollback: (task) => {
        rollbackOrder.push(task.id);
        return Promise.resolve(successRollbackResult());
      },
    });

    const store = createStore();
    const executor = createExecutor({
      stateStore: store,
      providers: {
        mock: provider,
      },
      credentialResolver: resolveCredential,
      sleep: () => Promise.resolve(),
    });

    const runPlan = createMockRunPlan();
    await executor.execute({ runPlan });
    const rolledBack = await executor.rollback(runPlan.id);

    expect(rolledBack.status).toBe('rolled_back');
    expect(rollbackOrder).toEqual(['task-e', 'task-d', 'task-c', 'task-b', 'task-a']);
    store.close();
  });

  it('records task status changes into the events table', async () => {
    const provider = createMockProvider();
    const store = createStore();
    const executor = createExecutor({
      stateStore: store,
      providers: {
        mock: provider,
      },
      credentialResolver: resolveCredential,
      sleep: () => Promise.resolve(),
    });

    const runPlan = createMockRunPlan();
    await executor.execute({ runPlan });

    const events = store.listEvents(runPlan.id);
    const statusChangeEvents = events.filter((event) => event.type === 'task.status_changed');

    expect(statusChangeEvents.length).toBe(10);
    expect(statusChangeEvents.filter((event) => event.taskId === 'task-a')).toHaveLength(2);
    store.close();
  });

  it('verifies using the task outputs produced by apply', async () => {
    const provider = createMockProvider({
      onApply: (task) =>
        Promise.resolve({
          success: true,
          outputs: {
            taskId: task.id,
            owner: 'mariusdale',
          },
        }),
      onVerify: (task) =>
        Promise.resolve({
          success: task.outputs.owner === 'mariusdale',
        }),
    });

    const store = createStore();
    const executor = createExecutor({
      stateStore: store,
      providers: {
        mock: provider,
      },
      credentialResolver: resolveCredential,
      sleep: () => Promise.resolve(),
    });

    const result = await executor.execute({ runPlan: createMockRunPlan() });

    expect(result.runPlan.status).toBe('completed');
    expect(result.runPlan.tasks[0]?.outputs.owner).toBe('mariusdale');
    store.close();
  });
});

function createStore(): SqliteRunStateStore {
  const tempDir = mkdtempSync(join(tmpdir(), 'assembler-executor-'));
  tempDirs.push(tempDir);
  return new SqliteRunStateStore({
    filename: join(tempDir, 'state.db'),
  });
}

function createMockRunPlan(options: {
  taskOverrides?: Partial<Record<string, Partial<Task>>>;
} = {}): RunPlan {
  const tasks = [
    createTask('task-a', []),
    createTask('task-b', ['task-a']),
    createTask('task-c', ['task-a']),
    createTask('task-d', ['task-b', 'task-c']),
    createTask('task-e', ['task-d']),
  ].map((task) => ({
    ...task,
    ...(options.taskOverrides?.[task.id] ?? {}),
  }));

  return {
    id: 'run_executor_test',
    tasks,
    estimatedCostUsd: 0,
    createdAt: new Date('2026-03-27T00:00:00.000Z'),
    status: 'approved',
  };
}

function createTask(id: string, dependsOn: string[]): Task {
  return {
    id,
    name: id,
    provider: 'mock',
    action: 'apply',
    params: {},
    dependsOn,
    outputs: {},
    status: 'pending',
    risk: 'low',
    requiresApproval: false,
    retryPolicy: {
      maxRetries: 1,
      backoffMs: 0,
    },
    timeoutMs: 1_000,
  };
}

function createMockProvider(options: {
  onApply?: (task: Task) => Promise<TaskResult>;
  onVerify?: (task: Task) => Promise<VerifyResult>;
  onRollback?: (task: Task) => Promise<RollbackResult>;
} = {}): ProviderPack {
  return {
    name: 'mock',
    actions: ['apply'],
    discover: () =>
      Promise.resolve({
        connected: true,
        metadata: {},
      }),
    plan: () => Promise.resolve([]),
    apply: (task) => options.onApply?.(task) ?? Promise.resolve(successTaskResult(task.id)),
    verify: (task) => options.onVerify?.(task) ?? Promise.resolve(successVerifyResult()),
    rollback: (task) =>
      options.onRollback?.(task) ?? Promise.resolve(successRollbackResult()),
  };
}

function successTaskResult(taskId: string): TaskResult {
  return {
    success: true,
    outputs: {
      taskId,
    },
  };
}

function successVerifyResult(): VerifyResult {
  return {
    success: true,
  };
}

function successRollbackResult(): RollbackResult {
  return {
    success: true,
  };
}

function resolveCredential(provider: string): Promise<Credentials> {
  return Promise.resolve({
    provider,
    values: {
      token: `${provider}-token`,
    },
  });
}
