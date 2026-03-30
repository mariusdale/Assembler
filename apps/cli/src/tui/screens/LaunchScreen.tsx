import React, { useState, useEffect, useCallback } from 'react';
import { Box, Text, useApp } from 'ink';
import Spinner from 'ink-spinner';
import type { ProjectScan, RunPlan, Task } from '@devassemble/types';
import { useCliApp } from '../context.js';
import { useNavigation } from '../hooks/use-navigation.js';
import { useEventStream } from '../hooks/use-event-stream.js';
import { TaskProgressList } from '../components/TaskProgressList.js';
import { ErrorBox } from '../components/ErrorBox.js';
import { ConfirmPrompt } from '../components/ConfirmPrompt.js';
import type { TuiState, TuiAction } from '../types.js';
import type { PreflightCheckResults } from '../../app.js';

type LaunchPhase = 'scan' | 'preflight' | 'plan' | 'confirm' | 'execute' | 'complete' | 'error';

const FRAMEWORK_LABELS: Record<string, string> = {
  nextjs: 'Next.js',
  remix: 'Remix',
  astro: 'Astro',
  node: 'Node.js',
  unknown: 'Unknown',
};

const PROVIDER_LABELS: Record<string, string> = {
  neon: 'Database: Neon',
  vercel: 'Hosting: Vercel',
  clerk: 'Auth: Clerk',
  stripe: 'Payments: Stripe',
  cloudflare: 'DNS: Cloudflare',
  resend: 'Email: Resend',
  sentry: 'Error Tracking: Sentry',
  posthog: 'Analytics: PostHog',
};

