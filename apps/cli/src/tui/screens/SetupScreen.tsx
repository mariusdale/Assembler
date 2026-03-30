import React, { useState, useEffect, useCallback } from 'react';
import { Box, Text } from 'ink';
import Spinner from 'ink-spinner';
import TextInput from 'ink-text-input';
import { useCliApp } from '../context.js';
import { useNavigation } from '../hooks/use-navigation.js';
import { ErrorBox } from '../components/ErrorBox.js';
import type { TuiAction } from '../types.js';

interface SetupProvider {
  name: string;
  label: string;
  url: string;
}

const SETUP_PROVIDERS: SetupProvider[] = [
  {
    name: 'github',
    label: 'GitHub',
    url: 'https://github.com/settings/tokens/new?scopes=repo',
  },
  {
    name: 'neon',
    label: 'Neon',
    url: 'https://console.neon.tech/app/settings/api-keys',
  },
  {
    name: 'vercel',
    label: 'Vercel',
    url: 'https://vercel.com/account/tokens',
  },
];

type SetupPhase = 'checking' | 'input' | 'validating' | 'done' | 'error';

export function SetupScreen({
  dispatch,
}: {
  dispatch: React.Dispatch<TuiAction>;
}) {
  const app = useCliApp();
  const { goBack } = useNavigation(dispatch);
  const [currentStep, setCurrentStep] = useState(0);
  const [phase, setPhase] = useState<SetupPhase>('checking');
  const [tokenValue, setTokenValue] = useState('');
  const [configuredProviders, setConfiguredProviders] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const provider = SETUP_PROVIDERS[currentStep];

  // Check existing credentials
  useEffect(() => {
    if (phase !== 'checking' || !provider) return;

    (async () => {
      try {
        const creds = await app.listCredentials();
        setConfiguredProviders(creds);

        if (creds.includes(provider.name)) {
          // Already configured, try to validate
          setPhase('validating');
          try {
            await app.discover(provider.name);
            // Valid — move to next
            advanceStep();
          } catch {
            // Invalid — ask for new token
            setPhase('input');
          }
        } else {
          setPhase('input');
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        setPhase('error');
      }
    })();
  }, [phase, currentStep]);

  const advanceStep = useCallback(() => {
    if (currentStep < SETUP_PROVIDERS.length - 1) {
      setCurrentStep((s) => s + 1);
      setPhase('checking');
      setTokenValue('');
      setError(null);
    } else {
      setPhase('done');
    }
  }, [currentStep]);

  const handleTokenSubmit = useCallback(
    async (value: string) => {
      if (!provider || !value.trim()) return;

      setPhase('validating');
      try {
        const entries =
          provider.name === 'vercel' ? [`token=${value.trim()}`] : [value.trim()];
        await app.addCredential(provider.name, entries);
        await app.discover(provider.name);
        advanceStep();
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        setPhase('input');
      }
    },
    [app, provider, advanceStep],
  );

  if (!provider && phase !== 'done') {
    return <Text>Setup complete.</Text>;
  }

  return (
    <Box flexDirection="column">
      <Text bold>Setup</Text>

      {/* Step indicator */}
      <Box marginTop={1}>
        {SETUP_PROVIDERS.map((p, i) => (
          <Text key={p.name}>
            {i < currentStep ? (
              <Text color="green">[{i + 1}/{SETUP_PROVIDERS.length}] {p.label}</Text>
            ) : i === currentStep ? (
              <Text color="cyan">[{i + 1}/{SETUP_PROVIDERS.length}] {p.label}</Text>
            ) : (
              <Text dimColor>[{i + 1}/{SETUP_PROVIDERS.length}] {p.label}</Text>
            )}
            {i < SETUP_PROVIDERS.length - 1 ? <Text dimColor>  →  </Text> : null}
          </Text>
        ))}
      </Box>

      <Box marginTop={1} flexDirection="column">
        {phase === 'checking' && (
          <Box>
            <Text color="cyan"><Spinner type="dots" /></Text>
            <Text> Checking {provider?.label} credentials...</Text>
          </Box>
        )}

        {phase === 'validating' && (
          <Box>
            <Text color="cyan"><Spinner type="dots" /></Text>
            <Text> Validating {provider?.label} token...</Text>
          </Box>
        )}

        {phase === 'input' && provider && (
          <Box flexDirection="column">
            <Text>
              Get your {provider.label} token from:
            </Text>
            <Text color="cyan">  {provider.url}</Text>
            {error ? <ErrorBox message={error} /> : null}
            <Box marginTop={1}>
              <Text>Paste token: </Text>
              <TextInput
                value={tokenValue}
                onChange={setTokenValue}
                onSubmit={handleTokenSubmit}
                mask="*"
              />
            </Box>
          </Box>
        )}

        {phase === 'done' && (
          <Box flexDirection="column">
            <Text color="green" bold>✓ Setup complete!</Text>
            <Text dimColor>All provider credentials are configured.</Text>
            <Text dimColor>Press esc to return to menu, then select Launch.</Text>
          </Box>
        )}

        {phase === 'error' && error && (
          <ErrorBox message={error} />
        )}
      </Box>
    </Box>
  );
}
