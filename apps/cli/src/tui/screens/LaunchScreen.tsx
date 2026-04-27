import React, { useCallback, useEffect, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import Spinner from 'ink-spinner';
import type { ProjectScan, RunPlan, Task } from '@assembler/types';

import type { PreflightCheckResults } from '../../app.js';
import { ConfirmPrompt } from '../components/ConfirmPrompt.js';
import { ErrorBox } from '../components/ErrorBox.js';
import { useCliApp } from '../context.js';
import { useEventStream } from '../hooks/use-event-stream.js';
import { useNavigation } from '../hooks/use-navigation.js';
import { useRunView } from '../hooks/use-run-view.js';
import {
  deriveRunOutcomeSummary,
  getExpectedOutputs,
  getLaunchReadiness,
  getLaunchWarnings,
  getProviderReadiness,
  groupTasksForPlan,
  type DisplayTaskStatus,
  type ExecutionTaskView,
  type ExecutionView,
  type LaunchReadinessState,
  type PlanTaskGroup,
  type ProviderReadinessItem,
  type RunOutcomeSummary,
} from '../run-insights.js';
import type { TuiAction, TuiState } from '../types.js';

type LaunchPhase =
  | 'scan'
  | 'preflight'
  | 'plan'
  | 'execute'
  | 'execute-paused'
  | 'complete'
  | 'error';

const FRAMEWORK_LABELS: Record<string, string> = {
  nextjs: 'Next.js',
  remix: 'Remix',
  astro: 'Astro',
  node: 'Node.js',
  unknown: 'Unknown',
};

const READINESS_LABELS: Record<LaunchReadinessState, string> = {
  ready: 'Ready',
  ready_with_warnings: 'Ready With Warnings',
  blocked: 'Blocked',
};

const READINESS_COLORS: Record<LaunchReadinessState, string> = {
  ready: 'green',
  ready_with_warnings: 'yellow',
  blocked: 'red',
};

const STATUS_COLORS: Record<DisplayTaskStatus, string> = {
  pending: 'gray',
  running: 'cyan',
  retrying: 'yellow',
  success: 'green',
  warning: 'yellow',
  failed: 'red',
  skipped: 'yellow',
};

export function LaunchScreen({
  dispatch,
}: {
  state: TuiState;
  dispatch: React.Dispatch<TuiAction>;
}) {
  const app = useCliApp();
  const [phase, setPhase] = useState<LaunchPhase>('scan');
  const [projectScan, setProjectScan] = useState<ProjectScan | null>(null);
  const [runPlan, setRunPlan] = useState<RunPlan | null>(null);
  const [preflightResults, setPreflightResults] = useState<PreflightCheckResults | null>(null);
  const [executedPlan, setExecutedPlan] = useState<RunPlan | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [runId, setRunId] = useState<string | null>(null);
  const events = useEventStream(runId);
  const executionView = useRunView(runPlan, events);

  const navigationEnabled = phase === 'plan' || phase === 'complete' || phase === 'error';
  const { goBack } = useNavigation(dispatch, { disabled: !navigationEnabled });

  useEffect(() => {
    if (phase !== 'execute' && phase !== 'execute-paused') {
      return;
    }

    const statusEvents = events.filter((event) => event.type === 'task.status_changed');
    if (statusEvents.length === 0) {
      return;
    }

    setRunPlan((current) => {
      if (!current) {
        return current;
      }

      let changed = false;
      const updatedTasks = current.tasks.map((task) => {
        const latestEvent = [...statusEvents].reverse().find((event) => event.taskId === task.id);
        const nextStatus = latestEvent?.metadata?.status as Task['status'] | undefined;

        if (nextStatus && task.status !== nextStatus) {
          changed = true;
          return { ...task, status: nextStatus };
        }

        return task;
      });

      return changed ? { ...current, tasks: updatedTasks } : current;
    });
  }, [events, phase]);

  useEffect(() => {
    if (phase !== 'scan') {
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const scan = await app.scan();
        if (cancelled) {
          return;
        }
        setProjectScan(scan);
        dispatch({ type: 'setProjectScan', scan });

        const plan = app.createPlan(scan);
        if (cancelled) {
          return;
        }
        setRunPlan(plan);
        setRunId(plan.id);
        dispatch({ type: 'setRunPlan', plan });
        setPhase('preflight');
      } catch (scanError) {
        if (cancelled) {
          return;
        }
        setError(scanError instanceof Error ? scanError.message : String(scanError));
        setPhase('error');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [app, dispatch, phase]);

  useEffect(() => {
    if (phase !== 'preflight' || !runPlan) {
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const results = await app.preflight(runPlan);
        if (cancelled) {
          return;
        }
        setPreflightResults(results);
        setPhase('plan');
      } catch (preflightError) {
        if (cancelled) {
          return;
        }
        setError(preflightError instanceof Error ? preflightError.message : String(preflightError));
        setPhase('error');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [app, phase, runPlan]);

  const handleConfirm = useCallback(async () => {
    if (!runPlan) {
      return;
    }

    setPhase('execute');
    try {
      const result = await app.executePlan(runPlan);
      setRunPlan(result);
      if (result.tasks.some((task) => task.status === 'failed')) {
        setPhase('execute-paused');
        return;
      }
      setExecutedPlan(result);
      setPhase('complete');
    } catch (executionError) {
      setError(executionError instanceof Error ? executionError.message : String(executionError));
      setPhase('error');
    }
  }, [app, runPlan]);

  const handleFailureAction = useCallback(
    async (taskId: string, action: 'retry' | 'skip' | 'abort') => {
      if (!runPlan) {
        return;
      }

      if (action === 'abort') {
        setError('Launch aborted by user.');
        setPhase('error');
        return;
      }

      const updatedTasks = runPlan.tasks.map((task) => {
        if (task.id !== taskId) {
          return task;
        }
        if (action === 'skip') {
          return { ...task, status: 'skipped' as const };
        }

        const { error, ...rest } = task;
        void error;
        return { ...rest, status: 'pending' as const };
      });

      setRunPlan({ ...runPlan, tasks: updatedTasks });
      setPhase('execute');

      try {
        const result = await app.executePlan({ ...runPlan, tasks: updatedTasks });
        setRunPlan(result);
        if (result.tasks.some((task) => task.status === 'failed')) {
          setPhase('execute-paused');
          return;
        }
        setExecutedPlan(result);
        setPhase('complete');
      } catch (executionError) {
        setError(executionError instanceof Error ? executionError.message : String(executionError));
        setPhase('error');
      }
    },
    [app, runPlan],
  );

  const readiness =
    projectScan && preflightResults
      ? getLaunchReadiness(projectScan, preflightResults)
      : 'blocked';

  return (
    <Box flexDirection="column">
      <Text bold>Launch</Text>
      <Box marginTop={1} flexDirection="column">
        {phase === 'scan' && <LoadingPhase message="Scanning project and identifying required providers..." />}
        {phase === 'preflight' && <LoadingPhase message="Validating credentials and launch readiness..." />}
        {phase === 'plan' && projectScan && runPlan && preflightResults && (
          <Box flexDirection="column">
            <LaunchBriefing
              projectScan={projectScan}
              runPlan={runPlan}
              preflightResults={preflightResults}
              readiness={readiness}
            />
            <Box marginTop={1}>
              {readiness === 'blocked' ? (
                <Text dimColor>Resolve the blocking items above, then press esc to go back.</Text>
              ) : (
                <ConfirmPrompt
                  message="Proceed with launch?"
                  onConfirm={handleConfirm}
                  onCancel={goBack}
                />
              )}
            </Box>
          </Box>
        )}
        {(phase === 'execute' || phase === 'execute-paused') && runPlan && executionView && (
          <ExecutePhase
            runPlan={runPlan}
            view={executionView}
            paused={phase === 'execute-paused'}
            onFailureAction={handleFailureAction}
          />
        )}
        {phase === 'complete' && executedPlan && (
          <CompletionPhase runPlan={executedPlan} summary={deriveRunOutcomeSummary(executedPlan, events)} />
        )}
        {phase === 'error' && error && (
          <Box flexDirection="column">
            <ErrorBox message={error} />
            <Box marginTop={1}>
              <Text dimColor>Press esc to go back.</Text>
            </Box>
          </Box>
        )}
      </Box>
    </Box>
  );
}

function LoadingPhase({ message }: { message: string }) {
  return (
    <Box>
      <Text color="cyan">
        <Spinner type="dots" />
      </Text>
      <Text> {message}</Text>
    </Box>
  );
}

function LaunchBriefing({
  projectScan,
  runPlan,
  preflightResults,
  readiness,
}: {
  projectScan: ProjectScan;
  runPlan: RunPlan;
  preflightResults: PreflightCheckResults;
  readiness: LaunchReadinessState;
}) {
  const providerReadiness = getProviderReadiness(projectScan, runPlan, preflightResults);
  const expectedOutputs = getExpectedOutputs(runPlan);
  const warnings = getLaunchWarnings(projectScan);
  const blockingWarnings = warnings.filter((warning) => warning.level === 'blocking');
  const advisoryWarnings = warnings.filter((warning) => warning.level !== 'blocking');
  const planGroups = groupTasksForPlan(runPlan.tasks);
  const homeDir = process.env.HOME ?? '';

  return (
    <Box flexDirection="column">
      <InfoPanel title="Launch Readiness" borderColor={READINESS_COLORS[readiness]}>
        <Text color={READINESS_COLORS[readiness]} bold>
          {READINESS_LABELS[readiness]}
        </Text>
        <Text dimColor>Run ID: {runPlan.id}</Text>
        <Text dimColor>
          {readiness === 'blocked'
            ? 'Resolve the blocking items below before approving this launch.'
            : readiness === 'ready_with_warnings'
              ? 'The project can launch, but you should review the warnings before proceeding.'
              : 'The project is ready for the supported launch workflow.'}
        </Text>
      </InfoPanel>

      <InfoPanel title="Project">
        <KeyValue label="Framework" value={FRAMEWORK_LABELS[projectScan.framework] ?? projectScan.framework} />
        <KeyValue label="Directory" value={projectScan.directory.replace(homeDir, '~')} />
        <KeyValue
          label="Git remote"
          value={projectScan.gitRemoteUrl ?? 'No remote configured — Assembler will create one'}
        />
        <KeyValue
          label="Lockfile"
          value={describeLockfile(projectScan)}
          color={projectScan.lockfileCheck.lockfileExists && projectScan.lockfileCheck.inSync ? 'green' : 'red'}
        />
      </InfoPanel>

      {blockingWarnings.length > 0 ? (
        <InfoPanel title="Blocking Items" borderColor="red">
          {blockingWarnings.map((warning) => (
            <Text key={warning.message} color="red">✗ {warning.message}</Text>
          ))}
        </InfoPanel>
      ) : null}

      {advisoryWarnings.length > 0 ? (
        <InfoPanel title="Warnings" borderColor="yellow">
          {advisoryWarnings.map((warning) => (
            <Text key={warning.message} color="yellow">• {warning.message}</Text>
          ))}
        </InfoPanel>
      ) : null}

      <InfoPanel title="Required Providers">
        {providerReadiness.map((provider) => (
          <ProviderRow key={provider.provider} provider={provider} />
        ))}
      </InfoPanel>

      <InfoPanel title="Expected Outputs">
        {expectedOutputs.map((output) => (
          <Box key={output.label} flexDirection="column" marginBottom={1}>
            <Text bold>{output.label}</Text>
            <Text dimColor>{output.detail}</Text>
          </Box>
        ))}
      </InfoPanel>

      <InfoPanel title="Execution Plan">
        {planGroups.map((group) => (
          <PlanGroupRow
            key={group.key}
            group={group}
            {...(group.key === 'infra' ? { estimatedCostUsd: runPlan.estimatedCostUsd } : {})}
          />
        ))}
      </InfoPanel>

      <Box marginTop={1} flexDirection="column">
        <Text dimColor>Launch usually takes 1-3 minutes depending on provider API latency.</Text>
        <Text dimColor>Press enter to start the launch. Press esc to go back without creating resources.</Text>
      </Box>
    </Box>
  );
}

function ExecutePhase({
  runPlan,
  view,
  paused,
  onFailureAction,
}: {
  runPlan: RunPlan;
  view: ExecutionView;
  paused: boolean;
  onFailureAction: (taskId: string, action: 'retry' | 'skip' | 'abort') => void;
}) {
  const failureTask = view.failure
    ? runPlan.tasks.find((task) => task.id === view.failure?.taskId)
    : undefined;

  return (
    <Box flexDirection="column">
      <InfoPanel title="Execution">
        <Text>
          <Text bold>Run</Text> <Text color="cyan">{runPlan.id}</Text>
          <Text dimColor> • {view.currentPhaseLabel}</Text>
          <Text dimColor> • {view.completedCount}/{view.totalCount} complete</Text>
          <Text dimColor> • {view.elapsedLabel} elapsed</Text>
        </Text>
        <Text>
          <Text bold>Current task:</Text> {view.currentTaskLabel}
        </Text>
      </InfoPanel>

      <InfoPanel title="Tasks">
        {view.taskGroups.map((group) => (
          <Box key={group.key} flexDirection="column" marginBottom={1}>
            <Text bold>{group.label}</Text>
            {group.tasks.map((task) => (
              <ExecutionTaskRow key={task.id} task={task} />
            ))}
          </Box>
        ))}
      </InfoPanel>

      <InfoPanel title="Recent Activity">
        {view.timeline.map((entry) => (
          <Text key={entry.id} color={entry.level === 'error' ? 'red' : entry.level === 'warn' ? 'yellow' : 'white'}>
            [{entry.timestampLabel}] {entry.message}
          </Text>
        ))}
      </InfoPanel>

      {paused && view.failure ? (
        <InfoPanel title="Failure Recovery" borderColor="red">
          <Text color="red" bold>{view.failure.taskName}</Text>
          {failureTask ? <Text dimColor>Provider: {failureTask.provider}</Text> : null}
          <Text color="red">{view.failure.reason}</Text>
          {view.failure.remediation ? (
            <Text dimColor>{view.failure.remediation}</Text>
          ) : (
            <Text dimColor>Retry if the failure looks transient, or skip only if you understand the downstream impact.</Text>
          )}
          <Text dimColor>Recommended next command: assembler resume {runPlan.id}</Text>
          <Box marginTop={1} flexDirection="column">
            <Text>
              <Text bold color="yellow">[r]</Text>etry
              <Text>  </Text>
              <Text bold color="yellow">[s]</Text>kip
              <Text>  </Text>
              <Text bold color="yellow">[a]</Text>bort
            </Text>
          </Box>
          <FailureKeyHandler failureTaskId={view.failure.taskId} onFailureAction={onFailureAction} />
        </InfoPanel>
      ) : (
        <Text dimColor>Press esc is disabled while the launch is running so the console can stay attached to this run.</Text>
      )}
    </Box>
  );
}

function CompletionPhase({
  runPlan,
  summary,
}: {
  runPlan: RunPlan;
  summary: RunOutcomeSummary;
}) {
  const color =
    summary.kind === 'failed' ? 'red' : summary.kind === 'success_with_warnings' ? 'yellow' : 'green';
  const failureTask = summary.firstFailure
    ? runPlan.tasks.find((task) => task.id === summary.firstFailure?.taskId)
    : undefined;

  return (
    <Box flexDirection="column">
      <InfoPanel title="Launch Summary" borderColor={color}>
        <Text bold color={color}>{summary.headline}</Text>
        <Text dimColor>Run ID: {runPlan.id}</Text>
        {summary.previewUrl ? (
          <Text>
            Preview: <Text color="cyan">{summary.previewUrl}</Text>
          </Text>
        ) : null}
        {summary.repoUrl ? (
          <Text>
            Repo: <Text color="cyan">{summary.repoUrl}</Text>
          </Text>
        ) : null}
      </InfoPanel>

      {summary.resources.length > 0 ? (
        <InfoPanel title="Created Resources">
          {summary.resources.map((resource) => (
            <Text key={resource}>• {resource}</Text>
          ))}
        </InfoPanel>
      ) : null}

      {summary.verification.length > 0 ? (
        <InfoPanel title="Verification">
          {summary.verification.map((item) => (
            <Text key={item}>• {item}</Text>
          ))}
        </InfoPanel>
      ) : null}

      {summary.warnings.length > 0 ? (
        <InfoPanel title="Warnings" borderColor="yellow">
          {summary.warnings.map((warning) => (
            <Text key={warning} color="yellow">• {warning}</Text>
          ))}
        </InfoPanel>
      ) : null}

      {summary.firstFailure ? (
        <InfoPanel title="Failure Details" borderColor="red">
          <Text color="red" bold>{summary.firstFailure.taskName}</Text>
          {failureTask ? <Text dimColor>Provider: {failureTask.provider}</Text> : null}
          <Text color="red">{summary.firstFailure.reason}</Text>
          {summary.firstFailure.remediation ? (
            <Text dimColor>{summary.firstFailure.remediation}</Text>
          ) : null}
          <Text dimColor>Recommended next command: assembler resume {runPlan.id}</Text>
        </InfoPanel>
      ) : null}

      {summary.nextSteps.length > 0 ? (
        <InfoPanel title="Next Steps">
          {summary.nextSteps.map((step) => (
            <Text key={step}>• {step}</Text>
          ))}
        </InfoPanel>
      ) : null}

      <Text dimColor>Press esc to return to the menu.</Text>
    </Box>
  );
}

function ProviderRow({ provider }: { provider: ProviderReadinessItem }) {
  const color = provider.valid ? 'green' : 'red';

  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text color={color}>
        {provider.valid ? '✓' : '✗'} {provider.label}
        <Text dimColor>
          {provider.required ? ' • required' : ' • optional'}
          {provider.envOnly ? ' • env-only inference' : ''}
        </Text>
      </Text>
      {provider.evidence[0] ? (
        <Text dimColor>  Evidence: {provider.evidence[0]}</Text>
      ) : null}
      {provider.errors.map((error) => (
        <Box key={`${provider.provider}-${error.code}`} flexDirection="column">
          <Text color="red">  {error.message}</Text>
          <Text dimColor>  → {error.remediation}</Text>
          {error.url ? <Text dimColor>    {error.url}</Text> : null}
        </Box>
      ))}
    </Box>
  );
}

function PlanGroupRow({
  group,
  estimatedCostUsd,
}: {
  group: PlanTaskGroup;
  estimatedCostUsd?: number;
}) {
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text bold>
        {group.label}
        {estimatedCostUsd !== undefined ? (
          <Text dimColor>
            {' '}• approx. ${estimatedCostUsd.toFixed(2)}
            {estimatedCostUsd === 0 ? ' (free tier)' : ''}
          </Text>
        ) : null}
      </Text>
      {group.tasks.map((task) => (
        <Text key={task.id} dimColor>
          • {task.name}
        </Text>
      ))}
    </Box>
  );
}

function ExecutionTaskRow({ task }: { task: ExecutionTaskView }) {
  return (
    <Box flexDirection="column" marginLeft={2}>
      <Text color={STATUS_COLORS[task.status]}>
        {statusSymbol(task.status)} {task.name}
        {task.attemptCount > 0 ? <Text dimColor>{` • attempt ${task.attemptCount + 1}`}</Text> : null}
        {task.resourceLabel ? <Text dimColor>{` • ${task.resourceLabel}`}</Text> : null}
        {task.lastUpdatedAt ? <Text dimColor>{` • ${task.lastUpdatedAt}`}</Text> : null}
      </Text>
      {task.error ? <Text color="red" dimColor>  {task.error}</Text> : null}
    </Box>
  );
}

function FailureKeyHandler({
  failureTaskId,
  onFailureAction,
}: {
  failureTaskId: string;
  onFailureAction: (taskId: string, action: 'retry' | 'skip' | 'abort') => void;
}) {
  useInput((input) => {
    if (input === 'r' || input === 'R') {
      onFailureAction(failureTaskId, 'retry');
    } else if (input === 's' || input === 'S') {
      onFailureAction(failureTaskId, 'skip');
    } else if (input === 'a' || input === 'A') {
      onFailureAction(failureTaskId, 'abort');
    }
  });

  return null;
}

function InfoPanel({
  title,
  children,
  borderColor = 'cyan',
}: {
  title: string;
  children: React.ReactNode;
  borderColor?: string;
}) {
  return (
    <Box flexDirection="column" borderStyle="round" borderColor={borderColor} paddingX={1} marginBottom={1}>
      <Text bold>{title}</Text>
      <Box flexDirection="column" marginTop={1}>
        {children}
      </Box>
    </Box>
  );
}

function KeyValue({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color?: string;
}) {
  return (
    <Text>
      <Text bold>{label}: </Text>
      {color ? <Text color={color}>{value}</Text> : <Text>{value}</Text>}
    </Text>
  );
}

function describeLockfile(projectScan: ProjectScan): string {
  const lockfile = projectScan.lockfileCheck;
  if (!lockfile.lockfileExists) {
    return 'Missing lockfile';
  }
  if (!lockfile.inSync) {
    return `${lockfile.packageManager ?? 'Package manager'} lockfile out of sync`;
  }
  return `${lockfile.packageManager ?? 'Package manager'} lockfile ready`;
}

function statusSymbol(status: DisplayTaskStatus): string {
  switch (status) {
    case 'running':
      return '●';
    case 'retrying':
      return '↻';
    case 'success':
      return '✓';
    case 'warning':
      return '!';
    case 'failed':
      return '✗';
    case 'skipped':
      return '○';
    case 'pending':
    default:
      return '·';
  }
}
