import React, { useState, useEffect, useCallback } from 'react';
import { Box, Text } from 'ink';
import SelectInput from 'ink-select-input';
import TextInput from 'ink-text-input';
import { useCliApp } from '../context.js';
import { useNavigation } from '../hooks/use-navigation.js';
import { LoadingIndicator } from '../components/LoadingIndicator.js';
import { ErrorBox } from '../components/ErrorBox.js';
import type { TuiAction } from '../types.js';

const ALL_PROVIDERS = [
  { name: 'github', label: 'GitHub' },
  { name: 'neon', label: 'Neon' },
  { name: 'vercel', label: 'Vercel' },
  { name: 'stripe', label: 'Stripe' },
  { name: 'clerk', label: 'Clerk' },
  { name: 'cloudflare', label: 'Cloudflare' },
];

type CredsView = 'list' | 'add-select' | 'add-input';

export function CredsScreen({
  dispatch,
}: {
  dispatch: React.Dispatch<TuiAction>;
}) {
  const app = useCliApp();
  useNavigation(dispatch);
  const [view, setView] = useState<CredsView>('list');
  const [configured, setConfigured] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedProvider, setSelectedProvider] = useState<string | null>(null);
  const [tokenValue, setTokenValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const loadCredentials = useCallback(async () => {
    setLoading(true);
    try {
      const creds = await app.listCredentials();
      setConfigured(creds);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [app]);

  useEffect(() => {
    loadCredentials();
  }, [loadCredentials]);

  const handleAddSubmit = useCallback(
    async (value: string) => {
      if (!selectedProvider || !value.trim()) return;

      try {
        const entries =
          selectedProvider === 'vercel' ? [`token=${value.trim()}`] : [value.trim()];
        await app.addCredential(selectedProvider, entries);
        setSuccess(`${selectedProvider} credential saved`);
        setView('list');
        setTokenValue('');
        setSelectedProvider(null);
        await loadCredentials();
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    },
    [app, selectedProvider, loadCredentials],
  );

  if (loading) {
    return <LoadingIndicator message="Loading credentials..." />;
  }

  return (
    <Box flexDirection="column">
      <Text bold>Credentials</Text>

      {error ? <ErrorBox message={error} /> : null}
      {success ? <Text color="green">✓ {success}</Text> : null}

      {view === 'list' && (
        <Box flexDirection="column" marginTop={1}>
          {ALL_PROVIDERS.map((p) => (
            <Text key={p.name}>
              {configured.includes(p.name) ? (
                <Text color="green">✓</Text>
              ) : (
                <Text dimColor>○</Text>
              )}{' '}
              {p.label}
            </Text>
          ))}

          <Box marginTop={1}>
            <SelectInput
              items={[
                { label: 'Add / replace credential', value: 'add' },
                { label: 'Back', value: 'back' },
              ]}
              onSelect={(item) => {
                if (item.value === 'add') {
                  setView('add-select');
                  setError(null);
                  setSuccess(null);
                } else {
                  dispatch({ type: 'back' });
                }
              }}
            />
          </Box>
        </Box>
      )}

      {view === 'add-select' && (
        <Box flexDirection="column" marginTop={1}>
          <Text>Select provider:</Text>
          <SelectInput
            items={ALL_PROVIDERS.map((p) => ({
              label: p.label,
              value: p.name,
            }))}
            onSelect={(item) => {
              setSelectedProvider(item.value);
              setView('add-input');
              setError(null);
            }}
          />
        </Box>
      )}

      {view === 'add-input' && selectedProvider && (
        <Box flexDirection="column" marginTop={1}>
          <Text>
            Enter {selectedProvider} token:
          </Text>
          <Box>
            <Text>Token: </Text>
            <TextInput
              value={tokenValue}
              onChange={setTokenValue}
              onSubmit={handleAddSubmit}
              mask="*"
            />
          </Box>
        </Box>
      )}
    </Box>
  );
}
