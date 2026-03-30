import React, { useState, useCallback } from 'react';
import { Box, Text } from 'ink';
import SelectInput from 'ink-select-input';
import { useCliApp } from '../context.js';
import { useNavigation } from '../hooks/use-navigation.js';
import { LoadingIndicator } from '../components/LoadingIndicator.js';
import { ErrorBox } from '../components/ErrorBox.js';
import type { TuiAction } from '../types.js';

type EnvPhase = 'menu' | 'loading' | 'result' | 'error';

export function EnvScreen({
  dispatch,
}: {
  dispatch: React.Dispatch<TuiAction>;
}) {
  const app = useCliApp();
  useNavigation(dispatch);
  const [phase, setPhase] = useState<EnvPhase>('menu');
  const [resultMessage, setResultMessage] = useState<string | null>(null);
  const [resultVars, setResultVars] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const handlePull = useCallback(async () => {
    setPhase('loading');
    try {
      const result = await app.envPull();
      setResultMessage(`Pulled ${Object.keys(result.variables).length} variables from ${result.projectName} to ${result.filePath}`);
      setResultVars(Object.keys(result.variables));
      setPhase('result');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setPhase('error');
    }
  }, [app]);

  const handlePush = useCallback(async () => {
    setPhase('loading');
    try {
      const result = await app.envPush();
      setResultMessage(`Pushed ${result.pushed.length} variables to ${result.projectName}`);
      setResultVars(result.pushed);
      setPhase('result');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setPhase('error');
    }
  }, [app]);

  return (
    <Box flexDirection="column">
      <Text bold>Environment Variables</Text>

      <Box marginTop={1} flexDirection="column">
        {phase === 'menu' && (
          <SelectInput
            items={[
              { label: 'Pull from Vercel     Download env vars to .env.local', value: 'pull' },
              { label: 'Push to Vercel       Upload local env vars', value: 'push' },
              { label: 'Back', value: 'back' },
            ]}
            onSelect={(item) => {
              if (item.value === 'pull') handlePull();
              else if (item.value === 'push') handlePush();
              else dispatch({ type: 'back' });
            }}
          />
        )}

        {phase === 'loading' && (
          <LoadingIndicator message="Syncing environment variables..." />
        )}

        {phase === 'result' && (
          <Box flexDirection="column">
            <Text color="green">✓ {resultMessage}</Text>
            {resultVars.map((v) => (
              <Text key={v} dimColor>  • {v}</Text>
            ))}
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
