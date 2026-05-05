import type { ProjectScan, RiskLevel, RunPlan, Task } from '@assembler/types';

import { createDefaultDeploymentTargetRegistry } from './deployment-target-registry.js';
import { createDefaultFrameworkRegistry } from './framework-strategy.js';
import type { CreateRunPlanOptions, PlannerTaskSeed } from './types.js';

const DEFAULT_RETRY_POLICY = {
  maxRetries: 2,
  backoffMs: 1_000,
} as const;

const DEFAULT_TIMEOUT_MS = 60_000;

export class DependencyGraphError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DependencyGraphError';
  }
}

export function createRunPlanFromProjectScan(
  projectScan: ProjectScan,
  options: CreateRunPlanOptions = {},
): RunPlan {
  const taskSeeds = createTaskSeedsFromProjectScan(projectScan, options);
  const tasks = topologicallySortTasks(taskSeeds.map(toTask));

  return {
    id: options.idGenerator?.() ?? crypto.randomUUID(),
    projectScan,
    tasks,
    estimatedCostUsd: estimateProjectScanCostUsd(projectScan),
    createdAt: options.now ?? new Date(),
    status: 'draft',
  };
}

function createTaskSeedsFromProjectScan(
  projectScan: ProjectScan,
  options: CreateRunPlanOptions = {},
): PlannerTaskSeed[] {
  const appSlug = toSlug(projectScan.name);
  const useExisting = options.useExistingRepo && projectScan.hasGitRemote;
  const repoTaskId = useExisting ? 'github-use-existing-repo' : 'github-create-repo';
  const seeds: PlannerTaskSeed[] = [];

  if (useExisting) {
    seeds.push(
      taskSeed(
        'github-use-existing-repo',
        'Use existing GitHub repository',
        'github',
        'use-existing-repo',
        [],
        { remoteUrl: projectScan.gitRemoteUrl },
      ),
    );
  } else {
    seeds.push(
      taskSeed('github-create-repo', 'Create GitHub repository', 'github', 'create-repo', [], {
        name: appSlug,
        description: `Deploy ${projectScan.name}`,
        private: true,
      }),
    );
  }

  seeds.push(
    taskSeed(
      'github-push-code',
      'Push local project code',
      'github',
      'push-code',
      [repoTaskId],
      {
        directory: projectScan.directory,
      },
    ),
  );

  if (requiresProvider(projectScan, 'neon')) {
    seeds.push(
      taskSeed(
        'neon-create-project',
        'Create Neon project',
        'neon',
        'create-project',
        [repoTaskId],
        {
          name: `${appSlug}-db`,
          databaseName: appSlug,
        },
        'medium',
        true,
      ),
    );
    seeds.push(
      taskSeed(
        'neon-create-database',
        'Create Neon database',
        'neon',
        'create-database',
        ['neon-create-project'],
        {
          databaseName: appSlug,
        },
        'medium',
        true,
      ),
    );
    seeds.push(
      taskSeed(
        'neon-capture-database-url',
        'Capture DATABASE_URL',
        'neon',
        'capture-database-url',
        ['neon-create-database'],
      ),
    );
  }

  if (requiresProvider(projectScan, 'stripe')) {
    seeds.push(
      taskSeed(
        'stripe-capture-keys',
        'Capture Stripe API keys',
        'stripe',
        'capture-keys',
        [repoTaskId],
      ),
    );
  }

  if (requiresProvider(projectScan, 'clerk')) {
    seeds.push(
      taskSeed(
        'clerk-capture-keys',
        'Capture Clerk API keys',
        'clerk',
        'capture-keys',
        [repoTaskId],
      ),
    );
  }

  if (requiresProvider(projectScan, 'sentry')) {
    seeds.push(
      taskSeed(
        'sentry-capture-dsn',
        'Capture Sentry DSN',
        'sentry',
        'capture-dsn',
        [repoTaskId],
      ),
    );
  }

  if (requiresProvider(projectScan, 'resend')) {
    seeds.push(
      taskSeed(
        'resend-capture-api-key',
        'Capture Resend API key',
        'resend',
        'capture-api-key',
        [repoTaskId],
      ),
    );
  }

  const frameworkRegistry = options.frameworkRegistry ?? createDefaultFrameworkRegistry();
  const deploymentTargets =
    options.deploymentTargetRegistry ?? createDefaultDeploymentTargetRegistry();
  const frameworkStrategy = frameworkRegistry.resolve(projectScan);
  const deploymentTargetPreference =
    options.deploymentTargetPreference ?? projectScan.config?.config.target;
  seeds.push(
    ...(frameworkStrategy?.plan({
      projectScan,
      appSlug,
      repoTaskId,
      deploymentTargets,
      ...(deploymentTargetPreference ? { deploymentTargetPreference } : {}),
      requiresProvider(name) {
        return requiresProvider(projectScan, name);
      },
    }) ?? []),
  );

  return seeds;
}

