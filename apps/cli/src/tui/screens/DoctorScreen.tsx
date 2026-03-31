import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import Spinner from 'ink-spinner';
import { useCliApp } from '../context.js';
import { useNavigation } from '../hooks/use-navigation.js';
import type { TuiAction } from '../types.js';
import type { DoctorResult } from '../../app.js';

const PROVIDER_LABELS: Record<string, string> = {
  neon: 'Database: Neon',
  vercel: 'Hosting: Vercel',
  clerk: 'Auth: Clerk',
  stripe: 'Payments: Stripe',
  cloudflare: 'DNS: Cloudflare',
  resend: 'Email: Resend',
  sentry: 'Error Tracking: Sentry',
  github: 'Repository: GitHub',
};

export function DoctorScreen({
  dispatch,
}: {
  dispatch: React.Dispatch<TuiAction>;
}) {
  const app = useCliApp();
  const { goBack } = useNavigation(dispatch, { disabled: false });
  const [result, setResult] = useState<DoctorResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const doctorResult = await app.doctor();
        if (!cancelled) setResult(doctorResult);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [app]);

  if (error) {
    return (
      <Box flexDirection="column">
        <Text bold>Doctor</Text>
        <Box marginTop={1}>
          <Text color="red">{error}</Text>
        </Box>
        <Box marginTop={1}>
          <Text dimColor>Press esc to go back</Text>
        </Box>
      </Box>
    );
  }

  if (!result) {
    return (
      <Box flexDirection="column">
        <Text bold>Doctor</Text>
        <Box marginTop={1}>
          <Text color="cyan">
            <Spinner type="dots" />
          </Text>
          <Text> Running diagnostics...</Text>
        </Box>
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      <Text bold>Doctor</Text>
      <Box marginTop={1} flexDirection="column">
        <Text>Node.js: <Text color="green">{result.nodeVersion}</Text></Text>
        <Box marginTop={1} flexDirection="column">
          <Text bold>Provider Credentials:</Text>
          {result.checks.map((check) => {
            const label = PROVIDER_LABELS[check.provider] ?? check.provider;

            if (!check.hasCredentials) {
              return (
                <Text key={check.provider} dimColor>
                  {'  '}○ {label} — not configured
                </Text>
              );
            }

            if (check.preflightResult?.valid) {
              return (
                <Text key={check.provider}>
                  {'  '}<Text color="green">✓</Text> {label}
                </Text>
              );
            }

            return (
              <Box key={check.provider} flexDirection="column">
                <Text>
                  {'  '}<Text color="red">✗</Text> {label}
                </Text>
                {check.preflightResult?.errors.map((err, i) => (
                  <Box key={i} flexDirection="column" marginLeft={4}>
                    <Text color="red" dimColor>{err.message}</Text>
                    {err.remediation ? (
                      <Text dimColor>{err.remediation}</Text>
                    ) : null}
                  </Box>
                ))}
              </Box>
            );
          })}
        </Box>
        <Box marginTop={1}>
          {result.allHealthy ? (
            <Text color="green">All configured providers are healthy.</Text>
          ) : (
            <Text color="yellow">Some providers have issues. Fix them before launching.</Text>
          )}
        </Box>
      </Box>
      <Box marginTop={1}>
        <Text dimColor>Press esc to go back</Text>
      </Box>
    </Box>
  );
}
