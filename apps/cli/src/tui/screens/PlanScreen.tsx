import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import { useCliApp } from '../context.js';
import { useNavigation } from '../hooks/use-navigation.js';
import { LoadingIndicator } from '../components/LoadingIndicator.js';
import { ErrorBox } from '../components/ErrorBox.js';
import type { TuiState, TuiAction } from '../types.js';
import type { ProjectScan, RunPlan } from '@assembler/types';
import { labelFramework, labelProvider } from '../../labels.js';

type PlanPhase = 'scanning' | 'display' | 'error';

export function PlanScreen({
  state,
  dispatch,
}: {
  state: TuiState;
  dispatch: React.Dispatch<TuiAction>;
}) {
  void state;
  const app = useCliApp();
  useNavigation(dispatch);
  const [phase, setPhase] = useState<PlanPhase>('scanning');
  const [projectScan, setProjectScan] = useState<ProjectScan | null>(null);
  const [runPlan, setRunPlan] = useState<RunPlan | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (phase !== 'scanning') return;

    (async () => {
      try {
        const scan = await app.scan();
        setProjectScan(scan);
        const plan = app.createPlan(scan);
        setRunPlan(plan);
        setPhase('display');
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        setPhase('error');
      }
    })();
  }, [phase, app]);

  return (
    <Box flexDirection="column">
      <Text bold>Plan (dry run)</Text>

      <Box marginTop={1} flexDirection="column">
        {phase === 'scanning' && (
          <LoadingIndicator message="Scanning project..." />
        )}

        {phase === 'display' && projectScan && runPlan && (
          <Box flexDirection="column">
            <Text color="green">
              ✓ {labelFramework(projectScan.framework)} app detected
            </Text>
            {projectScan.detectedProviders.map((dp) => (
              <Text key={dp.provider} dimColor>
                {'  '}• {labelProvider(dp.provider)}
              </Text>
            ))}

            <Box marginTop={1} flexDirection="column">
              <Text bold>Execution Plan:</Text>
              {runPlan.tasks.map((task, i) => (
                <Text key={task.id}>
                  {'  '}{i + 1}. {task.name}
                  <Text dimColor>
                    {' '}[{task.requiresApproval ? 'approval' : 'auto'}
                    {task.risk !== 'low' ? ` - ${task.risk} risk` : ''}]
                  </Text>
                </Text>
              ))}
            </Box>

            <Text dimColor>
              {'\n'}Estimated cost: ${runPlan.estimatedCostUsd.toFixed(2)}
              {runPlan.estimatedCostUsd === 0 ? ' (all free tier)' : ''}
            </Text>
            <Text dimColor>
              {'\n'}This is a dry run — no resources were created.
            </Text>
            <Text dimColor>Press esc to go back</Text>
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