export function LaunchScreen({
  state,
  dispatch,
}: {
  state: TuiState;
  dispatch: React.Dispatch<TuiAction>;
}) {
  const app = useCliApp();
  const { goBack } = useNavigation(dispatch, { disabled: false });
  const [phase, setPhase] = useState<LaunchPhase>('scan');
  const [projectScan, setProjectScan] = useState<ProjectScan | null>(null);
  const [runPlan, setRunPlan] = useState<RunPlan | null>(null);
  const [preflightResults, setPreflightResults] = useState<PreflightCheckResults | null>(null);
  const [executedPlan, setExecutedPlan] = useState<RunPlan | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [runId, setRunId] = useState<string | null>(null);

  const events = useEventStream(runId);

  // Update task statuses from events during execution
  useEffect(() => {
    if (!runPlan || phase !== 'execute') return;

    const statusEvents = events.filter((e) => e.type === 'task.status_changed');
    if (statusEvents.length === 0) return;

    const updatedTasks = runPlan.tasks.map((task) => {
      const latestEvent = [...statusEvents]
        .reverse()
        .find((e) => e.taskId === task.id);
      if (latestEvent?.metadata?.status) {
        return { ...task, status: latestEvent.metadata.status as Task['status'] };
      }
      return task;
    });

    setRunPlan({ ...runPlan, tasks: updatedTasks });
  }, [events]);

  // Phase: Scan
  useEffect(() => {
    if (phase !== 'scan') return;
    let cancelled = false;

    (async () => {
      try {
        const scan = await app.scan();
        if (cancelled) return;
        setProjectScan(scan);
        dispatch({ type: 'setProjectScan', scan });

        const plan = app.createPlan(scan);
        if (cancelled) return;
        setRunPlan(plan);
        setRunId(plan.id);
        dispatch({ type: 'setRunPlan', plan });
        setPhase('preflight');
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
        setPhase('error');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [phase]);

  // Phase: Preflight
  useEffect(() => {
    if (phase !== 'preflight' || !runPlan) return;
    let cancelled = false;

    (async () => {
      try {
        const results = await app.preflight(runPlan);
        if (cancelled) return;
        setPreflightResults(results);
        setPhase('plan');
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
        setPhase('error');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [phase, runPlan]);

  const handleConfirm = useCallback(async () => {
    if (!runPlan) return;
    setPhase('execute');

    try {
      const result = await app.executePlan(runPlan);
      setExecutedPlan(result);
      setPhase('complete');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setPhase('error');
    }
  }, [app, runPlan]);

  const handleCancel = useCallback(() => {
    goBack();
  }, [goBack]);

  return (
    <Box flexDirection="column">
      <Text bold>Launch</Text>
      <Box marginTop={1} flexDirection="column">
        {phase === 'scan' && <ScanPhase />}
        {phase === 'preflight' && <PreflightPhase />}
        {phase === 'plan' && runPlan && (
          <PlanPhase
            projectScan={projectScan}
            runPlan={runPlan}
            preflightResults={preflightResults}
          />
        )}
        {phase === 'plan' && runPlan && (
          <Box marginTop={1}>
            <ConfirmPrompt
              message="Proceed with launch?"
              onConfirm={handleConfirm}
              onCancel={handleCancel}
            />
          </Box>
        )}
        {phase === 'confirm' && (
          <ConfirmPrompt
            message="Proceed with launch?"
            onConfirm={handleConfirm}
            onCancel={handleCancel}
          />
        )}
        {phase === 'execute' && runPlan && (
          <ExecutePhase tasks={runPlan.tasks} />
        )}
        {phase === 'complete' && executedPlan && (
          <CompletePhase plan={executedPlan} goBack={goBack} />
        )}
        {phase === 'error' && error && (
          <Box flexDirection="column">
            <ErrorBox message={error} />
            <Box marginTop={1}>
              <Text dimColor>Press esc to go back</Text>
            </Box>
          </Box>
        )}
      </Box>
    </Box>
  );
}

function ScanPhase() {
  return (
    <Box>
      <Text color="cyan">
        <Spinner type="dots" />
      </Text>
      <Text> Scanning project...</Text>
    </Box>
  );
}

function PreflightPhase() {
  return (
    <Box>
      <Text color="cyan">
        <Spinner type="dots" />
      </Text>
      <Text> Checking credentials...</Text>
    </Box>
  );
}

function PlanPhase({
  projectScan,
  runPlan,
  preflightResults,
}: {
  projectScan: ProjectScan | null;
  runPlan: RunPlan;
  preflightResults: PreflightCheckResults | null;
}) {
  return (
    <Box flexDirection="column">
      {projectScan ? (
        <Box flexDirection="column" marginBottom={1}>
          <Text color="green">
            ✓ {FRAMEWORK_LABELS[projectScan.framework] ?? projectScan.framework} app detected
          </Text>
          {projectScan.detectedProviders.map((dp) => (
            <Text key={dp.provider} dimColor>
              {'  '}• {PROVIDER_LABELS[dp.provider] ?? dp.provider}
            </Text>
          ))}
        </Box>
      ) : null}

      {preflightResults ? (
        <Box flexDirection="column" marginBottom={1}>
          {[...preflightResults.results.entries()].map(([provider, result]) => (
            <Text key={provider}>
              {result.valid ? (
                <Text color="green">✓</Text>
              ) : (
                <Text color="red">✗</Text>
              )}
              {' '}{provider}
            </Text>
          ))}
        </Box>
      ) : null}

      <Text bold>Execution Plan:</Text>
      {runPlan.tasks.map((task, i) => (
        <Text key={task.id}>
          {'  '}{i + 1}. {task.name}
          <Text dimColor>
            {' '}[{task.requiresApproval ? 'approval' : 'auto'}]
          </Text>
        </Text>
      ))}

      <Box marginTop={1}>
        {runPlan.estimatedCostUsd === 0 ? (
          <Text dimColor>Estimated cost: $0.00 (all free tier)</Text>
        ) : (
          <Text dimColor>Estimated cost: ${runPlan.estimatedCostUsd.toFixed(2)}</Text>
        )}
      </Box>
    </Box>
  );
}

function ExecutePhase({ tasks }: { tasks: Task[] }) {
  return (
    <Box flexDirection="column">
      <Text bold>Executing...</Text>
      <Box marginTop={1}>
        <TaskProgressList tasks={tasks} />
      </Box>
    </Box>
  );
}

function CompletePhase({ plan, goBack }: { plan: RunPlan; goBack: () => void }) {
  const allSuccess = plan.tasks.every((t) => t.status === 'success');
  const vercelTask = plan.tasks.find(
    (t) => t.provider === 'vercel' && (t.action === 'wait-for-ready' || t.action === 'deploy'),
  );
  const previewUrl = vercelTask?.outputs.previewUrl as string | undefined;
  const githubTask = plan.tasks.find(
    (t) => t.provider === 'github' && t.status === 'success',
  );
  const repoUrl = githubTask?.outputs.htmlUrl as string | undefined;

  return (
    <Box flexDirection="column">
      {allSuccess ? (
        <Box flexDirection="column" borderStyle="round" borderColor="green" paddingX={2} paddingY={1}>
          <Text bold color="green">✓ Launch complete!</Text>
          {previewUrl ? (
            <Text>
              {'  '}Preview: <Text color="cyan">{previewUrl}</Text>
            </Text>
          ) : null}
          {repoUrl ? (
            <Text>
              {'  '}Repo:    <Text color="cyan">{repoUrl}</Text>
            </Text>
          ) : null}
        </Box>
      ) : (
        <Box flexDirection="column">
          <Text bold color="yellow">Launch completed with errors</Text>
          <TaskProgressList tasks={plan.tasks} />
        </Box>
      )}

      <Box marginTop={1}>
        <Text dimColor>Press esc to return to menu</Text>
      </Box>
    </Box>
  );
}
