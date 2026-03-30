import React, { useState, useCallback } from 'react';
import { Box, Text } from 'ink';
import TextInput from 'ink-text-input';
import { useCliApp } from '../context.js';
import { useNavigation } from '../hooks/use-navigation.js';
import { LoadingIndicator } from '../components/LoadingIndicator.js';
import { ErrorBox } from '../components/ErrorBox.js';
import type { TuiAction } from '../types.js';

type DomainPhase = 'input' | 'adding' | 'result' | 'error';

export function DomainScreen({
  dispatch,
}: {
  dispatch: React.Dispatch<TuiAction>;
}) {
  const app = useCliApp();
  useNavigation(dispatch);
  const [phase, setPhase] = useState<DomainPhase>('input');
  const [domain, setDomain] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    domain: string;
    dnsRecordCreated: boolean;
    vercelDomainAdded: boolean;
    verified: boolean;
  } | null>(null);

  const handleSubmit = useCallback(
    async (value: string) => {
      if (!value.trim()) return;
      setPhase('adding');
      try {
        const res = await app.domainAdd(value.trim());
        setResult(res);
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
      <Text bold>Custom Domain</Text>

      <Box marginTop={1} flexDirection="column">
        {phase === 'input' && (
          <Box flexDirection="column">
            <Text>Enter your domain:</Text>
            <Box>
              <Text>{`> `}</Text>
              <TextInput
                value={domain}
                onChange={setDomain}
                onSubmit={handleSubmit}
                placeholder="example.com"
              />
            </Box>
          </Box>
        )}

        {phase === 'adding' && (
          <LoadingIndicator message={`Configuring ${domain}...`} />
        )}

        {phase === 'result' && result && (
          <Box flexDirection="column">
            <Text color="green" bold>✓ Domain configured</Text>
            <Text>
              {result.dnsRecordCreated ? (
                <Text color="green">✓</Text>
              ) : (
                <Text color="red">✗</Text>
              )}{' '}
              DNS record created
            </Text>
            <Text>
              {result.vercelDomainAdded ? (
                <Text color="green">✓</Text>
              ) : (
                <Text color="red">✗</Text>
              )}{' '}
              Vercel domain added
            </Text>
            <Text>
              {result.verified ? (
                <Text color="green">✓</Text>
              ) : (
                <Text color="yellow">○</Text>
              )}{' '}
              DNS verified
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
