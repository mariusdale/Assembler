import React, { useState, useCallback } from 'react';
import { Box, Text } from 'ink';
import SelectInput from 'ink-select-input';
import TextInput from 'ink-text-input';
import { useCliApp } from '../context.js';
import { useNavigation } from '../hooks/use-navigation.js';
import { LoadingIndicator } from '../components/LoadingIndicator.js';
import { ErrorBox } from '../components/ErrorBox.js';
import type { TuiAction } from '../types.js';

type PreviewPhase = 'menu' | 'branch-input' | 'creating' | 'tearing-down' | 'result' | 'error';

export function PreviewScreen({
  dispatch,
}: {
  dispatch: React.Dispatch<TuiAction>;
}) {
  const app = useCliApp();
  useNavigation(dispatch);
  const [phase, setPhase] = useState<PreviewPhase>('menu');
  const [action, setAction] = useState<'create' | 'teardown'>('create');
  const [branchName, setBranchName] = useState('');
  const [resultMessage, setResultMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleCreate = useCallback(
    async (branch?: string) => {
      setPhase('creating');
      try {
        const result = await app.preview(branch || undefined);
        const parts = [`Preview created for branch "${result.branchName}"`];
        if (result.previewUrl) parts.push(`URL: ${result.previewUrl}`);
        if (result.databaseUrl) parts.push(`Database: branch created`);
        setResultMessage(parts.join('\n'));
        setPhase('result');
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        setPhase('error');
      }
    },
    [app],
  );

  const handleTeardown = useCallback(
    async (branch?: string) => {
      setPhase('tearing-down');
      try {
        const result = await app.previewTeardown(branch || undefined);
        setResultMessage(
          `Preview torn down for branch "${result.branchName}"${result.deletedBranch ? ' (database branch deleted)' : ''}`,
        );
        setPhase('result');
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        setPhase('error');
      }
    },
    [app],
  );

  return (
    <Box flexDirection="column">
      <Text bold>Preview Environments</Text>

      <Box marginTop={1} flexDirection="column">
        {phase === 'menu' && (
          <SelectInput
            items={[
              { label: 'Create preview        Deploy current branch', value: 'create' },
              { label: 'Teardown preview      Remove preview environment', value: 'teardown' },
              { label: 'Back', value: 'back' },
            ]}
            onSelect={(item) => {
              if (item.value === 'create') {
                setAction('create');
                setPhase('branch-input');
              } else if (item.value === 'teardown') {
                setAction('teardown');
                setPhase('branch-input');
              } else {
                dispatch({ type: 'back' });
              }
            }}
          />
        )}

        {phase === 'branch-input' && (
          <Box flexDirection="column">
            <Text>Branch name <Text dimColor>(leave empty for current branch)</Text>:</Text>
            <Box>
              <Text>{`> `}</Text>
              <TextInput
                value={branchName}
                onChange={setBranchName}
                onSubmit={(value) => {
                  if (action === 'create') handleCreate(value);
                  else handleTeardown(value);
                }}
              />
            </Box>
          </Box>
        )}

        {phase === 'creating' && (
          <LoadingIndicator message="Creating preview environment..." />
        )}

        {phase === 'tearing-down' && (
          <LoadingIndicator message="Tearing down preview environment..." />
        )}

        {phase === 'result' && resultMessage && (
          <Box flexDirection="column">
            <Text color="green">✓ {resultMessage}</Text>
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
