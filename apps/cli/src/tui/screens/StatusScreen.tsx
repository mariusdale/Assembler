import React, { useEffect, useState } from 'react';
import { Box, Text } from 'ink';
import SelectInput from 'ink-select-input';
import type { RunEvent, RunPlan } from '@devassemble/types';

import { ErrorBox } from '../components/ErrorBox.js';
import { LoadingIndicator } from '../components/LoadingIndicator.js';
import { StatusBadge } from '../components/StatusBadge.js';
import { useCliApp } from '../context.js';
import { useNavigation } from '../hooks/use-navigation.js';
import {
  deriveRunOutcomeSummary,
  formatRunCreatedAt,
} from '../run-insights.js';
import type { TuiAction } from '../types.js';

type StatusView = 'list' | 'detail';

export function StatusScreen({
  dispatch,
}: {
  dispatch: React.Dispatch<TuiAction>;
}) {
  const app = useCliApp();
  const [view, setView] = useState<StatusView>('list');
  const [runs, setRuns] = useState<RunPlan[] | null>(null);
  const [selectedRun, setSelectedRun] = useState<RunPlan | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useNavigation(dispatch, { disabled: view === 'detail' });

  useEffect(() => {
    (async () => {
      try {
        const loadedRuns = await app.listRuns();
        setRuns(loadedRuns);
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : String(loadError));
      } finally {
        setLoading(false);
      }
    })();
  }, [app]);

  if (loading) {
    return <LoadingIndicator message="Loading runs..." />;
  }

  if (error) {
    return <ErrorBox message={error} />;
  }

  if (view === 'detail' && selectedRun) {
    return (
      <RunDetail
        run={selectedRun}
        onBack={() => {
          setSelectedRun(null);
          setView('list');
        }}
        dispatch={dispatch}
      />
    );
  }

  if (!runs || runs.length === 0) {
    return (
      <Box flexDirection="column">
        <Text bold>Status</Text>
        <Text dimColor>No runs found. Launch your first project to populate this history.</Text>
      </Box>
    );
  }

  const items = runs.map((run) => {
    const summary = deriveRunOutcomeSummary(run);
    return {
      label: `${run.id.slice(0, 8)}  ${formatRunCreatedAt(run).padEnd(17)}  ${summary.briefStatus}`,
      value: run.id,
    };
  });

  return (
    <Box flexDirection="column">
      <Text bold>Recent Runs</Text>
      <Text dimColor>Select a run to inspect resources, warnings, and recovery actions.</Text>
      <Box marginTop={1}>
        <SelectInput
          items={items}
          onSelect={(item) => {
            const run = runs.find((candidate) => candidate.id === item.value);
            if (run) {
              setSelectedRun(run);
              setView('detail');
            }
          }}
        />
      </Box>
    </Box>
  );
}

function RunDetail({
  run,
  onBack,
  dispatch,
}: {
  run: RunPlan;
  onBack: () => void;
  dispatch: React.Dispatch<TuiAction>;
}) {
  const app = useCliApp();
  const [events, setEvents] = useState<RunEvent[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const summary = deriveRunOutcomeSummary(run, events ?? []);

  useNavigation(dispatch, { disabled: true });

  useEffect(() => {
    (async () => {
      try {
        setEvents(await app.events(run.id));
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : String(loadError));
      } finally {
        setLoading(false);
      }
    })();
  }, [app, run.id]);

  const items = [
    { label: 'Back to list', value: 'back' },
    ...(run.status === 'failed' ? [{ label: 'Resume run', value: 'resume' }] : []),
    ...(run.status === 'completed' ? [{ label: 'Rollback resources', value: 'rollback' }] : []),
  ];

  return (
    <Box flexDirection="column">
      <Text bold>
        Run {run.id.slice(0, 8)} - <StatusBadge status={run.status} />
      </Text>
      <Text dimColor>Created {formatRunCreatedAt(run)}</Text>

      {loading ? <LoadingIndicator message="Loading run timeline..." /> : null}
      {error ? <ErrorBox message={error} /> : null}

      <StatusPanel title="Outcome" borderColor={summary.kind === 'failed' ? 'red' : summary.kind === 'success_with_warnings' ? 'yellow' : 'green'}>
        <Text bold>{summary.headline}</Text>
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
      </StatusPanel>

      {summary.resources.length > 0 ? (
        <StatusPanel title="Created Resources">
          {summary.resources.map((resource) => (
            <Text key={resource}>• {resource}</Text>
          ))}
        </StatusPanel>
      ) : null}

      {summary.verification.length > 0 ? (
        <StatusPanel title="Verification">
          {summary.verification.map((item) => (
            <Text key={item}>• {item}</Text>
          ))}
        </StatusPanel>
      ) : null}

      {summary.warnings.length > 0 ? (
        <StatusPanel title="Warnings" borderColor="yellow">
          {summary.warnings.map((warning) => (
            <Text key={warning} color="yellow">• {warning}</Text>
          ))}
        </StatusPanel>
      ) : null}

      {summary.firstFailure ? (
        <StatusPanel title="Failure Summary" borderColor="red">
          <Text color="red" bold>{summary.firstFailure.taskName}</Text>
          <Text color="red">{summary.firstFailure.reason}</Text>
          {summary.firstFailure.remediation ? (
            <Text dimColor>{summary.firstFailure.remediation}</Text>
          ) : (
            <Text dimColor>Use resume when the failure looks transient or after you fix credentials/provider state.</Text>
          )}
        </StatusPanel>
      ) : null}

      {events && events.length > 0 ? (
        <StatusPanel title="Timeline">
          {events.slice(-8).map((event) => (
            <Text key={event.id} color={event.level === 'error' ? 'red' : event.level === 'warn' ? 'yellow' : 'white'}>
              [{event.timestamp.toLocaleTimeString()}] {event.message}
            </Text>
          ))}
        </StatusPanel>
      ) : null}

      {summary.nextSteps.length > 0 ? (
        <StatusPanel title="Next Steps">
          {summary.nextSteps.map((step) => (
            <Text key={step}>• {step}</Text>
          ))}
        </StatusPanel>
      ) : null}

      <Box marginTop={1} flexDirection="column">
        {run.status === 'failed' ? (
          <Text dimColor>Resume retries the stored run from its checkpoint after you address the likely cause.</Text>
        ) : null}
        {run.status === 'completed' ? (
          <Text dimColor>Rollback removes provisioned resources from this run and should be treated as destructive.</Text>
        ) : null}
      </Box>

      <Box marginTop={1}>
        <SelectInput
          items={items}
          onSelect={async (item) => {
            if (item.value === 'back') {
              onBack();
              return;
            }
            try {
              if (item.value === 'resume') {
                await app.resume(run.id);
                onBack();
                return;
              }
              if (item.value === 'rollback') {
                await app.rollback(run.id);
                onBack();
              }
            } catch (actionError) {
              setError(actionError instanceof Error ? actionError.message : String(actionError));
            }
          }}
        />
      </Box>
    </Box>
  );
}

function StatusPanel({
  title,
  children,
  borderColor = 'cyan',
}: {
  title: string;
  children: React.ReactNode;
  borderColor?: string;
}) {
  return (
    <Box flexDirection="column" borderStyle="round" borderColor={borderColor} paddingX={1} marginTop={1}>
      <Text bold>{title}</Text>
      <Box flexDirection="column" marginTop={1}>
        {children}
      </Box>
    </Box>
  );
}
