import type {
  DetectedProvider,
  PreflightError,
  ProjectScan,
  RunEvent,
  RunPlan,
  Task,
} from '@assembler/types';

import type { PreflightCheckResults } from '../app.js';

const PROVIDER_LABELS: Record<string, string> = {
  clerk: 'Auth: Clerk',
  cloudflare: 'DNS: Cloudflare',
  github: 'GitHub',
  neon: 'Database: Neon',
  posthog: 'Analytics: PostHog',
  resend: 'Email: Resend',
  sentry: 'Error Tracking: Sentry',
  stripe: 'Payments: Stripe',
  vercel: 'Hosting: Vercel',
};

export type LaunchReadinessState = 'ready' | 'ready_with_warnings' | 'blocked';
export type PlanPhaseKey = 'repo' | 'infra' | 'config' | 'deploy' | 'verify';
export type ExecutionPhaseKey = 'provisioning' | 'syncing' | 'deploying' | 'verifying';
export type DisplayTaskStatus =
  | 'pending'
  | 'running'
  | 'retrying'
  | 'success'
  | 'warning'
  | 'failed'
  | 'skipped';

export interface ProviderReadinessItem {
  provider: string;
  label: string;
  required: boolean;
  envOnly: boolean;
  confidence?: DetectedProvider['confidence'];
  evidence: string[];
  valid: boolean;
  missingCredentials: boolean;
  errors: PreflightError[];
}

export interface LaunchWarning {
  level: 'warning' | 'blocking';
  message: string;
}

export interface LaunchExpectedOutput {
  label: string;
  detail: string;
}

export interface PlanTaskGroup {
  key: PlanPhaseKey;
  label: string;
  tasks: Task[];
}

export interface ExecutionTaskView {
  id: string;
  name: string;
  provider: string;
  phaseKey: ExecutionPhaseKey;
  status: DisplayTaskStatus;
  attemptCount: number;
  resourceLabel?: string;
  lastUpdatedAt?: string;
  isActive: boolean;
  error?: string;
  remediation?: string;
}

export interface ExecutionTaskGroup {
  key: ExecutionPhaseKey;
  label: string;
  tasks: ExecutionTaskView[];
}

export interface TimelineEntry {
  id: string;
  level: RunEvent['level'];
  message: string;
  timestampLabel: string;
  taskName?: string;
}

export interface FailureSummary {
  taskId: string;
  taskName: string;
  reason: string;
  remediation?: string;
}

export interface ExecutionView {
  currentPhaseLabel: string;
  currentTaskLabel: string;
  elapsedLabel: string;
  completedCount: number;
  totalCount: number;
  taskGroups: ExecutionTaskGroup[];
  timeline: TimelineEntry[];
  failure?: FailureSummary;
}

export interface RunOutcomeSummary {
  kind: 'success' | 'success_with_warnings' | 'failed';
  headline: string;
  repoUrl?: string;
  previewUrl?: string;
  resources: string[];
  verification: string[];
  warnings: string[];
  nextSteps: string[];
  briefStatus: string;
  firstFailure?: FailureSummary;
}

const PLAN_PHASE_ORDER: Array<{ key: PlanPhaseKey; label: string }> = [
  { key: 'repo', label: 'Repository Setup' },
  { key: 'infra', label: 'Infrastructure' },
  { key: 'config', label: 'Configuration Sync' },
  { key: 'deploy', label: 'Deploy' },
  { key: 'verify', label: 'Verify' },
];

const EXECUTION_PHASE_ORDER: Array<{ key: ExecutionPhaseKey; label: string }> = [
  { key: 'provisioning', label: 'Provisioning' },
  { key: 'syncing', label: 'Syncing' },
  { key: 'deploying', label: 'Deploying' },
  { key: 'verifying', label: 'Verifying' },
];

export function getLaunchReadiness(
  projectScan: ProjectScan,
  preflightResults: PreflightCheckResults | null,
): LaunchReadinessState {
  const warnings = getLaunchWarnings(projectScan);

  if (!projectScan.lockfileCheck.lockfileExists || !projectScan.lockfileCheck.inSync) {
    return 'blocked';
  }

  if (preflightResults && !preflightResults.allValid) {
    return 'blocked';
  }

  const readinessWarnings = warnings.filter((warning) =>
    warning.message !==
      'Teardown is destructive. Treat first launches as test runs until you are happy with the generated infrastructure.',
  );

  return readinessWarnings.length > 0 ? 'ready_with_warnings' : 'ready';
}

