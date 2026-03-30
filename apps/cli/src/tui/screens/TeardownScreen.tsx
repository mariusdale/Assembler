import React, { useState, useEffect, useCallback } from 'react';
import { Box, Text } from 'ink';
import type { RunPlan } from '@devassemble/types';
import { useCliApp } from '../context.js';
import { useNavigation } from '../hooks/use-navigation.js';
import { LoadingIndicator } from '../components/LoadingIndicator.js';
import { ErrorBox } from '../components/ErrorBox.js';
import { TaskProgressList } from '../components/TaskProgressList.js';
import { DestructiveConfirm } from '../components/DestructiveConfirm.js';
import type { TuiAction } from '../types.js';

type TeardownPhase = 'loading' | 'confirm' | 'executing' | 'complete' | 'error';

export function TeardownScreen({
  dispatch,
}: {
  dispatch: React.Dispatch<TuiAction>;
}) {
  const app = useCliApp();
  const { goBack } = useNavigation(dispatch, {
    disabled: false,
  });
  const [phase, setPhase] = useState<TeardownPhase>('loading');
  const [run, setRun] = useState<RunPlan | null>(null);
  const [result, setResult] = useState<RunPlan | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (phase !== 'loading') return;

    (async () => {
      try {
        const latestRun = await app.status();
        if (latestRun.status !== 'completed' && latestRun.status !== 'failed') {
          setError(`Run status is "${latestRun.status}" — only completed or failed runs can be torn down.`);
          setPhase('error');
          return;
        }
        setRun(latestRun);
        setPhase('confirm');
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        setPhase('error');
      }
    })();
  }, [phase, app]);

  const handleConfirm = useCallback(async () => {
    if (!run) return;
    setPhase('executing');

    try {
      const rolledBack = await app.rollback(run.id);
      setResult(rolledBack);
      setPhase('complete');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setPhase('error');
    }
  }, [app, run]);

  return (
    <Box flexDirection="column">
      <Text bold>Teardown</Text>

      <Box marginTop={1} flexDirection="column">
        {phase === 'loading' && (
          <LoadingIndicator message="Loading latest run..." />
        )}

        {phase === 'confirm' && run && (
          <Box flexDirection="column">
            <Text color="red" bold>
              This will delete the following resources:
            </Text>
            {run.tasks
              .filter((t) => t.status === 'success')
              .map((t) => (
                <Text key={t.id} color="red">
                  {'  '}✗ {t.name}
                </Text>
              ))}
            <Box marginTop={1}>
              <DestructiveConfirm
                message=""
                confirmWord="delete"
                onConfirm={handleConfirm}
                onCancel={goBack}
              />
            </Box>
          </Box>
        )}

        {phase === 'executing' && (
          <LoadingIndicator message="Tearing down resources..." />
        )}

        {phase === 'complete' && result && (
          <Box flexDirection="column">
            <Text color="green" bold>✓ Teardown complete</Text>
            <TaskProgressList tasks={result.tasks} />
            <Text dimColor>Press esc to return to menu</Text>
          </Box>
        )}

        {phase === 'error' && error && (
          <Box flexDirection="column">
            <ErrorBox message={error} />
            <Text dimColor>Press esc to go back</Text>
          </Box>
        )}
      </Box>
    </Box>
  );
}
