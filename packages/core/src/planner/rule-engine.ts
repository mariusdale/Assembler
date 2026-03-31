import type { AppSpec, ProjectScan, RiskLevel, RunPlan, Task } from '@devassemble/types';

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

export async function planPrompt(
  prompt: string,
  options: import('./types.js').PlanPromptOptions,
): Promise<import('./types.js').PlannerResult> {
  const parsed = await options.parser.parse(prompt);
  const runPlan = createRunPlan(parsed.appSpec, {
    ...(options.now ? { now: options.now } : {}),
    ...(options.idGenerator ? { idGenerator: options.idGenerator } : {}),
  });

  return {
    ...parsed,
    runPlan,
  };
}

export function createRunPlanFromProjectScan(
  projectScan: ProjectScan,
  options: CreateRunPlanOptions = {},
): RunPlan {
  const taskSeeds = createTaskSeedsFromProjectScan(projectScan);
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

export function createRunPlan(appSpec: AppSpec, options: CreateRunPlanOptions = {}): RunPlan {
  const taskSeeds = createTaskSeeds(appSpec);
  const tasks = topologicallySortTasks(taskSeeds.map(toTask));

  return {
    id: options.idGenerator?.() ?? crypto.randomUUID(),
    appSpec,
    tasks,
    estimatedCostUsd: estimateMonthlyCostUsd(appSpec),
    createdAt: options.now ?? new Date(),
    status: 'draft',
  };
}

function createTaskSeedsFromProjectScan(projectScan: ProjectScan): PlannerTaskSeed[] {
  const appSlug = toSlug(projectScan.name);
  const repoTaskId = projectScan.hasGitRemote ? 'github-use-existing-repo' : 'github-create-repo';
  const seeds: PlannerTaskSeed[] = [];

  if (projectScan.hasGitRemote) {
    seeds.push(
      taskSeed(
        'github-use-existing-repo',
        'Use existing GitHub repository',
        'github',
        'use-existing-repo',
        [],
        {
          remoteUrl: projectScan.gitRemoteUrl,
        },
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

  if (projectScan.framework === 'nextjs') {
    const predeployDependencies = ['github-push-code'];
    if (requiresProvider(projectScan, 'neon')) {
      predeployDependencies.push('neon-capture-database-url');
    }
    if (requiresProvider(projectScan, 'stripe')) {
      predeployDependencies.push('stripe-capture-keys');
    }
    if (requiresProvider(projectScan, 'clerk')) {
      predeployDependencies.push('clerk-capture-keys');
    }
    if (requiresProvider(projectScan, 'sentry')) {
      predeployDependencies.push('sentry-capture-dsn');
    }
    if (requiresProvider(projectScan, 'resend')) {
      predeployDependencies.push('resend-capture-api-key');
    }

    seeds.push(
      taskSeed(
        'vercel-create-project',
        'Create Vercel project',
        'vercel',
        'create-project',
        [repoTaskId],
        {
          name: appSlug,
          framework: 'nextjs',
        },
        'medium',
        true,
      ),
    );
    seeds.push(
      taskSeed(
        'vercel-link-repository',
        'Link Vercel to GitHub repository',
        'vercel',
        'link-repository',
        ['vercel-create-project', 'github-push-code'],
        {
          name: appSlug,
          framework: 'nextjs',
        },
        'medium',
        true,
      ),
    );
    seeds.push(
      taskSeed(
        'vercel-sync-predeploy-env-vars',
        'Sync environment variables to Vercel',
        'vercel',
        'sync-predeploy-env-vars',
        ['vercel-link-repository', ...predeployDependencies],
      ),
    );
    seeds.push(
      taskSeed(
        'vercel-deploy-preview',
        'Deploy to Vercel preview',
        'vercel',
        'deploy-preview',
        ['vercel-sync-predeploy-env-vars'],
      ),
    );
    seeds.push(
      taskSeed(
        'vercel-wait-for-ready',
        'Wait for Vercel deployment readiness',
        'vercel',
        'wait-for-ready',
        ['vercel-deploy-preview'],
      ),
    );
  }

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

function createTaskSeeds(appSpec: AppSpec): PlannerTaskSeed[] {
  const appSlug = toSlug(appSpec.name);
  const seeds: PlannerTaskSeed[] = [
    taskSeed('github-create-repo', 'Create GitHub repository', 'github', 'create-repo', [], {
      name: appSlug,
      description: appSpec.description,
      private: true,
    }),
    taskSeed(
      'github-scaffold-template',
      'Scaffold Next.js template',
      'github',
      'commit-template',
      ['github-create-repo'],
    ),
    taskSeed(
      'github-initial-commit',
      'Create initial commit',
      'github',
      'create-initial-commit',
      ['github-scaffold-template'],
    ),
    taskSeed(
      'neon-create-project',
      'Create Neon project',
      'neon',
      'create-project',
      ['github-create-repo'],
      {
        name: `${appSlug}-db`,
        databaseName: appSlug,
      },
      'medium',
      true,
    ),
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
    taskSeed(
      'neon-run-schema-migration',
      'Run database schema migration',
      'neon',
      'run-schema-migration',
      ['neon-create-database'],
    ),
    taskSeed(
      'neon-capture-database-url',
      'Capture DATABASE_URL',
      'neon',
      'capture-database-url',
      ['neon-run-schema-migration'],
    ),
    taskSeed(
      'clerk-capture-keys',
      'Capture Clerk API keys',
      'clerk',
      'capture-keys',
      ['github-create-repo'],
    ),
    taskSeed(
      'sentry-create-project',
      'Create Sentry project',
      'sentry',
      'create-project',
      ['github-create-repo'],
    ),
    taskSeed(
      'sentry-add-nextjs-plugin',
      'Add Sentry Next.js plugin',
      'sentry',
      'add-nextjs-plugin',
      ['github-scaffold-template', 'sentry-create-project'],
    ),
    taskSeed(
      'sentry-capture-dsn',
      'Capture Sentry DSN',
      'sentry',
      'capture-dsn',
      ['sentry-create-project'],
    ),
    taskSeed(
      'posthog-create-project',
      'Create PostHog project',
      'posthog',
      'create-project',
      ['github-create-repo'],
    ),
    taskSeed(
      'posthog-add-provider',
      'Add PostHog provider to template',
      'posthog',
      'add-provider',
      ['github-scaffold-template', 'posthog-create-project'],
    ),
    taskSeed(
      'posthog-capture-api-key',
      'Capture PostHog API key',
      'posthog',
      'capture-api-key',
      ['posthog-create-project'],
    ),
    taskSeed(
      'vercel-create-project',
      'Create Vercel project',
      'vercel',
      'create-project',
      ['github-create-repo'],
      {
        name: appSlug,
        framework: 'nextjs',
      },
      'medium',
      true,
    ),
    taskSeed(
      'vercel-link-repository',
      'Link Vercel project to GitHub repository',
      'vercel',
      'link-repository',
      ['vercel-create-project', 'github-initial-commit'],
      {
        productionBranch: 'main',
      },
      'medium',
      true,
    ),
  ];

  const predeployEnvDependencies = [
    'neon-capture-database-url',
    'clerk-capture-keys',
    'sentry-capture-dsn',
    'posthog-capture-api-key',
  ];

  if (appSpec.billing.mode !== 'none') {
    seeds.push(
      taskSeed(
        'stripe-create-product',
        'Create Stripe product',
        'stripe',
        'create-product',
        ['github-create-repo'],
      ),
      taskSeed(
        'stripe-create-price',
        'Create Stripe price',
        'stripe',
        'create-price',
        ['stripe-create-product'],
        {
          mode: appSpec.billing.mode,
        },
      ),
      taskSeed(
        'stripe-capture-secret-key',
        'Capture Stripe secret key',
        'stripe',
        'capture-secret-key',
        ['stripe-create-product'],
      ),
    );

    predeployEnvDependencies.push('stripe-capture-secret-key');

    if (appSpec.billing.mode === 'subscription') {
      seeds.push(
        taskSeed(
          'stripe-setup-customer-portal',
          'Set up Stripe customer portal',
          'stripe',
          'setup-customer-portal',
          ['stripe-create-product'],
        ),
      );
    }
  }

  if (appSpec.domain) {
    seeds.push(
      taskSeed(
        'cloudflare-lookup-zone',
        'Look up Cloudflare DNS zone',
        'cloudflare',
        'lookup-zone',
        ['vercel-deploy-preview'],
        {
          domain: appSpec.domain,
        },
        'medium',
        true,
      ),
      taskSeed(
        'cloudflare-create-dns-record',
        'Create Cloudflare DNS record',
        'cloudflare',
        'create-dns-record',
        ['cloudflare-lookup-zone'],
        {
          domain: appSpec.domain,
        },
        'high',
        true,
      ),
      taskSeed(
        'vercel-add-domain',
        'Add domain to Vercel project',
        'vercel',
        'add-domain',
        ['cloudflare-create-dns-record', 'vercel-deploy-preview'],
        {
          domain: appSpec.domain,
        },
        'high',
        true,
      ),
      taskSeed(
        'cloudflare-verify-dns',
        'Verify DNS configuration',
        'cloudflare',
        'verify-dns',
        ['vercel-add-domain'],
        {
          domain: appSpec.domain,
        },
        'medium',
        true,
      ),
      taskSeed(
        'resend-verify-sending-domain',
        'Verify Resend sending domain',
        'resend',
        'verify-sending-domain',
        ['cloudflare-verify-dns'],
        {
          domain: appSpec.domain,
        },
      ),
      taskSeed(
        'resend-create-api-key',
        'Create Resend API key',
        'resend',
        'create-api-key',
        ['resend-verify-sending-domain'],
      ),
      taskSeed(
        'resend-capture-api-key',
        'Capture Resend API key',
        'resend',
        'capture-api-key',
        ['resend-create-api-key'],
      ),
    );
  } else {
    seeds.push(
      taskSeed(
        'resend-create-api-key',
        'Create Resend API key',
        'resend',
        'create-api-key',
        ['github-create-repo'],
      ),
      taskSeed(
        'resend-capture-api-key',
        'Capture Resend API key',
        'resend',
        'capture-api-key',
        ['resend-create-api-key'],
      ),
    );
    predeployEnvDependencies.push('resend-capture-api-key');
  }

  seeds.push(
    taskSeed(
      'vercel-sync-predeploy-env-vars',
      'Sync predeploy environment variables to Vercel',
      'vercel',
      'sync-predeploy-env-vars',
      ['vercel-link-repository', ...predeployEnvDependencies],
    ),
    taskSeed(
      'vercel-deploy-preview',
      'Deploy preview environment',
      'vercel',
      'deploy-preview',
      ['vercel-sync-predeploy-env-vars'],
    ),
  );

  const postdeployEnvDependencies: string[] = [];

  if (appSpec.billing.mode === 'subscription') {
    seeds.push(
      taskSeed(
        'stripe-configure-webhook',
        'Configure Stripe webhook endpoint',
        'stripe',
        'configure-webhook',
        ['vercel-deploy-preview', 'stripe-create-price'],
        {
          previewUrlTaskId: 'vercel-deploy-preview',
        },
      ),
      taskSeed(
        'stripe-capture-webhook-secret',
        'Capture Stripe webhook secret',
        'stripe',
        'capture-webhook-secret',
        ['stripe-configure-webhook'],
      ),
    );
    postdeployEnvDependencies.push('stripe-capture-webhook-secret');
  }

  if (appSpec.domain) {
    postdeployEnvDependencies.push('resend-capture-api-key');
  }

  if (postdeployEnvDependencies.length > 0) {
    seeds.push(
      taskSeed(
        'vercel-sync-postdeploy-env-vars',
        'Sync postdeploy environment variables to Vercel',
        'vercel',
        'sync-postdeploy-env-vars',
        ['vercel-deploy-preview', ...postdeployEnvDependencies],
      ),
    );
  }

  return seeds;
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

function estimateMonthlyCostUsd(appSpec: AppSpec): number {
  let total = 0;

  total += 19;
  total += 20;

  if (appSpec.domain) {
    total += 10;
  }

  return total;
}

function estimateProjectScanCostUsd(projectScan: ProjectScan): number {
  let total = 0;

  if (requiresProvider(projectScan, 'neon')) {
    total += 0;
  }

  if (projectScan.framework === 'nextjs') {
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
    .slice(0, 63) || 'devassemble-app';
}