export function getLaunchWarnings(projectScan: ProjectScan): LaunchWarning[] {
  const warnings: LaunchWarning[] = [];
  const lockfileCheck = projectScan.lockfileCheck;

  if (!lockfileCheck.lockfileExists) {
    warnings.push({
      level: 'blocking',
      message:
        'No lockfile found. Generate and commit a lockfile before launching so hosted builds do not fail.',
    });
  } else if (!lockfileCheck.inSync) {
    warnings.push({
      level: 'blocking',
      message:
        'Your lockfile is out of sync with package.json. Run your package manager install command and commit the updated lockfile before launching.',
    });
  }

  if (projectScan.detectedProviders.some((provider) => provider.provider === 'neon')) {
    warnings.push({
      level: 'warning',
      message:
        'Database provisioning does not run your schema migrations yet. Plan to run your app migration flow after launch.',
    });
  }

  if (projectScan.framework === 'nextjs') {
    warnings.push({
      level: 'warning',
      message:
        'Vercel preview deployments may return 401 until you are authenticated because Deployment Protection can stay enabled.',
    });
  }

  warnings.push({
    level: 'warning',
    message:
      'Teardown is destructive. Treat first launches as test runs until you are happy with the generated infrastructure.',
  });

  return warnings;
}

export function getProviderReadiness(
  projectScan: ProjectScan,
  runPlan: RunPlan,
  preflightResults: PreflightCheckResults | null,
): ProviderReadinessItem[] {
  const requiredProviders = new Set(runPlan.tasks.map((task) => task.provider));
  const detectedProvidersByName = new Map(
    projectScan.detectedProviders.map((provider) => [provider.provider, provider]),
  );
  const providerNames = new Set<string>([
    ...requiredProviders,
    ...projectScan.detectedProviders.map((provider) => provider.provider),
    ...(preflightResults ? [...preflightResults.results.keys()] : []),
  ]);

  return [...providerNames]
    .map((provider) => {
      const detectedProvider = detectedProvidersByName.get(provider);
      const preflight = preflightResults?.results.get(provider);
      const envOnly =
        detectedProvider?.evidence.length !== 0 &&
        detectedProvider?.evidence.every((entry) => entry.includes('.env')) === true;

      const item: ProviderReadinessItem = {
        provider,
        label: PROVIDER_LABELS[provider] ?? provider,
        required: requiredProviders.has(provider),
        envOnly,
        evidence: detectedProvider?.evidence ?? [],
        valid: preflight?.valid ?? !requiredProviders.has(provider),
        missingCredentials:
          (preflight?.valid ?? false) === false &&
          preflight?.errors.some((error) => /token missing|api key missing|no .* configured/i.test(error.message)) === true,
        errors: preflight?.errors ?? [],
      };

      if (detectedProvider?.confidence) {
        item.confidence = detectedProvider.confidence;
      }

      return item;
    })
    .sort((left, right) => {
      if (left.required !== right.required) {
        return left.required ? -1 : 1;
      }
      return left.label.localeCompare(right.label);
    });
}

export function groupTasksForPlan(tasks: Task[]): PlanTaskGroup[] {
  return PLAN_PHASE_ORDER.map((phase) => ({
    ...phase,
    tasks: tasks.filter((task) => getPlanPhaseKey(task) === phase.key),
  })).filter((phase) => phase.tasks.length > 0);
}

export function getExpectedOutputs(runPlan: RunPlan): LaunchExpectedOutput[] {
  const outputs: LaunchExpectedOutput[] = [];
  const providers = new Set(runPlan.tasks.map((task) => task.provider));

  outputs.push({
    label: 'GitHub',
    detail: 'A repository URL will be created or reused for your source code.',
  });

  if (providers.has('vercel')) {
    outputs.push({
      label: 'Preview deployment',
      detail: 'A Vercel preview URL will be generated after the deploy phase completes.',
    });
  }

  if (providers.has('neon')) {
    outputs.push({
      label: 'Database',
      detail: 'DATABASE_URL will be captured and synced into your hosting environment.',
    });
  }

  const syncedProviders = ['clerk', 'stripe', 'sentry', 'resend', 'neon'].filter((provider) =>
    providers.has(provider),
  );
  if (syncedProviders.length > 0) {
    outputs.push({
      label: 'Environment sync',
      detail: `Provider env vars will be pushed to Vercel for ${syncedProviders.join(', ')}.`,
    });
  }

  return outputs;
}