export function topologicallySortTasks(tasks: Task[]): Task[] {
  const taskById = new Map<string, Task>();
  const indegree = new Map<string, number>();
  const dependents = new Map<string, string[]>();
  const sourceIndex = new Map<string, number>();

  tasks.forEach((task, index) => {
    if (taskById.has(task.id)) {
      throw new DependencyGraphError(`Duplicate task id "${task.id}" in plan.`);
    }

    taskById.set(task.id, task);
    indegree.set(task.id, 0);
    dependents.set(task.id, []);
    sourceIndex.set(task.id, index);
  });

  for (const task of tasks) {
    for (const dependencyId of task.dependsOn) {
      if (!taskById.has(dependencyId)) {
        throw new DependencyGraphError(
          `Task "${task.id}" depends on missing task "${dependencyId}".`,
        );
      }

      indegree.set(task.id, (indegree.get(task.id) ?? 0) + 1);
      dependents.get(dependencyId)?.push(task.id);
    }
  }

  const ready = tasks
    .filter((task) => (indegree.get(task.id) ?? 0) === 0)
    .sort((left, right) => (sourceIndex.get(left.id) ?? 0) - (sourceIndex.get(right.id) ?? 0));
  const sorted: Task[] = [];

  while (ready.length > 0) {
    const current = ready.shift();
    if (!current) {
      break;
    }

    sorted.push(current);

    for (const dependentId of dependents.get(current.id) ?? []) {
      const nextIndegree = (indegree.get(dependentId) ?? 0) - 1;
      indegree.set(dependentId, nextIndegree);

      if (nextIndegree === 0) {
        const dependentTask = taskById.get(dependentId);
        if (dependentTask) {
          ready.push(dependentTask);
          ready.sort(
            (left, right) =>
              (sourceIndex.get(left.id) ?? 0) - (sourceIndex.get(right.id) ?? 0),
          );
        }
      }
    }
  }

  if (sorted.length !== tasks.length) {
    throw new DependencyGraphError('Run plan contains a dependency cycle.');
  }

  return sorted;
}

function taskSeed(
  id: string,
  name: string,
  provider: string,
  action: string,
  dependsOn: string[] = [],
  params: Record<string, unknown> = {},
  risk: RiskLevel = 'low',
  requiresApproval = false,
): PlannerTaskSeed {
  return {
    id,
    name,
    provider,
    action,
    params,
    dependsOn,
    risk,
    requiresApproval,
  };
}

function toTask(seed: PlannerTaskSeed): Task {
  return {
    id: seed.id,
    name: seed.name,
    provider: seed.provider,
    action: seed.action,
    params: seed.params ?? {},
    dependsOn: seed.dependsOn ?? [],
    outputs: seed.outputs ?? {},
    status: 'pending',
    risk: seed.risk ?? 'low',
    requiresApproval: seed.requiresApproval ?? false,
    retryPolicy: seed.retryPolicy ?? { ...DEFAULT_RETRY_POLICY },
    timeoutMs: seed.timeoutMs ?? DEFAULT_TIMEOUT_MS,
  };
}

function estimateProjectScanCostUsd(projectScan: ProjectScan): number {
  let total = 0;

  if (requiresProvider(projectScan, 'neon')) {
    total += 0;
  }

  return total;
}

function requiresProvider(projectScan: ProjectScan, provider: string): boolean {
  return (
    projectScan.detectedProviders.some((candidate) => candidate.provider === provider) ||
    projectScan.requiredEnvVars.some((envVar) => envVar.provider === provider)
  );
}

function toSlug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 63) || 'assembler-app';
}
