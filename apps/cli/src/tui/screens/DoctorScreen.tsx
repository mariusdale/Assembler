import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import Spinner from 'ink-spinner';
import { useCliApp } from '../context.js';
import { useNavigation } from '../hooks/use-navigation.js';
import type { TuiAction } from '../types.js';
import type { DoctorResult } from '../../app.js';
import { labelFramework, labelProvider } from '../../labels.js';

export function DoctorScreen({
  dispatch,
}: {
  dispatch: React.Dispatch<TuiAction>;
}) {
  const app = useCliApp();
  useNavigation(dispatch, { disabled: false });
  const [result, setResult] = useState<DoctorResult | null>(null);
  const [scan, setScan] = useState<{
    framework: string;
    lockfileCheck: { lockfileExists: boolean; inSync: boolean };
    packageJson?: Record<string, unknown>;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const [doctorResult, projectScan] = await Promise.all([app.doctor(), app.scan()]);
        if (!cancelled) {
          setResult(doctorResult);
          setScan(projectScan);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
        }
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

  if (!result || !scan) {
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

  const scripts = scan.packageJson?.scripts as Record<string, unknown> | undefined;
  const hasBuildScript = typeof scripts?.build === 'string' && scripts.build.trim() !== '';
  const providerIssues = result.checks.filter(
    (check) => check.hasCredentials && check.preflightResult?.valid === false,
  );
  const missingRequiredProviders = result.checks.filter(
    (check) => ['github', 'vercel'].includes(check.provider) && !check.hasCredentials,
  );
  const projectReady =
    scan.framework === 'nextjs' &&
    scan.lockfileCheck.lockfileExists &&
    scan.lockfileCheck.inSync &&
    hasBuildScript;
  const overallHealthy =
    result.configCheck.valid &&
    projectReady &&
    providerIssues.length === 0 &&
    missingRequiredProviders.length === 0;

  return (
    <Box flexDirection="column">
      <Text bold>Doctor</Text>
      <Text dimColor>Review the project gate first, then confirm required providers are connected and healthy.</Text>

      <Panel title="Project Readiness" borderColor={projectReady ? 'green' : 'red'}>
        <CheckRow label="Framework" ok={scan.framework === 'nextjs'} detail={scan.framework === 'nextjs' ? 'Next.js' : `Detected ${labelFramework(scan.framework)}`} />
        <CheckRow label="Lockfile" ok={scan.lockfileCheck.lockfileExists} detail={scan.lockfileCheck.lockfileExists ? 'Present' : 'Missing'} />
        <CheckRow label="Lockfile sync" ok={scan.lockfileCheck.inSync} detail={scan.lockfileCheck.inSync ? 'In sync' : 'Out of sync'} />
        <CheckRow label="Build script" ok={hasBuildScript} detail={hasBuildScript ? 'Configured' : 'Missing from package.json'} />
      </Panel>

      <Panel title="Project Configuration" borderColor={result.configCheck.valid ? 'cyan' : 'red'}>
        {!result.configCheck.filePath ? (
          <Text dimColor>○ No project config found</Text>
        ) : result.configCheck.valid ? (
          <Text>
            <Text color="green">✓</Text> {result.configCheck.filePath}
          </Text>
        ) : (
          <Box flexDirection="column">
            <Text>
              <Text color="red">✗</Text> {result.configCheck.filePath}
            </Text>
            {result.configCheck.issues.map((issue) => (
              <Text key={issue} color="red">
                {issue}
              </Text>
            ))}
          </Box>
        )}
      </Panel>

      <Panel title="Provider Readiness" borderColor={providerIssues.length === 0 ? 'cyan' : 'yellow'}>
        {result.checks.map((check) => {
          const label = labelProvider(check.provider);

          if (!check.hasCredentials) {
            return (
              <Text key={check.provider} dimColor>
                ○ {label} — not configured
              </Text>
            );
          }

          if (check.preflightResult?.valid) {
            return (
              <Text key={check.provider}>
                <Text color="green">✓</Text> {label}
              </Text>
            );
          }

          return (
            <Box key={check.provider} flexDirection="column" marginBottom={1}>
              <Text>
                <Text color="red">✗</Text> {label}
              </Text>
              {(check.preflightResult?.errors ?? []).map((issue) => (
                <Box key={`${check.provider}-${issue.code}`} flexDirection="column" marginLeft={2}>
                  <Text color="red">{issue.message}</Text>
                  <Text dimColor>{issue.remediation}</Text>
                </Box>
              ))}
            </Box>
          );
        })}
      </Panel>

      <Panel title="Verdict" borderColor={overallHealthy ? 'green' : 'yellow'}>
        <Text color={overallHealthy ? 'green' : 'yellow'} bold>
          {overallHealthy ? 'Ready for launch' : 'Action required before launch'}
        </Text>
        {!projectReady ? (
          <Text dimColor>Resolve the project readiness checks above before starting a launch.</Text>
        ) : null}
        {!result.configCheck.valid ? (
          <Text dimColor>Fix project configuration issues before launching.</Text>
        ) : null}
        {missingRequiredProviders.length > 0 ? (
          <Text dimColor>Connect GitHub and Vercel credentials in the Credentials screen before launching.</Text>
        ) : null}
        {providerIssues.length > 0 ? (
          <Text dimColor>Fix provider issues before retrying launch or preview flows.</Text>
        ) : null}
        {overallHealthy ? (
          <Text dimColor>Recommended next command: assembler launch</Text>
        ) : (
          <Text dimColor>Recommended next command: assembler doctor</Text>
        )}
      </Panel>

      <Box marginTop={1}>
        <Text dimColor>Press esc to go back</Text>
      </Box>
    </Box>
  );
}

function Panel({
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

function CheckRow({
  label,
  ok,
  detail,
}: {
  label: string;
  ok: boolean;
  detail: string;
}) {
  return (
    <Text>
      <Text color={ok ? 'green' : 'red'}>{ok ? '✓' : '✗'}</Text> {label}
      <Text dimColor>{` — ${detail}`}</Text>
    </Text>
  );
}