export function deriveExecutionView(
  runPlan: RunPlan,
  events: RunEvent[],
  now = new Date(),
): ExecutionView {
  const taskEvents = new Map<string, RunEvent[]>();
  for (const event of events) {
    if (!event.taskId) {
      continue;
    }
    const current = taskEvents.get(event.taskId) ?? [];
    current.push(event);
    taskEvents.set(event.taskId, current);
  }

  const taskViews = runPlan.tasks.map((task) => deriveExecutionTaskView(task, taskEvents.get(task.id) ?? []));
  const activeTask =
    taskViews.find((task) => task.status === 'retrying' || task.status === 'running') ??
    taskViews.find((task) => task.status === 'failed');

  const taskGroups = EXECUTION_PHASE_ORDER.map((phase) => ({
    ...phase,
    tasks: taskViews.filter((task) => task.phaseKey === phase.key),
  })).filter((phase) => phase.tasks.length > 0);

  const terminalStatuses = new Set<DisplayTaskStatus>(['success', 'warning', 'failed', 'skipped']);
  const completedCount = taskViews.filter((task) => terminalStatuses.has(task.status)).length;
  const failureTask = taskViews.find((task) => task.status === 'failed');

  return {
    currentPhaseLabel:
      activeTask ? EXECUTION_PHASE_ORDER.find((phase) => phase.key === activeTask.phaseKey)?.label ?? 'Preparing run' : 'Preparing run',
    currentTaskLabel: activeTask?.name ?? 'Preparing run...',
    elapsedLabel: formatDuration(Math.max(0, now.getTime() - runPlan.createdAt.getTime())),
    completedCount,
    totalCount: runPlan.tasks.length,
    taskGroups,
    timeline: buildTimelineEntries(events, runPlan),
    ...(failureTask
      ? {
          failure: {
            taskId: failureTask.id,
            taskName: failureTask.name,
            reason: failureTask.error ?? 'Task failed.',
            ...(failureTask.remediation ? { remediation: failureTask.remediation } : {}),
          },
        }
      : {}),
  };
}

export function deriveRunOutcomeSummary(runPlan: RunPlan, events: RunEvent[] = []): RunOutcomeSummary {
  const githubTask = runPlan.tasks.find((task) => task.provider === 'github' && task.status === 'success');
  const repoUrl = asOptionalString(githubTask?.outputs.repoUrl);
  const previewUrl = findPreviewUrl(runPlan);
  const healthTask = runPlan.tasks.find((task) => task.provider === 'vercel' && task.action === 'health-check');
  const healthy = healthTask?.outputs.healthy;
  const failedTask = runPlan.tasks.find((task) => task.status === 'failed');
  const warnings: string[] = [];

  if (healthy === false) {
    const healthError = asOptionalString(healthTask?.outputs.error);
    warnings.push(
      healthError
        ? `Health check did not get a 200 response (${healthError}).`
        : 'Health check did not get a 200 response before timing out.',
    );
  }

  if (runPlan.tasks.some((task) => task.status === 'skipped')) {
    warnings.push('One or more tasks were skipped during execution.');
  }

  const resources = summarizeResources(runPlan);
  const verification = summarizeVerification(runPlan);
  const nextSteps = buildNextSteps(runPlan, previewUrl);

  if (failedTask) {
    const failure = {
      taskId: failedTask.id,
      taskName: failedTask.name,
      reason: failedTask.error ?? 'Task failed.',
      ...(failedTask.remediationHint ? { remediation: failedTask.remediationHint } : {}),
    } satisfies FailureSummary;

    const summary: RunOutcomeSummary = {
      kind: 'failed',
      headline: 'Launch failed before all tasks completed.',
      resources,
      verification,
      warnings,
      nextSteps,
      briefStatus: `Failed at ${failedTask.name}`,
      firstFailure: failure,
    };

    if (repoUrl) {
      summary.repoUrl = repoUrl;
    }
    if (previewUrl) {
      summary.previewUrl = previewUrl;
    }

    return summary;
  }

  if (warnings.length > 0) {
    const summary: RunOutcomeSummary = {
      kind: 'success_with_warnings',
      headline: 'Launch completed with warnings.',
      resources,
      verification,
      warnings,
      nextSteps,
      briefStatus: 'Completed with warnings',
    };

    if (repoUrl) {
      summary.repoUrl = repoUrl;
    }
    if (previewUrl) {
      summary.previewUrl = previewUrl;
    }

    return summary;
  }

  const summary: RunOutcomeSummary = {
    kind: 'success',
    headline: 'Launch completed successfully.',
    resources,
    verification,
    warnings,
    nextSteps,
    briefStatus: previewUrl ? 'Preview ready' : 'Completed successfully',
  };

  if (repoUrl) {
    summary.repoUrl = repoUrl;
  }
  if (previewUrl) {
    summary.previewUrl = previewUrl;
  }

  return summary;
}

