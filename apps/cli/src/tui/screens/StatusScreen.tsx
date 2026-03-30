import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import SelectInput from 'ink-select-input';
import type { RunPlan } from '@devassemble/types';
import { useCliApp } from '../context.js';
import { useNavigation } from '../hooks/use-navigation.js';
import { LoadingIndicator } from '../components/LoadingIndicator.js';
import { ErrorBox } from '../components/ErrorBox.js';
import { StatusBadge } from '../components/StatusBadge.js';
import { TaskProgressList } from '../components/TaskProgressList.js';
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
        // Load all runs by trying to list them
        const loadedRuns: RunPlan[] = [];
        try {
          const latestRun = await app.status();
          loadedRuns.push(latestRun);
        } catch {
          // No runs found
        }
        setRuns(loadedRuns);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
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
        <Text dimColor>No runs found. Run "Launch" to create your first deployment.</Text>
      </Box>
    );
  }

  const items = runs.map((run) => ({
    label: `${run.id.slice(0, 8)}  ${run.status.padEnd(12)}  ${run.tasks.length} tasks`,
    value: run.id,
  }));

  return (
    <Box flexDirection="column">
      <Text bold>Recent Runs</Text>
      <Box marginTop={1}>
        <SelectInput
          items={items}
          onSelect={(item) => {
            const run = runs.find((r) => r.id === item.value);
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

  useNavigation(dispatch, { disabled: true });

  const items = [
    { label: 'Back to list', value: 'back' },
    ...(run.status === 'failed'
      ? [{ label: 'Resume', value: 'resume' }]
      : []),
    ...(run.status === 'completed'
      ? [{ label: 'Rollback', value: 'rollback' }]
      : []),
  ];

  return (
    <Box flexDirection="column">
      <Text bold>
        Run {run.id.slice(0, 8)} — <StatusBadge status={run.status} />
      </Text>

      <Box marginTop={1}>
        <TaskProgressList tasks={run.tasks} />
      </Box>

      <Box marginTop={1}>
        <SelectInput
          items={items}
          onSelect={async (item) => {
            if (item.value === 'back') {
              onBack();
            } else if (item.value === 'resume') {
              try {
                await app.resume(run.id);
                onBack();
              } catch {
                // handled via error
              }
            } else if (item.value === 'rollback') {
              try {
                await app.rollback(run.id);
                onBack();
              } catch {
                // handled via error
              }
            }
          }}
        />
      </Box>
    </Box>
  );
}