export function formatRunCreatedAt(runPlan: RunPlan): string {
  return runPlan.createdAt.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function buildNextSteps(runPlan: RunPlan, previewUrl?: string): string[] {
  const steps: string[] = [];

  if (previewUrl) {
    steps.push(`Visit the preview deployment at ${previewUrl}.`);
  }

  if (runPlan.tasks.some((task) => task.provider === 'neon' && task.status === 'success')) {
    steps.push('Run your app migration flow manually before treating the deployment as production-ready.');
  }

  if (runPlan.tasks.some((task) => task.provider === 'vercel' && task.status === 'success')) {
    steps.push('Run `assembler env pull` if you want the deployed env vars locally.');
    steps.push('Use `assembler domain add <domain>` when you are ready to attach a custom domain.');
  }

  if (runPlan.tasks.some((task) => task.status === 'success')) {
    steps.push('Use `assembler teardown` if this run was only a test launch.');
  }

  return steps.slice(0, 4);
}

function summarizeVerification(runPlan: RunPlan): string[] {
  const items: string[] = [];
  const readyTask = runPlan.tasks.find((task) => task.provider === 'vercel' && task.action === 'wait-for-ready');
  if (readyTask?.status === 'success') {
    items.push('Vercel deployment reached READY.');
  }

  const healthTask = runPlan.tasks.find((task) => task.provider === 'vercel' && task.action === 'health-check');
  if (healthTask?.status === 'success') {
    items.push(
      healthTask.outputs.healthy === false
        ? 'Health check completed with a warning.'
        : 'Health check returned a healthy response.',
    );
  }

  return items;
}

function summarizeResources(runPlan: RunPlan): string[] {
  const items: string[] = [];

  for (const task of runPlan.tasks) {
    if (task.status !== 'success') {
      continue;
    }

    switch (task.provider) {
      case 'github':
        if (asOptionalString(task.outputs.repoFullName)) {
          items.push(`GitHub repo ${String(task.outputs.repoFullName)}`);
        }
        break;
      case 'neon':
        if (task.action === 'create-project' && asOptionalString(task.outputs.projectName)) {
          items.push(`Neon project ${String(task.outputs.projectName)}`);
        }
        break;
      case 'vercel':
        if (task.action === 'create-project' && asOptionalString(task.outputs.projectName)) {
          items.push(`Vercel project ${String(task.outputs.projectName)}`);
        }
        break;
      case 'clerk':
      case 'stripe':
      case 'resend':
      case 'sentry':
        items.push(PROVIDER_LABELS[task.provider] ?? task.provider);
        break;
      default:
        break;
    }
  }

  return [...new Set(items)];
}

function findPreviewUrl(runPlan: RunPlan): string | undefined {
  const waitTask = runPlan.tasks.find((task) => task.provider === 'vercel' && task.action === 'wait-for-ready');
  const deployTask = runPlan.tasks.find((task) => task.provider === 'vercel' && task.action.includes('deploy'));

  return asOptionalString(waitTask?.outputs.previewUrl) ?? asOptionalString(deployTask?.outputs.previewUrl);
}

function buildTimelineEntries(events: RunEvent[], runPlan: RunPlan): TimelineEntry[] {
  if (events.length === 0) {
    return [
      {
        id: 'preparing',
        level: 'info',
        message: 'Preparing run...',
        timestampLabel: 'now',
      },
    ];
  }

  const taskNameById = new Map(runPlan.tasks.map((task) => [task.id, task.name]));
  const filtered = events.filter((event) => {
    if (event.type === 'run.updated') {
      return false;
    }
    if (event.type === 'task.log' && typeof event.message === 'string' && /poll/i.test(event.message)) {
      return false;
    }
    return true;
  });

  const deduped: RunEvent[] = [];
  for (const event of filtered) {
    const last = deduped[deduped.length - 1];
    if (last && last.taskId === event.taskId && last.message === event.message && last.type === event.type) {
      continue;
    }
    deduped.push(event);
  }

  return deduped.slice(-8).map((event) => {
    const entry: TimelineEntry = {
      id: event.id,
      level: event.level,
      message: event.message,
      timestampLabel: formatEventTime(event.timestamp),
    };

    if (event.taskId) {
      const taskName = taskNameById.get(event.taskId);
      if (taskName) {
        entry.taskName = taskName;
      }
    }

    return entry;
  });
}

function deriveExecutionTaskView(task: Task, events: RunEvent[]): ExecutionTaskView {
  const attemptCount = getRetryAttemptCount(events);
  const latestEvent = events.at(-1);
  const latestStatusEvent = [...events].reverse().find((event) => event.type === 'task.status_changed');
  const latestRetryEvent = [...events].reverse().find(
    (event) => event.type === 'task.log' && event.metadata?.attemptNumber !== undefined,
  );
  const retrying =
    task.status === 'running' &&
    latestRetryEvent !== undefined &&
    latestStatusEvent !== undefined &&
    latestRetryEvent.timestamp >= latestStatusEvent.timestamp;

  const taskView: ExecutionTaskView = {
    id: task.id,
    name: task.name,
    provider: task.provider,
    phaseKey: getExecutionPhaseKey(task),
    status: getDisplayTaskStatus(task, retrying),
    attemptCount,
    isActive: task.status === 'running' || retrying,
  };

  const resourceLabel = getTaskResourceLabel(task);
  if (resourceLabel) {
    taskView.resourceLabel = resourceLabel;
  }
  if (latestEvent) {
    taskView.lastUpdatedAt = formatEventTime(latestEvent.timestamp);
  }
  if (task.error) {
    taskView.error = task.error;
  }
  if (task.remediationHint) {
    taskView.remediation = task.remediationHint;
  }

  return taskView;
}

function getRetryAttemptCount(events: RunEvent[]): number {
  return events.reduce((maxAttempt, event) => {
    const rawAttempt = event.metadata?.attemptNumber;
    if (typeof rawAttempt === 'number' && rawAttempt > maxAttempt) {
      return rawAttempt;
    }
    return maxAttempt;
  }, 0);
}

function getDisplayTaskStatus(task: Task, retrying: boolean): DisplayTaskStatus {
  if (retrying) {
    return 'retrying';
  }
  if (task.status === 'success' && task.outputs.healthy === false) {
    return 'warning';
  }
  switch (task.status) {
    case 'running':
      return 'running';
    case 'success':
      return 'success';
    case 'failed':
      return 'failed';
    case 'skipped':
      return 'skipped';
    default:
      return 'pending';
  }
}

function getTaskResourceLabel(task: Task): string | undefined {
  const candidates = [
    task.outputs.repoFullName,
    task.outputs.projectName,
    task.outputs.projectId,
    task.outputs.deploymentId,
    task.outputs.domain,
    task.outputs.branchName,
    task.outputs.databaseName,
  ];
  const value = candidates.find((candidate) => asOptionalString(candidate));
  if (!value) {
    const syncedKeys = task.outputs.syncedKeys;
    if (Array.isArray(syncedKeys) && syncedKeys.length > 0) {
      return `${syncedKeys.length} env var${syncedKeys.length === 1 ? '' : 's'}`;
    }
    return undefined;
  }

  const label = String(value);
  return label.length > 24 && /^(dpl_|prj_)/.test(label) ? `${label.slice(0, 12)}...` : label;
}

function getPlanPhaseKey(task: Task): PlanPhaseKey {
  if (task.provider === 'github') {
    return 'repo';
  }
  if (
    task.action.includes('capture') ||
    task.action.includes('sync') ||
    task.action.includes('link') ||
    task.action.includes('push') ||
    task.action.includes('set-preview-env-var') ||
    task.action.includes('add-domain') ||
    task.action.includes('create-dns-record')
  ) {
    return 'config';
  }
  if (task.action.includes('deploy')) {
    return 'deploy';
  }
  if (task.action.includes('wait') || task.action.includes('health') || task.action.includes('verify')) {
    return 'verify';
  }

  return 'infra';
}

function getExecutionPhaseKey(task: Task): ExecutionPhaseKey {
  const planPhase = getPlanPhaseKey(task);
  switch (planPhase) {
    case 'deploy':
      return 'deploying';
    case 'verify':
      return 'verifying';
    case 'config':
      return 'syncing';
    case 'repo':
    case 'infra':
    default:
      return task.action.includes('push') || task.action.includes('link') ? 'syncing' : 'provisioning';
  }
}

function formatEventTime(value: Date): string {
  return value.toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function formatDuration(valueMs: number): string {
  const totalSeconds = Math.floor(valueMs / 1_000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function asOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value : undefined;
}
